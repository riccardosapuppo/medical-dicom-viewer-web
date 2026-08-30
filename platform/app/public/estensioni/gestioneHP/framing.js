/**
 * framing.js — Inquadratura RELATIVA delle viewport (modello "workstation DICOM").
 *
 * PERCHÉ ESISTE. OHIF memorizza l'inquadratura come pan in PIXEL CANVAS + zoom
 * relativo al fit. I pixel perdono significato appena la cella cambia dimensione:
 * storico affiancato (cella 691→260 px: la serie portata al bordo finisce fuori),
 * toggle one-up (la cella cresce, lo zoom scala col fit ma il pan resta in px →
 * l'immagine "cambia posizione"), HP applicato in una cella diversa da quella del
 * salvataggio. Lo standard DICOM (Displayed Area Selection + Display Set
 * Horizontal/Vertical Justification) modella l'inquadratura in forma RELATIVA:
 * questo modulo fa lo stesso.
 *
 * IL MODELLO. Un'inquadratura è { v:3, cell:[cw,ch], fill:[fx,fy], x:{...}, y:{...} }:
 *   cell/fill = dimensione della cella alla cattura e quanto l'immagine la
 *            riempie su ciascun asse. Lo zoom viene ri-derivato conservando il
 *            riempimento sull'asse della cella CAMBIATO DI MENO fra cattura e
 *            applicazione: nello storico cambia solo la larghezza → si conserva
 *            l'altezza → stessa grandezza (sborda in larghezza, ancorata al
 *            bordo); nel one-up crescono entrambe → cresce col riquadro. Vale
 *            per qualsiasi orientamento dell'immagine e qualsiasi zoom, ed è
 *            simmetrico (chiudere lo storico riporta alla grandezza di prima).
 *            Le regole "asse dominante" tentate prima fallivano: una cella più
 *            stretta dell'immagine cambia l'asse dominante e rimpicciolisce
 *            ogni immagine di un fattore SUO (due CC affiancate disallineate),
 *            e una ricattura nella cella stretta gonfiava l'immagine alla
 *            chiusura. È la semantica DICOM "Presentation Size Mode": la scala
 *            non cambia perché è cambiata la cornice.
 *   x / y  = giustificazione continua per asse (modello DICOM Display Set
 *            Justification, ma senza scatti):
 *            - mode 'ratio': l'immagine sta nella cella (o la copre tutta):
 *              t = quota dello spazio libero a sinistra/sopra. 0 = bordo
 *              iniziale, 1 = bordo finale, 0.5 = centro. Vale anche quando
 *              l'immagine copre la cella (spazio libero negativo): conserva la
 *              stessa ripartizione dello sbordo → un dettaglio centrato resta
 *              centrato.
 *            - mode 'edge': l'immagine sborda da UN lato solo (parzialmente
 *              fuori): si conserva lo sbordo relativo all'immagine su quel
 *              lato → la porzione visibile resta la stessa.
 *
 * REGOLE DI VITA (le più importanti):
 *   1. L'inquadratura la cambia SOLO l'utente (pan/zoom/reset/HP). Un cambio di
 *      geometria non la cambia mai: la RI-APPLICA ricalcolando la camera.
 *   2. Riconciliazione anti-deriva: framingBeforeResize() riusa l'inquadratura
 *      memorizzata se la camera corrente è ancora quella derivata da noi
 *      (l'utente non ha toccato nulla) → one-up e ritorno sono reversibili al
 *      pixel, nessun effetto cricchetto. Se l'utente ha toccato, si ricattura.
 *   3. Nessuno stato dentro cornerstone (niente options.displayArea): Reset,
 *      zoom 1:1, indicatori e sincronizzatori restano com'erano.
 *   4. Misure SOLO dallo stato cornerstone (sWidth/sHeight + worldToCanvas),
 *      mai da canvas.clientWidth: durante un resize il CSS è già nuovo mentre
 *      la proiezione è ancora vecchia, e mischiarli produce misure senza senso
 *      (bug verificato della patch precedente). Prima del resize dell'engine
 *      sWidth e proiezione sono COERENTI fra loro (entrambi "vecchi"); dopo,
 *      entrambi nuovi.
 *
 * PERIMETRO. Solo StackViewport GPU (vp.type === 'stack', no fallback CPU):
 * volume/MPR/3D/video/WSI restano al comportamento attuale. Ogni funzione è
 * difensiva: su qualunque dubbio ritorna null/false e non tocca nulla.
 * Interruttore d'emergenza: window.mdvFramingOff = true (nessuna ricompilazione).
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

// Dimensioni cella in px CSS, coerenti con worldToCanvas (GPU: sWidth = clientWidth*dpr).
const cellSize = vp => {
  const dpr = window.devicePixelRatio || 1;
  return { cw: vp.sWidth / dpr, ch: vp.sHeight / dpr };
};

// Bbox dell'immagine sul canvas via angoli opposti (stessa convenzione di
// cornerstone in setDisplayAreaFit: corretta per rotazioni multiple di 90°).
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
  const gStart = lo; // spazio (o sbordo, se negativo) sul bordo iniziale
  const gEnd = cell - lo - extent; // idem sul bordo finale
  const inside = gStart >= -EDGE_EPS && gEnd >= -EDGE_EPS;
  const covers = gStart <= EDGE_EPS && gEnd <= EDGE_EPS;
  const free = cell - extent;
  if ((inside || covers) && Math.abs(free) > EDGE_EPS) {
    // t e' in [0,1] per costruzione (a meno della tolleranza): il clamp evita
    // valori mal condizionati quando lo spazio libero e' di pochi px.
    return { mode: 'ratio', t: Math.min(1, Math.max(0, gStart / free)) };
  }
  if (inside || covers) {
    return { mode: 'ratio', t: 0.5 }; // combacia esattamente: irrilevante
  }
  const side = gStart < 0 ? 'start' : 'end';
  return { mode: 'edge', side, over: (side === 'start' ? gStart : gEnd) / extent };
};

/** Fotografa l'inquadratura corrente in forma relativa (null se non misurabile). */
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

