/**
 * framing.js: RELATIVE framing of a viewport, the way a DICOM workstation does it.
 *
 * WHY IT EXISTS. OHIF stores framing as a pan in CANVAS PIXELS plus a zoom relative to
 * fit. Pixels stop meaning anything the moment the cell changes size: a prior study
 * opened alongside (the cell goes from 691 to 260 px, and a series pushed to the edge
 * ends up outside), one-up toggled (the cell grows, the zoom scales with the fit but
 * the pan stays in pixels, so the image appears to move), a hanging protocol applied
 * in a cell of a different size from the one it was saved in. The DICOM standard
 * (Displayed Area Selection, and Display Set Horizontal and Vertical Justification)
 * models framing in RELATIVE form. This module does the same.
 *
 * THE MODEL. A framing is { v:3, cell:[cw,ch], fill:[fx,fy], x:{...}, y:{...} }:
 *   cell/fill = the cell's size at capture, and how much of it the image fills on each
 *            axis. The zoom is re-derived by keeping the fill on whichever cell axis
 *            CHANGED LEAST between capture and application. With a prior alongside only
 *            the width changes, so the height is kept and the image stays the same size
 *            (running over on the width, anchored to the edge). In one-up both grow, so
 *            it grows with the box. This holds for any image orientation and any zoom,
 *            and it is symmetric: closing the prior brings the size back.
 *            The "dominant axis" rules tried before failed: a cell narrower than the
 *            image changes which axis dominates and shrinks every image by a factor of
 *            its OWN (two CC views side by side came out misaligned), and a recapture
 *            in the narrow cell blew the image up when it closed. This is the DICOM
 *            "Presentation Size Mode" reading: the scale does not change because the
 *            frame around it changed.
 *   x / y  = continuous justification per axis (the DICOM Display Set Justification
 *            model, without the steps):
 *            - mode 'ratio': the image sits inside the cell, or covers it entirely.
 *              t is the share of free space to the left or above. 0 is the near edge,
 *              1 the far edge, 0.5 the centre. It holds when the image covers the cell
 *              too, where the free space is negative: the same split of the overflow is
 *              kept, so a detail in the middle stays in the middle.
 *            - mode 'edge': the image runs over ONE side only, partly outside. What is
 *              kept is the overflow relative to the image on that side, so the visible
 *              portion stays the same.
 *
 * RULES OF LIFE, the ones that matter:
 *   1. Only the reader changes the framing (pan, zoom, reset, hanging protocol). A
 *      change of geometry never changes it: it RE-APPLIES it by recomputing the camera.
 *   2. Anti-drift reconciliation: framingBeforeResize() reuses the stored framing when
 *      the current camera is still the one derived from it, meaning nobody has touched
 *      anything. One-up and back is then reversible to the pixel, with no ratchet. If
 *      the reader has touched it, it is captured again.
 *   3. No state inside cornerstone (no options.displayArea): reset, zoom 1:1, the
 *      indicators and the synchronisers all stay as they were.
 *   4. Measurements come ONLY from cornerstone state (sWidth/sHeight plus
 *      worldToCanvas), never from canvas.clientWidth: during a resize the CSS is
 *      already new while the projection is still old, and mixing them gives numbers
 *      that mean nothing. That was a real bug in the previous patch. Before the
 *      engine's resize, sWidth and the projection agree with each other, both old;
 *      afterwards, both new.
 *
 * SCOPE. GPU StackViewport only (vp.type === 'stack', no CPU fallback): volume, MPR,
 * 3D, video and WSI keep the behaviour they have. Every function is defensive: on any
 * doubt it returns null or false and touches nothing.
 * Emergency switch: window.mdvFramingOff = true, with nothing to recompile.
 */

const EDGE_EPS = 0.5; // mezzo px: sotto, una differenza non è percepibile

export const framingSupported = vp =>
  !!vp &&
  vp.type === 'stack' &&
  !vp.useCPURendering &&
  typeof vp.worldToCanvas === 'function' &&
  typeof vp.canvasToWorld === 'function' &&
  typeof vp.getCamera === 'function' &&
  vp.sWidth > 0 &&
  vp.sHeight > 0;

// Cell size in CSS pixels, matching worldToCanvas (on GPU, sWidth = clientWidth * dpr).
const cellSize = vp => {
  const dpr = window.devicePixelRatio || 1;
  return { cw: vp.sWidth / dpr, ch: vp.sHeight / dpr };
};

