import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { SwitchButton } from '@ohif/ui';
import {
  Enums,
  metaData,
  utilities as csUtils,
  eventTarget as csEventTarget,
  getEnabledElementByIds as csGetEnabledElementByIds,
  getEnabledElements as csGetEnabledElements,
} from '@cornerstonejs/core';
import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import { ColorbarProps } from '../../types/Colorbar';

const DEBUG_STORAGE_KEY = 'mdv-debug-print';

function isFavouritesDebugEnabled(): boolean {
  try {
    const win = window as Window & { __MDV_PRINT_DEBUG__?: boolean };
    return win.__MDV_PRINT_DEBUG__ === true || localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function logFavouritesDebug(...args: unknown[]): void {
  if (!isFavouritesDebugEnabled()) {
    return;
  }
  console.log('[FavouritesCapture]', ...args);
}

export async function captureImageFromImageId(imageId, viewport) {
  if (!imageId || !csUtils.loadImageToCanvas) {
    return null;
  }

  const canvas = document.createElement('canvas');
  const imageData = viewport?.getImageData?.();
  const dimensions = imageData?.dimensions;
  if (Array.isArray(dimensions) && dimensions.length >= 2) {
    canvas.width = dimensions[0];
    canvas.height = dimensions[1];
  } else {
    canvas.width = 1024;
    canvas.height = 1024;
  }

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  try {
    await csUtils.loadImageToCanvas({
      canvas,
      imageId,
      useCPURendering: true,
      requestType: Enums.RequestType.Thumbnail,
    });
  } catch (error) {
    console.warn('Favourites: failed to render image for capture', error);
    return null;
  }

  return canvas.toDataURL('image/png');
}

// Captures the whole viewport, annotations included.
// Base: a render of the cornerstone canvas, the viewport's own geometry.
// Overlay: the SVG annotation layer, with computed style inlined.
//
// About the `viewport` parameter: when it is given, viewport.worldToCanvas and
// getImageData() give the bounding box of the NATIVE IMAGE inside the viewport
// canvas, and the output is cropped to that rect. Without the crop the output holds
// the whole viewport canvas, black borders and all, which appear whenever the image's
// aspect ratio does not match the viewport's. The print builder's
// `composeImageOnBlack` would then fit the WHOLE PNG, borders included, into the
// cell, and the image would come out smaller than it should be.
type CaptureAnnotatedOptions = {
  targetWidth?: number;
  targetHeight?: number;
  drawBase?: boolean;
  drawAnnotations?: boolean;
  viewport?: unknown; // Cornerstone3D viewport (opzionale, abilita auto-crop)
};

type RectInCanvas = { x: number; y: number; w: number; h: number };

// Reads the native image size, in voxels, off the viewport.
function getNativeImageSize(viewport: unknown): [number, number] | null {
  if (!viewport || typeof viewport !== 'object') return null;
  const vp = viewport as {
    getImageData?: () => { dimensions?: number[] } | null;
  };
  if (typeof vp.getImageData !== 'function') return null;
  try {
    const imgData = vp.getImageData();
    if (!imgData || !Array.isArray(imgData.dimensions) || imgData.dimensions.length < 2) {
      return null;
    }
    const w = imgData.dimensions[0];
    const h = imgData.dimensions[1];
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return [w, h];
  } catch {
    return null;
  }
}

// Strategy A: vtkImageData.getBounds() gives the image rect's four corners in world
// coordinates, and worldToCanvas projects them onto the canvas.
function computeImageRectViaBounds(
  viewport: unknown,
  cornerstoneCanvas: HTMLCanvasElement
): RectInCanvas | null {
  if (!viewport || typeof viewport !== 'object') return null;
  const vp = viewport as {
    worldToCanvas?: (worldPos: number[]) => [number, number];
    getImageData?: () => {
      imageData?: { getBounds?: () => number[] };
    } | null;
  };
  if (typeof vp.worldToCanvas !== 'function' || typeof vp.getImageData !== 'function') {
    return null;
  }
  try {
    const imgData = vp.getImageData();
    if (!imgData || !imgData.imageData || typeof imgData.imageData.getBounds !== 'function') {
      return null;
    }
    const bounds = imgData.imageData.getBounds();
    if (!Array.isArray(bounds) || bounds.length < 6) return null;
    const [xMin, xMax, yMin, yMax, zMin] = bounds;
    if (
      !Number.isFinite(xMin) ||
      !Number.isFinite(xMax) ||
      !Number.isFinite(yMin) ||
      !Number.isFinite(yMax)
    ) {
      return null;
    }
    const corners: number[][] = [
      [xMin, yMin, zMin],
      [xMax, yMin, zMin],
      [xMin, yMax, zMin],
      [xMax, yMax, zMin],
    ];
    const canvasPts: Array<[number, number]> = [];
    for (const w of corners) {
      const cp = vp.worldToCanvas!(w);
      if (!Array.isArray(cp) || cp.length < 2) return null;
      if (!Number.isFinite(cp[0]) || !Number.isFinite(cp[1])) return null;
      canvasPts.push([cp[0], cp[1]]);
    }
    const cssW = cornerstoneCanvas.clientWidth || cornerstoneCanvas.width || 1;
    const cssH = cornerstoneCanvas.clientHeight || cornerstoneCanvas.height || 1;
    const sx = cornerstoneCanvas.width / cssW;
    const sy = cornerstoneCanvas.height / cssH;
    const xs = canvasPts.map(p => p[0] * sx);
    const ys = canvasPts.map(p => p[1] * sy);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxX = Math.min(cornerstoneCanvas.width, Math.ceil(Math.max(...xs)));
    const maxY = Math.min(cornerstoneCanvas.height, Math.ceil(Math.max(...ys)));
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 1 || h <= 1) return null;
    return { x: minX, y: minY, w, h };
  } catch {
    return null;
  }
}

// Strategy B, the fallback: centre the native image in the canvas, fitted to aspect.
function computeImageRectViaAspectFit(
  viewport: unknown,
  cornerstoneCanvas: HTMLCanvasElement
): RectInCanvas | null {
  const native = getNativeImageSize(viewport);
  if (!native) return null;
  const [nW, nH] = native;
  const cW = cornerstoneCanvas.width;
  const cH = cornerstoneCanvas.height;
  if (!cW || !cH) return null;
  const aspectImg = nW / nH;
  const aspectCanvas = cW / cH;
  let rectW: number;
  let rectH: number;
  if (aspectImg > aspectCanvas) {
    rectW = cW;
    rectH = cW / aspectImg;
  } else {
    rectH = cH;
    rectW = cH * aspectImg;
  }
  const rectX = Math.round((cW - rectW) / 2);
  const rectY = Math.round((cH - rectH) / 2);
  return {
    x: Math.max(0, rectX),
    y: Math.max(0, rectY),
    w: Math.max(1, Math.round(rectW)),
    h: Math.max(1, Math.round(rectH)),
  };
}

function isRectReasonable(rect: RectInCanvas | null, canvas: HTMLCanvasElement): boolean {
  if (!rect) return false;
  if (rect.w < 8 || rect.h < 8) return false;
  if (rect.x < 0 || rect.y < 0) return false;
  if (rect.x + rect.w > canvas.width + 2) return false;
  if (rect.y + rect.h > canvas.height + 2) return false;
  return true;
}

function computeImageRectInCanvas(
  viewport: unknown,
  cornerstoneCanvas: HTMLCanvasElement
): RectInCanvas | null {
  const viaBounds = computeImageRectViaBounds(viewport, cornerstoneCanvas);
  if (isRectReasonable(viaBounds, cornerstoneCanvas)) {
    logFavouritesDebug('rect via bounds', viaBounds);
    return viaBounds;
  }
  const viaAspect = computeImageRectViaAspectFit(viewport, cornerstoneCanvas);
  if (isRectReasonable(viaAspect, cornerstoneCanvas)) {
    logFavouritesDebug('rect via aspect-fit', viaAspect);
    return viaAspect;
  }
  logFavouritesDebug('no rect computed', { viaBounds, viaAspect });
  return null;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const SVG_PRESENTATION_STYLE_PROPERTIES = [
  'opacity',
  'display',
  'visibility',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'fill',
  'fill-opacity',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
  'filter',
  'vector-effect',
  'transform',
] as const;

function inlineComputedStylesIntoClone(sourceNode: Node, cloneNode: Node): void {
  if (sourceNode.nodeType === Node.ELEMENT_NODE && cloneNode.nodeType === Node.ELEMENT_NODE) {
    const sourceElement = sourceNode as Element;
    const cloneElement = cloneNode as Element;
    const computedStyle = window.getComputedStyle(sourceElement);

    const styleTarget = (cloneElement as HTMLElement).style;
    for (const propertyName of SVG_PRESENTATION_STYLE_PROPERTIES) {
      const propertyValue = computedStyle.getPropertyValue(propertyName);
      if (!propertyValue) {
        continue;
      }
      const priority = computedStyle.getPropertyPriority(propertyName);
      styleTarget.setProperty(propertyName, propertyValue, priority);
    }

    // Custom CSS properties (--foo) used by the tools are copied too.
    for (let i = 0; i < computedStyle.length; i++) {
      const propertyName = computedStyle.item(i);
      if (!propertyName || !propertyName.startsWith('--')) {
        continue;
      }
      const propertyValue = computedStyle.getPropertyValue(propertyName);
      if (!propertyValue) {
        continue;
      }
      const priority = computedStyle.getPropertyPriority(propertyName);
      styleTarget.setProperty(propertyName, propertyValue, priority);
    }
  }

  const sourceChildren = sourceNode.childNodes;
  const cloneChildren = cloneNode.childNodes;
  const childCount = Math.min(sourceChildren.length, cloneChildren.length);
  for (let i = 0; i < childCount; i++) {
    inlineComputedStylesIntoClone(sourceChildren[i], cloneChildren[i]);
  }
}

function getCandidateAnnotationSvgs(viewportElement: HTMLElement): SVGSVGElement[] {
  const allSvgs = Array.from(viewportElement.querySelectorAll('svg')) as SVGSVGElement[];
  if (!allSvgs.length) {
    return [];
  }

  const svgLayers = allSvgs.filter(
    svg => svg.classList.contains('svg-layer') || !!svg.closest('.svg-layer')
  );

  return svgLayers.length ? svgLayers : allSvgs;
}

function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const opacity = Number(style.opacity);
  return Number.isNaN(opacity) || opacity > 0;
}

async function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  if (!src) {
    return null;
  }

  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function captureImageWithAnnotationsFromElement(
  viewportElement: HTMLElement | null | undefined,
  options: CaptureAnnotatedOptions = {}
): Promise<string | null> {
  if (!viewportElement) {
    return null;
  }

  const traceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const drawBase = options.drawBase !== false;
  const drawAnnotations = options.drawAnnotations !== false;

  try {
    const cornerstoneCanvas =
      (viewportElement.querySelector('canvas.cornerstone-canvas') as HTMLCanvasElement | null) ||
      (viewportElement.querySelector('canvas') as HTMLCanvasElement | null);
    if (!cornerstoneCanvas) {
      logFavouritesDebug('trace', traceId, 'abort: canvas not found');
      return null;
    }

    const canvasRect = cornerstoneCanvas.getBoundingClientRect();
    const displayW = Math.max(
      1,
      Math.round(canvasRect.width || cornerstoneCanvas.clientWidth || cornerstoneCanvas.width || 1)
    );
    const displayH = Math.max(
      1,
      Math.round(
        canvasRect.height || cornerstoneCanvas.clientHeight || cornerstoneCanvas.height || 1
      )
    );

    const out = document.createElement('canvas');
    out.width = isPositiveFiniteNumber(options.targetWidth)
      ? Math.round(options.targetWidth)
      : Math.max(1, cornerstoneCanvas.width || displayW);
    out.height = isPositiveFiniteNumber(options.targetHeight)
      ? Math.round(options.targetHeight)
      : Math.max(1, cornerstoneCanvas.height || displayH);

    logFavouritesDebug('trace', traceId, 'capture-start', {
      displayW,
      displayH,
      targetW: out.width,
      targetH: out.height,
      drawBase,
      drawAnnotations,
    });

    const ctx = out.getContext('2d');
    if (!ctx) {
      logFavouritesDebug('trace', traceId, 'abort: no canvas context');
      return null;
    }

    if (drawBase) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, out.width, out.height);
      // The annotated base is a real render of the viewport canvas.
      ctx.drawImage(cornerstoneCanvas, 0, 0, out.width, out.height);
    } else {
      ctx.clearRect(0, 0, out.width, out.height);
    }

    // Local helper: crops `out` to the image's physical rect when a viewport is
    // available, and returns the whole output otherwise. Used by both the
    // "no annotations" path and the full one, so EVERY saved PNG (printBase,
    // overlay, annotated) comes out the same size, 1:1.
    const finalize = (): string => {
      const rect = options.viewport
        ? computeImageRectInCanvas(options.viewport, cornerstoneCanvas)
        : null;
      if (rect) {
        const scaleX = out.width / cornerstoneCanvas.width;
        const scaleY = out.height / cornerstoneCanvas.height;
        const rx = Math.round(rect.x * scaleX);
        const ry = Math.round(rect.y * scaleY);
        const rw = Math.max(1, Math.round(rect.w * scaleX));
        const rh = Math.max(1, Math.round(rect.h * scaleY));
        const cropped = document.createElement('canvas');
        cropped.width = rw;
        cropped.height = rh;
        const cctx = cropped.getContext('2d');
        if (cctx) {
          cctx.drawImage(out, rx, ry, rw, rh, 0, 0, rw, rh);
          logFavouritesDebug('trace', traceId, 'cropped-to-image-rect', {
            rx,
            ry,
            rw,
            rh,
            outW: out.width,
            outH: out.height,
          });
          return cropped.toDataURL('image/png');
        }
      }
      return out.toDataURL('image/png');
    };

    if (!drawAnnotations) {
      logFavouritesDebug('trace', traceId, 'capture-end-no-annotations', {
        outputW: out.width,
        outputH: out.height,
      });
      // The "no annotations" path has to go through finalize() too, so that
      // DataUrlPrintBase is cropped exactly like overlay and annotated. Without it,
      // the saved printBase would be the whole viewport (1753 by 322, say) while
      // overlay and annotated were cropped to the rect (392 by 293), a different
      // aspect ratio, and the builder would fit them badly.
      return finalize();
    }

    const candidateSvgs = getCandidateAnnotationSvgs(viewportElement);
    const visibleSvgs = candidateSvgs.filter(isElementVisible);
    const svgs = visibleSvgs.length ? visibleSvgs : candidateSvgs;
    logFavouritesDebug('trace', traceId, 'svg-layers', {
      candidates: candidateSvgs.length,
      visible: visibleSvgs.length,
      selected: svgs.length,
    });
    if (!svgs.length) {
      logFavouritesDebug('trace', traceId, 'no-svg-layers');
      return drawBase ? out.toDataURL('image/png') : null;
    }

    const scaleX = out.width / displayW;
    const scaleY = out.height / displayH;
    let drawnSvgCount = 0;
    let failedSvgCount = 0;
    let drawableSvgCount = 0;

    for (let svgIndex = 0; svgIndex < svgs.length; svgIndex++) {
      const svg = svgs[svgIndex];
      const hasDrawableNodes = !!svg.querySelector(
        'path,line,polyline,polygon,circle,ellipse,rect,text,use'
      );
      if (!hasDrawableNodes) {
        logFavouritesDebug('trace', traceId, 'svg-skip-no-drawable', {
          svgIndex,
          id: svg.id,
          className: svg.className?.baseVal || svg.getAttribute('class') || '',
          childCount: svg.children?.length ?? 0,
        });
        continue;
      }
      drawableSvgCount++;

      try {
        const svgClone = svg.cloneNode(true) as SVGSVGElement;
        inlineComputedStylesIntoClone(svg, svgClone);

        const svgRect = svg.getBoundingClientRect();
        const svgDisplayW = Math.max(1, Math.round(svgRect.width || svg.clientWidth || displayW));
        const svgDisplayH = Math.max(1, Math.round(svgRect.height || svg.clientHeight || displayH));

        svgClone.setAttribute('width', String(svgDisplayW));
        svgClone.setAttribute('height', String(svgDisplayH));
        if (!svgClone.getAttribute('viewBox')) {
          svgClone.setAttribute('viewBox', `0 0 ${svgDisplayW} ${svgDisplayH}`);
        }
        if (!svgClone.getAttribute('xmlns')) {
          svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        }
        if (!svgClone.getAttribute('xmlns:xlink')) {
          svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        }

        const svgString = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const svgImage = await loadImageElement(svgUrl);
        URL.revokeObjectURL(svgUrl);
        if (!svgImage) {
          failedSvgCount++;
          logFavouritesDebug('trace', traceId, 'svg-load-failed', {
            svgIndex,
            serializedLength: svgString.length,
          });
          continue;
        }

        const relativeX = (svgRect.left - canvasRect.left) * scaleX;
        const relativeY = (svgRect.top - canvasRect.top) * scaleY;
        const drawW = svgDisplayW * scaleX;
        const drawH = svgDisplayH * scaleY;

        ctx.drawImage(svgImage, relativeX, relativeY, drawW, drawH);
        drawnSvgCount++;
        logFavouritesDebug('trace', traceId, 'svg-drawn', {
          svgIndex,
          id: svg.id,
          className: svg.className?.baseVal || svg.getAttribute('class') || '',
          drawW,
          drawH,
          relativeX,
          relativeY,
        });
      } catch (error) {
        failedSvgCount++;
        logFavouritesDebug('trace', traceId, 'svg-compose-error', { svgIndex, error });
        console.warn('Favourites: failed to compose one SVG layer', error);
      }
    }

    if (!drawnSvgCount) {
      logFavouritesDebug('trace', traceId, 'no-svg-drawn', {
        totalSvgs: svgs.length,
        drawableSvgCount,
        failedSvgCount,
      });
    }

    logFavouritesDebug('trace', traceId, 'capture-end', {
      drawnSvgCount,
      failedSvgCount,
      drawableSvgCount,
      outputW: out.width,
      outputH: out.height,
    });

    // The same crop the no-annotations path uses: EVERY output goes through
    // finalize(), so every PNG is 1:1 and they line up with each other.
    return finalize();
  } catch (error) {
    logFavouritesDebug('trace', traceId, 'capture-error', error);
    console.warn('Favourites: failed to capture annotated image', error);
    return null;
  }
}