// Bordo sinistro/alto voluto per un asse, date le dimensioni ATTUALI.
const axisTarget = (axis, extent, cell) => {
  if (axis.mode === 'edge') {
    // Conserva lo sbordo (relativo all'immagine) sul lato da cui sborda.
    return axis.side === 'start' ? axis.over * extent : cell - extent - axis.over * extent;
  }
  // Stessa ripartizione dello spazio libero (o dello sbordo, se negativo).
  return axis.t * (cell - extent);
};

// Inquadrature salvate dai formati precedenti (v1/v2, solo sessioni di prova):
// convertite al volo. Senza `cell` si usa l'asse indicato (o l'altezza).
const upgradeFraming = f => {
  if (!f || f.v === 3) {
    return f;
  }
  const conv = a =>
    a && a.mode ? a : { mode: 'ratio', t: a && Number.isFinite(a.gap) ? a.gap : 0.5 };
  return { v: 3, cell: null, axis: f.axis === 'x' ? 0 : 1, fill: [f.r, f.r], x: conv(f.x), y: conv(f.y) };
};

// Asse (0 = x, 1 = y) su cui conservare il riempimento: quello la cui
// dimensione di cella è cambiata di meno rispetto alla cattura.
const scaleAxis = (f, cw, ch) => {
  if (f.cell && f.cell[0] > 0 && f.cell[1] > 0) {
    const kx = Math.abs(Math.log(cw / f.cell[0]));
    const ky = Math.abs(Math.log(ch / f.cell[1]));
    return kx <= ky ? 0 : 1;
  }
  return f.axis === 0 ? 0 : 1;
};

// setCamera senza propagare CAMERA_MODIFIED: evita che un sync-group zoom/pan
// copi la correzione di una cella sulle altre mentre le stiamo sistemando una a
// una (stessa tecnica usata da cornerstone dentro setDisplayArea).
const withCameraEventsSuppressed = (vp, fn) => {
  const prev = vp._suppressCameraModifiedEvents;
  vp._suppressCameraModifiedEvents = true;
  try {
    fn();
  } finally {
    vp._suppressCameraModifiedEvents = prev;
  }
};

// Snapshot della camera che ABBIAMO derivato: oltre a zoom e centro include
// orientamento e flip, perche' una rotazione (roll) o un flip cambiano solo
// viewUp/flip* lasciando focalPoint e parallelScale intatti: senza confrontarli
// la riconciliazione riuserebbe un'inquadratura misurata PRIMA della rotazione.
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

// viewportId → { framing, applied } (applied = camera che ABBIAMO derivato noi).
const _store = new Map();

/**
 * Da chiamare PRIMA del resize dell'engine (stato "vecchio" coerente).
 * Riusa l'inquadratura memorizzata se l'utente non ha toccato la camera
 * dall'ultima applicazione (reversibilità), altrimenti ricattura.
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
 * Ricalcola la camera dall'inquadratura relativa, sulle dimensioni ATTUALI.
 * Ritorna true se l'inquadratura è stata gestita (anche se non serviva muovere
 * nulla); false solo se non applicabile (il chiamante usi il suo fallback).
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
    // 1) Zoom: conserva il riempimento sull'asse di cella cambiato di meno.
    const axis = scaleAxis(framing, cw, ch);
    const rTarget = fill[axis];
    const rNow = axis === 0 ? bb.w / cw : bb.h / ch;
    if (rNow > 0 && Math.abs(rTarget / rNow - 1) > 1e-3) {
      const scale = rTarget / rNow; // fattore sulla dimensione a schermo
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
    // 2) Posizione: sposta la camera del delta mondo corrispondente ai px mancanti.
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
 * Emette UN evento CAMERA_MODIFIED consolidato dopo le correzioni (che avvengono
 * a eventi soppressi): serve a chi mostra lo stato camera, es. l'indicatore di
 * zoom in overlay, che altrimenti resterebbe fermo al valore precedente. Stessa
 * tecnica di cornerstone a fine setDisplayArea. Da chiamare quando TUTTE le
 * viewport sono gia' sistemate, cosi' eventuali sync-group copiano lo stato finale.
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

/** Da chiamare quando la viewport cambia contenuto (nuova serie sullo stesso id). */
export const clearFraming = viewportId => {
  _store.delete(viewportId);
};