// The image's bounding box on the canvas, from opposite corners (the same convention
// cornerstone uses in setDisplayAreaFit, correct for rotations that are multiples of 90).
const imageBBox = vp => {
  try {
    const imageData = vp.getImageData?.()?.imageData;
    if (!imageData || typeof imageData.indexToWorld !== 'function') {
      return null;
    }
    const dim = imageData.getDimensions();
    const a = vp.worldToCanvas(imageData.indexToWorld([0, 0, 0]));
    const b = vp.worldToCanvas(imageData.indexToWorld([dim[0], dim[1], dim[2]]));
    if (![a, b].every(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
      return null;
    }
    const left = Math.min(a[0], b[0]);
    const top = Math.min(a[1], b[1]);
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    return w > 0 && h > 0 ? { left, top, w, h } : null;
  } catch (err) {
    return null;
  }
};

const axisCapture = (lo, extent, cell) => {
  const gStart = lo; // the gap at the near edge, or the overhang if negative
  const gEnd = cell - lo - extent; // the same at the far edge
  const inside = gStart >= -EDGE_EPS && gEnd >= -EDGE_EPS;
  const covers = gStart <= EDGE_EPS && gEnd <= EDGE_EPS;
  const free = cell - extent;
  if ((inside || covers) && Math.abs(free) > EDGE_EPS) {
    // t is in [0,1] by construction, tolerance aside. The clamp keeps it away from
    // ill-conditioned values when the free space is a few pixels.
    return { mode: 'ratio', t: Math.min(1, Math.max(0, gStart / free)) };
  }
  if (inside || covers) {
    return { mode: 'ratio', t: 0.5 }; // combacia esattamente: irrilevante
  }
  const side = gStart < 0 ? 'start' : 'end';
  return { mode: 'edge', side, over: (side === 'start' ? gStart : gEnd) / extent };
};

/** Photographs the current framing in relative form, or null if it cannot be measured. */
export const captureFraming = vp => {
  try {
    if (!framingSupported(vp)) {
      return null;
    }
    const { cw, ch } = cellSize(vp);
    const bb = imageBBox(vp);
    if (!bb || !(cw > 0 && ch > 0)) {
      return null;
    }
    const framing = {
      v: 3,
      cell: [cw, ch],
      fill: [bb.w / cw, bb.h / ch],
      x: axisCapture(bb.left, bb.w, cw),
      y: axisCapture(bb.top, bb.h, ch),
    };
    const nums = [...framing.fill, framing.x.t ?? framing.x.over, framing.y.t ?? framing.y.over];
    return nums.every(Number.isFinite) && framing.fill.every(v => v > 0) ? framing : null;
  } catch (err) {
    return null;
  }
};

// Where the near edge should sit on one axis, at the sizes it has now.
const axisTarget = (axis, extent, cell) => {
  if (axis.mode === 'edge') {
    // Keeps the overflow, relative to the image, on the side it runs over.
    return axis.side === 'start' ? axis.over * extent : cell - extent - axis.over * extent;
  }
  // The same split of the free space, or of the overflow when it is negative.
  return axis.t * (cell - extent);
};

// Framings saved in the earlier formats (v1 and v2, from trial sessions only) are
// converted on the fly. With no `cell` it uses the axis given, or the height.
const upgradeFraming = f => {
  if (!f || f.v === 3) {
    return f;
  }
  const conv = a =>
    a && a.mode ? a : { mode: 'ratio', t: a && Number.isFinite(a.gap) ? a.gap : 0.5 };
  return { v: 3, cell: null, axis: f.axis === 'x' ? 0 : 1, fill: [f.r, f.r], x: conv(f.x), y: conv(f.y) };
};

// Which axis (0 for x, 1 for y) keeps its fill: the one whose cell size changed least
// since the capture.
const scaleAxis = (f, cw, ch) => {
  if (f.cell && f.cell[0] > 0 && f.cell[1] > 0) {
    const kx = Math.abs(Math.log(cw / f.cell[0]));
    const ky = Math.abs(Math.log(ch / f.cell[1]));
    return kx <= ky ? 0 : 1;
  }
  return f.axis === 0 ? 0 : 1;
};

// setCamera without letting CAMERA_MODIFIED out: this stops a zoom or pan sync group
// copying one cell's correction onto the others while they are being fixed one at a
// time. Cornerstone uses the same trick inside setDisplayArea.
const withCameraEventsSuppressed = (vp, fn) => {
  const prev = vp._suppressCameraModifiedEvents;
  vp._suppressCameraModifiedEvents = true;
  try {
    fn();
  } finally {
    vp._suppressCameraModifiedEvents = prev;
  }
};

// A snapshot of the camera WE derived. Besides zoom and centre it carries orientation
// and flip, because a roll or a flip changes only viewUp and the flip flags, leaving
// focalPoint and parallelScale alone: without comparing those, the reconciliation would
// reuse a framing measured BEFORE the rotation.
const snapshotCamera = vp => {
  const c = vp.getCamera();
  return {
    ps: c.parallelScale,
    fp: [...c.focalPoint],
    up: Array.isArray(c.viewUp) ? [...c.viewUp] : null,
    n: Array.isArray(c.viewPlaneNormal) ? [...c.viewPlaneNormal] : null,
    fh: !!c.flipHorizontal,
    fv: !!c.flipVertical,
  };
};

const sameVec = (a, b) =>
  !a || !b || (a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1e-6));