// Recaptures the four versions of a favourite (clean, printBase, overlay, annotated)
// from a viewport and element that are already resolved. It works at a low level, with
// no cornerstoneViewportService, so both the React component and the global listener
// can call it.
//
// Best effort: if the capture fails, the favourite is left as it was.
async function recaptureFavouriteForViewport(
  viewport: unknown,
  viewportElement: HTMLElement | null
): Promise<boolean> {
  if (!viewport) return false;
  const list = (window as Window & { favourites?: Array<Record<string, unknown>> }).favourites;
  if (!Array.isArray(list) || !list.length) return false;

  try {
    const vp = viewport as {
      getImageIds?: () => string[];
      getCurrentImageIdIndex?: () => number;
    };
    if (typeof vp.getImageIds !== 'function' || typeof vp.getCurrentImageIdIndex !== 'function') {
      return false;
    }
    const imageIds = vp.getImageIds() || [];
    const idx = vp.getCurrentImageIdIndex();
    const currentImageId = imageIds[idx];
    if (!currentImageId) return false;
    const currentSop = (metaData.get('sopCommonModule', currentImageId) as
      | { sopInstanceUID?: string }
      | undefined)?.sopInstanceUID;
    if (!currentSop) return false;

    // Find the favourite that matches the instance currently on screen
    const target = list.find(
      p => p && (p as { SOPInstanceUID?: string }).SOPInstanceUID === currentSop
    );
    if (!target) {
      // The visible instance is not a favourite, so nothing to recapture.
      return false;
    }

    // A clean capture at the native DICOM resolution, kept for backwards compatibility
    const cleanUrl = await captureImageFromImageId(currentImageId, viewport);
    if (!cleanUrl) return false;

    const printBase =
      (await captureImageWithAnnotationsFromElement(viewportElement, {
        drawBase: true,
        drawAnnotations: false,
        viewport,
      })) || cleanUrl;
    const overlay = await captureImageWithAnnotationsFromElement(viewportElement, {
      drawBase: false,
      drawAnnotations: true,
      viewport,
    });
    const annotated =
      (await captureImageWithAnnotationsFromElement(viewportElement, {
        drawBase: true,
        drawAnnotations: true,
        viewport,
      })) || printBase;

    (target as Record<string, unknown>).DataUrl = cleanUrl;
    (target as Record<string, unknown>).DataUrlPrintBase = printBase;
    (target as Record<string, unknown>).DataUrlAnnotationOverlay = overlay || null;
    (target as Record<string, unknown>).DataUrlAnnotated = annotated;
    logFavouritesDebug('favourite-recaptured', {
      sopUID: currentSop,
      cleanLength: cleanUrl.length,
      printBaseLength: printBase.length,
      annotatedLength: annotated.length,
      overlayLength: overlay?.length ?? 0,
    });
    return true;
  } catch (e) {
    console.warn('Favourites: failed to recapture favourite', e);
    return false;
  }
}

// ============================================================
// GLOBAL ANNOTATION LISTENER, which recaptures the active favourite
// ------------------------------------------------------------
// Installed at module load, NOT inside the React component, so it is ALWAYS on, even
// when nobody has opened the window level panel and no <Favourites /> has ever been
// mounted.
//
// When an ANNOTATION_ADDED, MODIFIED or REMOVED event arrives:
//  1. resolve the viewport from the event (renderingEngineId plus viewportId)
//  2. take the viewport's element
//  3. debounce by 250ms, which absorbs the burst a drag produces
//  4. call recaptureFavouriteForViewport()
//  5. if the recapture works, dispatch mdv-favourites-updated, which the bridge in
//     favourites.js forwards to the builder's frame.
// ============================================================
let _annotationRecaptureTimer: ReturnType<typeof setTimeout> | null = null;
let _annotationRecaptureInFlight = false;
let _annotationListenerInstalled = false;

// Works out which viewports are candidates for a recapture, given an annotation event.
// ANNOTATION_ADDED and MODIFIED carry viewportId and renderingEngineId in the detail,
// but ANNOTATION_REMOVED arrives with only `{ annotation, annotationManagerUID }` (see
// annotationState.js in @cornerstonejs/tools/removeAnnotation). In that case this falls
// back to EVERY enabled element and recaptures the ones showing a favourite instance.
function resolveViewportsForAnnotationEvent(detail: {
  viewportId?: string;
  renderingEngineId?: string;
}): Array<{ viewport: unknown; element: HTMLElement | null }> {
  // Path 1: the detail already says which viewport it is
  if (detail?.viewportId && detail?.renderingEngineId) {
    try {
      const enabled = csGetEnabledElementByIds(
        detail.viewportId,
        detail.renderingEngineId
      ) as { viewport?: unknown } | null;
      const vp = enabled?.viewport as { element?: HTMLElement | null } | null | undefined;
      if (vp) {
        return [{ viewport: vp, element: (vp.element as HTMLElement | null) ?? null }];
      }
    } catch {
      /* fallback al path 2 */
    }
  }

  // Path 2: no viewportId in the detail, which is the ANNOTATION_REMOVED case. Return
  // EVERY enabled element; recaptureFavouriteForViewport already skips the ones whose
  // current instance is not a favourite.
  try {
    const all = (csGetEnabledElements?.() as Array<{ viewport?: unknown }>) || [];
    const result: Array<{ viewport: unknown; element: HTMLElement | null }> = [];
    for (const e of all) {
      const vp = e?.viewport as { element?: HTMLElement | null } | null | undefined;
      if (!vp) continue;
      result.push({
        viewport: vp,
        element: (vp.element as HTMLElement | null) ?? null,
      });
    }
    return result;
  } catch {
    return [];
  }
}