const cameraMatches = (vp, snap) => {
  if (!snap) {
    return false;
  }
  try {
    const c = vp.getCamera();
    const tol = Math.max(1e-6, snap.ps * 2e-3);
    return (
      Math.abs(c.parallelScale - snap.ps) <= tol &&
      Math.hypot(
        c.focalPoint[0] - snap.fp[0],
        c.focalPoint[1] - snap.fp[1],
        c.focalPoint[2] - snap.fp[2]
      ) <= tol &&
      !!c.flipHorizontal === snap.fh &&
      !!c.flipVertical === snap.fv &&
      sameVec(Array.isArray(c.viewUp) ? c.viewUp : null, snap.up) &&
      sameVec(Array.isArray(c.viewPlaneNormal) ? c.viewPlaneNormal : null, snap.n)
    );
  } catch (err) {
    return false;
  }
};

// viewportId to { framing, applied }, where applied is the camera we derived ourselves.
const _store = new Map();

/**
 * To be called BEFORE the engine's resize, while the old state is still coherent.
 * Reuses the stored framing when the reader has not touched the camera since it was
 * last applied, which is what makes it reversible; otherwise it captures again.
 */
export const framingBeforeResize = vp => {
  try {
    if (typeof window !== 'undefined' && window.mdvFramingOff) {
      return null;
    }
    if (!framingSupported(vp)) {
      return null;
    }
    const prev = _store.get(vp.id);
    if (prev && cameraMatches(vp, prev.applied)) {
      return prev.framing;
    }
    const fresh = captureFraming(vp);
    if (fresh) {
      _store.set(vp.id, { framing: fresh, applied: null });
    }
    return fresh;
  } catch (err) {
    return null;
  }
};

/**
 * Recomputes the camera from the relative framing, against the CURRENT size.
 * Returns true when the framing was handled, even if nothing needed moving; false only
 * when it does not apply, and then the caller should use its own fallback.
 */
export const applyFraming = (vp, framing) => {
  try {
    if (typeof window !== 'undefined' && window.mdvFramingOff) {
      return false;
    }
    framing = upgradeFraming(framing);
    if (!framing || !framing.x || !framing.y || !framingSupported(vp)) {
      return false;
    }
    const fill = Array.isArray(framing.fill) ? framing.fill : null;
    if (!fill || !fill.every(v => Number.isFinite(v) && v > 0)) {
      return false;
    }
    const { cw, ch } = cellSize(vp);
    let bb = imageBBox(vp);
    if (!bb || !(cw > 0 && ch > 0)) {
      return false;
    }
    // 1) Zoom: keep the fill on whichever cell axis changed least.
    const axis = scaleAxis(framing, cw, ch);
    const rTarget = fill[axis];
    const rNow = axis === 0 ? bb.w / cw : bb.h / ch;
    if (rNow > 0 && Math.abs(rTarget / rNow - 1) > 1e-3) {
      const scale = rTarget / rNow; // a factor on the size as drawn
      const cam = vp.getCamera();
      withCameraEventsSuppressed(vp, () =>
        vp.setCamera({ parallelScale: cam.parallelScale / scale })
      );
      bb = imageBBox(vp);
      if (!bb) {
        _store.set(vp.id, { framing, applied: snapshotCamera(vp) });
        return true;
      }
    }
    // 2) Position: move the camera by the world delta matching the missing pixels.
    const dx = axisTarget(framing.x, bb.w, cw) - bb.left;
    const dy = axisTarget(framing.y, bb.h, ch) - bb.top;
    if (Math.abs(dx) > EDGE_EPS || Math.abs(dy) > EDGE_EPS) {
      const o = vp.canvasToWorld([0, 0]);
      const p = vp.canvasToWorld([dx, dy]);
      const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
      if (d.every(Number.isFinite)) {
        const cam = vp.getCamera();
        withCameraEventsSuppressed(vp, () =>
          vp.setCamera({
            focalPoint: [
              cam.focalPoint[0] - d[0],
              cam.focalPoint[1] - d[1],
              cam.focalPoint[2] - d[2],
            ],
            position: [
              cam.position[0] - d[0],
              cam.position[1] - d[1],
              cam.position[2] - d[2],
            ],
          })
        );
      }
    }
    _store.set(vp.id, { framing, applied: snapshotCamera(vp) });
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Emits ONE consolidated CAMERA_MODIFIED after the corrections, which are made with
 * events suppressed. Anything showing camera state needs it, the zoom indicator in the
 * overlay for instance, which would otherwise sit at the previous value. Cornerstone
 * uses the same technique at the end of setDisplayArea. Call it once EVERY viewport is
 * settled, so any sync group copies the final state rather than a passing one.
 */
export const notifyFramingApplied = vp => {
  try {
    if (vp && typeof vp.setCamera === 'function' && typeof vp.getCamera === 'function') {
      vp.setCamera(vp.getCamera());
    }
  } catch (err) {
    /* best-effort */
  }
};

/** To be called when the viewport changes content: a new series on the same id. */
export const clearFraming = viewportId => {
  _store.delete(viewportId);
};