function installGlobalAnnotationRecaptureListener(): void {
  if (_annotationListenerInstalled) return;
  if (!csEventTarget || typeof csEventTarget.addEventListener !== 'function') {
    return;
  }
  _annotationListenerInstalled = true;

  const onAnnotationEvent = (event: Event) => {
    const detail =
      (event as CustomEvent<{ viewportId?: string; renderingEngineId?: string }>).detail || {};

    if (_annotationRecaptureTimer) clearTimeout(_annotationRecaptureTimer);
    _annotationRecaptureTimer = setTimeout(async () => {
      if (_annotationRecaptureInFlight) return;
      _annotationRecaptureInFlight = true;
      try {
        const candidates = resolveViewportsForAnnotationEvent(detail);
        if (!candidates.length) return;
        let anyOk = false;
        for (const cand of candidates) {
          const ok = await recaptureFavouriteForViewport(cand.viewport, cand.element);
          if (ok) anyOk = true;
        }
        if (anyOk) {
          window.dispatchEvent(new Event('mdv-favourites-updated'));
        }
      } finally {
        _annotationRecaptureInFlight = false;
      }
    }, 250);
  };

  csEventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_ADDED, onAnnotationEvent);
  csEventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, onAnnotationEvent);
  csEventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_REMOVED, onAnnotationEvent);

  // MOUSEUP FALLBACK: moving only the label or text box of a measurement (the
  // "1.38 cm US Region", say) does NOT trigger ANNOTATION_MODIFIED in Cornerstone3D
  // (see LengthTool._dragCallback: for movingTextBox it does not set
  // annotation.invalidated, so triggerAnnotationModified is never called). To catch
  // those moves too, mouseup is listened for AT DOCUMENT LEVEL and a recapture is
  // scheduled. The dispatcher is the same one (250ms debounce, and
  // recaptureFavouriteForViewport skips when the visible instance is not a favourite),
  // so an empty mouseup costs next to nothing.
  document.addEventListener(
    'mouseup',
    () => onAnnotationEvent(new CustomEvent('mdv-mouseup-recapture', { detail: {} })),
    true
  );

  logFavouritesDebug('global-annotation-listener-installed');
}

// Installed straight away at module load. Cornerstone core exports `eventTarget` as a
// singleton created eagerly, so it is already there by this point.
installGlobalAnnotationRecaptureListener();

export function Favourites({
  viewportId,
  displaySets,
  commandsManager,
  servicesManager,
  colorbarProperties,
}: withAppTypes<ColorbarProps>): ReactElement {
  void commandsManager;
  void colorbarProperties;

  const { cornerstoneViewportService } = servicesManager.services;

  // Take the current UID from the first entry in displaySets
  const { SeriesInstanceUID } = displaySets[0].instance || {};

  const getActiveElementIndex = useCallback(() => {
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (viewport && typeof viewport.getCurrentImageIdIndex === 'function') {
      const index = viewport.getCurrentImageIdIndex();
      if (Number.isFinite(index)) {
        return index;
      }
    }

    const input = document.querySelector('.mdv-selected .mousetrap') as HTMLInputElement | null;
    const value = input ? Number(input.value) : 0;
    return Number.isFinite(value) ? value : 0;
  }, [cornerstoneViewportService, viewportId]);

  const getInstanceAtIndex = useCallback(
    index => {
      const instances = displaySets?.[0]?.instances;
      if (instances?.length) {
        const safeIndex = Math.min(Math.max(index, 0), instances.length - 1);
        return instances[safeIndex];
      }
      return displaySets?.[0]?.instance ?? displaySets?.[0];
    },
    [displaySets]
  );

  const getSopUIDAtIndex = useCallback(
    index => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport && typeof viewport.getImageIds === 'function') {
        const imageIds = viewport.getImageIds() || [];
        const imageId = imageIds[index];
        if (imageId) {
          const sop = metaData.get('sopCommonModule', imageId)?.sopInstanceUID;
          if (sop) {
            return sop;
          }
        }
      }

      const instance = getInstanceAtIndex(index);
      return instance?.SOPInstanceUID;
    },
    [cornerstoneViewportService, viewportId, getInstanceAtIndex]
  );

  const getImageIdAtIndex = useCallback(
    index => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport && typeof viewport.getImageIds === 'function') {
        const imageIds = viewport.getImageIds() || [];
        return imageIds[index];
      }
      return null;
    },
    [cornerstoneViewportService, viewportId]
  );

  const isFavouriteForIndex = useCallback(
    index => {
      if (!window.favourites?.length) {
        return false;
      }
      const sopUID = getSopUIDAtIndex(index);
      if (!SeriesInstanceUID || !sopUID) {
        return false;
      }
      return window.favourites.some(
        favourite =>
          favourite.SeriesInstanceUID === SeriesInstanceUID && favourite.SOPInstanceUID === sopUID
      );
    },
    [SeriesInstanceUID, getSopUIDAtIndex]
  );

  const [activeElementIndex, setActiveElementIndex] = useState(getActiveElementIndex);
  const [isFavourite, setIsFavourite] = useState(() =>
    isFavouriteForIndex(getActiveElementIndex())
  );

  useEffect(() => {
    const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
    const element = viewportInfo?.getElement?.();
    if (!element) {
      return;
    }

    const viewportType =
      viewportInfo.getViewportType?.() ||
      viewportInfo.getViewportData?.()?.viewportType ||
      Enums.ViewportType.STACK;

    const eventId =
      (viewportType === Enums.ViewportType.STACK && Enums.Events.STACK_VIEWPORT_SCROLL) ||
      (viewportType === Enums.ViewportType.ORTHOGRAPHIC && Enums.Events.VOLUME_NEW_IMAGE) ||
      Enums.Events.IMAGE_RENDERED;

    const updateIndex = event => {
      const detail = event?.detail || {};
      const { newImageIdIndex, imageIndex } = detail;
      const nextIndex = Number.isFinite(newImageIdIndex)
        ? newImageIdIndex
        : Number.isFinite(imageIndex)
          ? imageIndex
          : getActiveElementIndex();
      setActiveElementIndex(nextIndex);
    };

    element.addEventListener(eventId, updateIndex);
    updateIndex();

    return () => {
      element.removeEventListener(eventId, updateIndex);
    };
  }, [cornerstoneViewportService, viewportId, getActiveElementIndex]);

  useEffect(() => {
    const currentIsFavourite = isFavouriteForIndex(activeElementIndex);
    setIsFavourite(currentIsFavourite);
  }, [activeElementIndex, isFavouriteForIndex]);

  // The annotation listener is installed at module load, see
  // installGlobalAnnotationRecaptureListener above, and NOT inside this component, so
  // it stays on even when the window level panel has never been opened and no
  // <Favourites /> has ever been mounted.

  const onSetFavourite = useCallback(
    async e => {
      const { uiNotificationService } = servicesManager.services;
      // Whether the star was just marked or unmarked.
      const checked = e;
      const instance = getInstanceAtIndex(activeElementIndex);
      const sopUID = getSopUIDAtIndex(activeElementIndex);
      const imageId = getImageIdAtIndex(activeElementIndex);

      if (!sopUID) {
        return;
      }

      if (!window.favourites) {
        window.favourites = [];
      }
      if (!checked && document.getElementById('favourites-btn')) {
        document.getElementById('favourites-btn').classList.remove('pulse');
        // Filter the favourites array, dropping the entry that matches
        window.favourites = window.favourites.filter(favourite => {
          return !(
            favourite.SeriesInstanceUID === SeriesInstanceUID && favourite.SOPInstanceUID === sopUID
          );
        });
        setIsFavourite(false);
        // With the favourites clipboard open, refresh it as soon as one is removed
        if (document.getElementById('favourites-list-area')) {
          document.getElementById('favourites-list-area').remove();
          document
            .getElementById('favourites-tools')
            .insertAdjacentHTML('beforeend', '<div id="favourites-list-area"></div>');

          for (const favourite of window.favourites) {
            document.getElementById('favourites-list-area').insertAdjacentHTML(
              'afterbegin',
              `
            <div class="col">
            <img onclick="window.viewFavouritePopup('${favourite.DataUrl}')" src=${favourite.DataUrl} />
            <p>Series ${favourite.seriesNumber} - ${favourite.SeriesDescription}</p>
            <p>Instance: ${favourite.instanceNumber}</p>
            <button class="remove-favourite-btn" onclick="window.removeFavourite('${favourite.SOPInstanceUID}')">Remove</button>
            </div>
            `
            );
          }
        }
        uiNotificationService.show({
          title: 'Favourites',
          message: `Favourite removed`,
          type: 'error',
        });
        window.dispatchEvent(new Event('mdv-favourites-updated'));
      }


      // Capture the canvas on its own rather than the whole div
      if (!isFavourite && checked && document.getElementById('favourites-btn')) {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        const SOPInstanceUID = sopUID;
        const seriesNumber = instance?.SeriesNumber ?? displaySets?.[0]?.instance?.SeriesNumber;
        const SeriesDescription =
          instance?.SeriesDescription ?? displaySets?.[0]?.instance?.SeriesDescription;
        const instanceNumber = activeElementIndex + 1;
        const imgData =
          (await captureImageFromImageId(imageId, viewport)) ||
          document.querySelector('.mdv-selected .cornerstone-canvas')?.toDataURL('image/png');
        if (!imgData) {
          return;
        }

        // Capture a version WITH the annotations too (length, area and the rest) by
        // composing the canvas and the SVG layer. Best effort: if that fails this
        // falls back to the clean DataUrl, so the print builder keeps working even
        // without annotations.
        //
        // `viewport` is passed to captureImageWithAnnotationsFromElement so it can
        // work out the native image's rect and crop the viewport's black borders out
        // of the output. Without the crop the print builder would fit the borders into
        // the cell as well, and the image would look shrunken.
        const viewportInfoForCapture = cornerstoneViewportService.getViewportInfo(viewportId);
        const viewportElementForCapture =
          (viewportInfoForCapture?.getElement?.() as HTMLElement | null) ?? null;
        const imgDataPrintBase =
          (await captureImageWithAnnotationsFromElement(viewportElementForCapture, {
            drawBase: true,
            drawAnnotations: false,
            viewport,
          })) || imgData;
        const annotationOverlayDataUrl = await captureImageWithAnnotationsFromElement(
          viewportElementForCapture,
          {
            drawBase: false,
            drawAnnotations: true,
            viewport,
          }
        );
        const imgDataAnnotated =
          (await captureImageWithAnnotationsFromElement(viewportElementForCapture, {
            drawBase: true,
            drawAnnotations: true,
            viewport,
          })) || imgDataPrintBase;
        logFavouritesDebug('favourite-save', {
          sopUID: SOPInstanceUID,
          cleanLength: imgData.length,
          printBaseLength: imgDataPrintBase.length,
          annotatedLength: imgDataAnnotated.length,
          overlayLength: annotationOverlayDataUrl?.length ?? 0,
          printBaseEqualsClean: imgDataPrintBase === imgData,
          annotatedEqualsPrintBase: imgDataAnnotated === imgDataPrintBase,
          hasAnnotationOverlay: !!annotationOverlayDataUrl,
          hasViewportElement: !!viewportElementForCapture,
        });

        window.favourites.push({
          SeriesInstanceUID,
          SOPInstanceUID: SOPInstanceUID,
          DataUrl: imgData,
          DataUrlPrintBase: imgDataPrintBase,
          DataUrlAnnotated: imgDataAnnotated,
          DataUrlAnnotationOverlay: annotationOverlayDataUrl || null,
          seriesNumber: seriesNumber,
          SeriesDescription: SeriesDescription,
          instanceNumber: instanceNumber,
        });
        setIsFavourite(true);

        // With the favourites panel open, the new one appears in it straight away
        if (document.getElementById('favourites-list-area')) {
          document.getElementById('favourites-list-area').insertAdjacentHTML(
            'afterbegin',
            `
        <div class="col">
        <img onclick="window.viewFavouritePopup('${imgData}')" src=${imgData} />
        <p>Series ${seriesNumber} - ${SeriesDescription}</p>
        <p>Instance: ${instanceNumber}</p>
        <button class="remove-favourite-btn" onclick="window.removeFavourite('${SOPInstanceUID}')">Remove</button>
        </div>
      `
          );
        }

        document.getElementById('favourites-btn').classList.add('pulse');

        uiNotificationService.show({
          title: 'Favourites',
          message: `Added to favourites`,
          type: 'success',
        });
        window.dispatchEvent(new Event('mdv-favourites-updated'));
      }

      document.querySelector('.mdv-selected .favourites-btn').click(); // Hides the switch just opened
    },
    [
      displaySets,
      isFavourite,
      SeriesInstanceUID,
      activeElementIndex,
      servicesManager,
      getInstanceAtIndex,
      getSopUIDAtIndex,
      getImageIdAtIndex,
      cornerstoneViewportService,
      viewportId,
    ]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const switchButton = document.querySelector('.switch-button-outer') as HTMLElement | null;
      if (switchButton) {
        switchButton.click();
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div
      style={{ display: 'none' }}
      className="all-in-one-menu-item flex w-full justify-center"
    >
      <div className="mr-2 w-[28px]"></div>
      {/* <button onClick={onSetFavourite}>
        {!isAlreadyFavourite ? 'Add to favourites' : 'Remove'}
      </button> */}
      <SwitchButton
        label={!isFavourite ? 'Add to favourites' : 'Remove from favourites'}
        checked={isFavourite}
        onChange={e => {
          void onSetFavourite(e);
        }}
      />
    </div>
  );
}
