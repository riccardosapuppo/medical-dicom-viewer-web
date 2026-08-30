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

function isPreferitiDebugEnabled(): boolean {
  try {
    const win = window as Window & { __MDV_PRINT_DEBUG__?: boolean };
    return win.__MDV_PRINT_DEBUG__ === true || localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function logPreferitiDebug(...args: unknown[]): void {
  if (!isPreferitiDebugEnabled()) {
    return;
  }
  console.log('[PreferitiCapture]', ...args);
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
    console.warn('Preferiti: failed to render image for capture', error);
    return null;
  }

  return canvas.toDataURL('image/png');
}

// Cattura il viewport completo con le annotazioni.
// Base: render del canvas Cornerstone (stessa geometria del viewport).
// Overlay: layer SVG annotation con computed style inline.
//
// IMPORTANTE - param `viewport`:
// Se passato, usiamo viewport.worldToCanvas + getImageData() per calcolare
// il bounding box DELL'IMMAGINE NATIVA dentro il canvas viewport, e
// croppiamo l'output a quel rect. Senza questo crop, l'output contiene
// l'intero canvas viewport (che ha bordi neri attorno se l'aspect ratio
// dell'immagine non corrisponde a quello del viewport), e nel print builder
// `composeImageOnBlack` fitterebbe TUTTO il PNG (compresi i bordi neri)
// nella cella, facendo apparire l'immagine più piccola del dovuto.
type CaptureAnnotatedOptions = {
  targetWidth?: number;
  targetHeight?: number;
  drawBase?: boolean;
  drawAnnotations?: boolean;
  viewport?: unknown; // Cornerstone3D viewport (opzionale, abilita auto-crop)
};

type RectInCanvas = { x: number; y: number; w: number; h: number };

// Estrae le dimensioni dell'immagine nativa (in voxel) dal viewport.
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

// Strategia A: usa vtkImageData.getBounds() per i 4 corner del rect immagine
// in world coordinates, poi proietta a canvas via worldToCanvas.
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

// Strategia B (fallback): aspect-fit centrato dell'immagine nativa nel canvas.
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
    logPreferitiDebug('rect via bounds', viaBounds);
    return viaBounds;
  }
  const viaAspect = computeImageRectViaAspectFit(viewport, cornerstoneCanvas);
  if (isRectReasonable(viaAspect, cornerstoneCanvas)) {
    logPreferitiDebug('rect via aspect-fit', viaAspect);
    return viaAspect;
  }
  logPreferitiDebug('no rect computed', { viaBounds, viaAspect });
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

    // Copia anche eventuali CSS custom properties (--foo) usate dai tool.
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
      logPreferitiDebug('trace', traceId, 'abort: canvas not found');
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

    logPreferitiDebug('trace', traceId, 'capture-start', {
      displayW,
      displayH,
      targetW: out.width,
      targetH: out.height,
      drawBase,
      drawAnnotations,
    });

    const ctx = out.getContext('2d');
    if (!ctx) {
      logPreferitiDebug('trace', traceId, 'abort: no canvas context');
      return null;
    }

    if (drawBase) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, out.width, out.height);
      // Base annotata = render reale del viewport canvas.
      ctx.drawImage(cornerstoneCanvas, 0, 0, out.width, out.height);
    } else {
      ctx.clearRect(0, 0, out.width, out.height);
    }

    // Helper locale: cropa `out` al rect fisico dell'immagine se viewport
    // è disponibile, altrimenti ritorna l'output intero. Usato sia dal
    // path "no annotations" sia dal path completo, così TUTTI i PNG salvati
    // (printBase, overlay, annotated) hanno le stesse dimensioni 1:1.
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
          logPreferitiDebug('trace', traceId, 'cropped-to-image-rect', {
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
      logPreferitiDebug('trace', traceId, 'capture-end-no-annotations', {
        outputW: out.width,
        outputH: out.height,
      });
      // Anche il path "no annotations" deve passare per finalize() così
      // DataUrlPrintBase è croppato esattamente come overlay e annotated.
      // Senza questo, printBase salvato sarebbe il viewport intero (es.
      // 1753×322) mentre overlay/annotated sarebbero croppati al rect
      // (es. 392×293) → aspect ratio diverso → builder fitterebbe male.
      return finalize();
    }

    const candidateSvgs = getCandidateAnnotationSvgs(viewportElement);
    const visibleSvgs = candidateSvgs.filter(isElementVisible);
    const svgs = visibleSvgs.length ? visibleSvgs : candidateSvgs;
    logPreferitiDebug('trace', traceId, 'svg-layers', {
      candidates: candidateSvgs.length,
      visible: visibleSvgs.length,
      selected: svgs.length,
    });
    if (!svgs.length) {
      logPreferitiDebug('trace', traceId, 'no-svg-layers');
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
        logPreferitiDebug('trace', traceId, 'svg-skip-no-drawable', {
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
          logPreferitiDebug('trace', traceId, 'svg-load-failed', {
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
        logPreferitiDebug('trace', traceId, 'svg-drawn', {
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
        logPreferitiDebug('trace', traceId, 'svg-compose-error', { svgIndex, error });
        console.warn('Preferiti: failed to compose one SVG layer', error);
      }
    }

    if (!drawnSvgCount) {
      logPreferitiDebug('trace', traceId, 'no-svg-drawn', {
        totalSvgs: svgs.length,
        drawableSvgCount,
        failedSvgCount,
      });
    }

    logPreferitiDebug('trace', traceId, 'capture-end', {
      drawnSvgCount,
      failedSvgCount,
      drawableSvgCount,
      outputW: out.width,
      outputH: out.height,
    });

    // Stesso crop usato dal path no-annotations: TUTTI gli output passano
    // per finalize() → tutti i PNG hanno dimensioni 1:1 e sono allineabili.
    return finalize();
  } catch (error) {
    logPreferitiDebug('trace', traceId, 'capture-error', error);
    console.warn('Preferiti: failed to capture annotated image', error);
    return null;
  }
}

// Ri-cattura le 4 versioni (clean / printBase / overlay / annotated) di un
// preferito dato un viewport+element già risolti. Lavora a basso livello
// (niente cornerstoneViewportService) così è chiamabile sia dal componente
// React sia dal listener globale.
//
// Best-effort: se la cattura fallisce, lascia il preferito invariato.
async function recapturePreferitoForViewport(
  viewport: unknown,
  viewportElement: HTMLElement | null
): Promise<boolean> {
  if (!viewport) return false;
  const list = (window as Window & { preferiti?: Array<Record<string, unknown>> }).preferiti;
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

    // Trova il preferito corrispondente all'istanza attualmente mostrata
    const target = list.find(
      p => p && (p as { SOPInstanceUID?: string }).SOPInstanceUID === currentSop
    );
    if (!target) {
      // L'istanza visibile non è un preferito: niente recapture.
      return false;
    }

    // Cattura clean alla risoluzione DICOM nativa (per backward compat)
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
    logPreferitiDebug('preferito-recaptured', {
      sopUID: currentSop,
      cleanLength: cleanUrl.length,
      printBaseLength: printBase.length,
      annotatedLength: annotated.length,
      overlayLength: overlay?.length ?? 0,
    });
    return true;
  } catch (e) {
    console.warn('Preferiti: failed to recapture preferito', e);
    return false;
  }
}

// ============================================================
// LISTENER GLOBALE annotazioni → ricattura preferito attivo
// ------------------------------------------------------------
// Installato a module-load (NON dentro al componente React) così è SEMPRE
// attivo, anche quando l'utente non ha mai aperto il pannello WW/WL e
// quindi nessun componente <Preferiti /> è stato mai montato.
//
// Quando arriva un evento ANNOTATION_ADDED/MODIFIED/REMOVED:
//  1. Risolve il viewport dall'evento (renderingEngineId + viewportId)
//  2. Estrae l'element del viewport
//  3. Debounce 250ms (anti-burst per i drag)
//  4. Chiama recapturePreferitoForViewport()
//  5. Se la ricattura va a buon fine, dispatcha mdv-preferiti-updated
//     che il bridge in preferiti.js inoltra all'iframe del builder.
// ============================================================
let _annotationRecaptureTimer: ReturnType<typeof setTimeout> | null = null;
let _annotationRecaptureInFlight = false;
let _annotationListenerInstalled = false;

// Risolve la lista di viewport candidati per la ricattura a partire da un
// evento annotation. ANNOTATION_ADDED/MODIFIED includono viewportId+
// renderingEngineId nel detail, ma ANNOTATION_REMOVED arriva con
// solo `{ annotation, annotationManagerUID }` (vedi annotationState.js
// di @cornerstonejs/tools/removeAnnotation). In quel caso facciamo
// fallback su TUTTI gli enabled elements e ricatturiamo quelli che
// stanno mostrando un'istanza preferita.
function resolveViewportsForAnnotationEvent(detail: {
  viewportId?: string;
  renderingEngineId?: string;
}): Array<{ viewport: unknown; element: HTMLElement | null }> {
  // Path 1: il detail ci dice già qual è il viewport
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

  // Path 2: nessun viewportId nel detail (caso ANNOTATION_REMOVED).
  // Ritorniamo TUTTI gli enabled elements; recapturePreferitoForViewport
  // fa già lo skip se l'istanza corrente non è un preferito.
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
          const ok = await recapturePreferitoForViewport(cand.viewport, cand.element);
          if (ok) anyOk = true;
        }
        if (anyOk) {
          window.dispatchEvent(new Event('mdv-preferiti-updated'));
        }
      } finally {
        _annotationRecaptureInFlight = false;
      }
    }, 250);
  };

  csEventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_ADDED, onAnnotationEvent);
  csEventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, onAnnotationEvent);
  csEventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_REMOVED, onAnnotationEvent);

  // FALLBACK MOUSEUP: lo spostamento del solo label/textBox di una
  // misurazione (es. il "1.38 cm US Region") NON triggera
  // ANNOTATION_MODIFIED in Cornerstone3D (vedi LengthTool._dragCallback:
  // per movingTextBox non setta annotation.invalidated, quindi
  // triggerAnnotationModified non viene mai chiamato). Per intercettare
  // anche questi spostamenti, ascoltiamo i mouseup A LIVELLO DOCUMENT e
  // schediamo una recapture. Il dispatcher è lo stesso (debounce 250ms +
  // recapturePreferitoForViewport che skip se l'istanza visibile non è
  // un preferito), quindi il costo è trascurabile per i mouseup "vuoti".
  document.addEventListener(
    'mouseup',
    () => onAnnotationEvent(new CustomEvent('mdv-mouseup-recapture', { detail: {} })),
    true
  );

  logPreferitiDebug('global-annotation-listener-installed');
}

// Installa subito a module-load. Cornerstone core esporta `eventTarget`
// come singleton creato eagerly, quindi è già pronto qui.
installGlobalAnnotationRecaptureListener();

export function Preferiti({
  viewportId,
  displaySets,
  commandsManager,
  servicesManager,
  colorbarProperties,
}: withAppTypes<ColorbarProps>): ReactElement {
  void commandsManager;
  void colorbarProperties;

  const { cornerstoneViewportService } = servicesManager.services;

  // Recupera l'UID corrente dal primo elemento di displaySets
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

  const isPreferitoForIndex = useCallback(
    index => {
      if (!window.preferiti?.length) {
        return false;
      }
      const sopUID = getSopUIDAtIndex(index);
      if (!SeriesInstanceUID || !sopUID) {
        return false;
      }
      return window.preferiti.some(
        preferito =>
          preferito.SeriesInstanceUID === SeriesInstanceUID && preferito.SOPInstanceUID === sopUID
      );
    },
    [SeriesInstanceUID, getSopUIDAtIndex]
  );

  const [activeElementIndex, setActiveElementIndex] = useState(getActiveElementIndex);
  const [isPreferito, setIsPreferito] = useState(() =>
    isPreferitoForIndex(getActiveElementIndex())
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
    const currentIsPreferito = isPreferitoForIndex(activeElementIndex);
    setIsPreferito(currentIsPreferito);
  }, [activeElementIndex, isPreferitoForIndex]);

  // NB: il listener annotazioni è installato a module-load (vedi
  // installGlobalAnnotationRecaptureListener sopra), NON dentro questo
  // componente, così è sempre attivo anche quando il pannello WW/WL non
  // è mai stato aperto e il componente <Preferiti /> non è stato montato.

  const onSetPreferito = useCallback(
    async e => {
      const { uiNotificationService } = servicesManager.services;
      const checked = e; //Mi indica se sto checkando o meno l'opzione per aggiunta/rimozione preferito      // Inizializza window.preferiti se non esiste
      const instance = getInstanceAtIndex(activeElementIndex);
      const sopUID = getSopUIDAtIndex(activeElementIndex);
      const imageId = getImageIdAtIndex(activeElementIndex);

      if (!sopUID) {
        return;
      }

      if (!window.preferiti) {
        window.preferiti = [];
      }
      if (!checked && document.getElementById('preferiti-btn')) {
        document.getElementById('preferiti-btn').classList.remove('pulse');
        // Filtra l'array preferiti rimuovendo l'elemento che corrisponde ai criteri
        window.preferiti = window.preferiti.filter(preferito => {
          return !(
            preferito.SeriesInstanceUID === SeriesInstanceUID && preferito.SOPInstanceUID === sopUID
          );
        });
        setIsPreferito(false);
        //Se ho la clipbooard preferiti aperta, aggiorno i preferiti in tempo reale dopo la rimozione
        if (document.getElementById('area-lista-preferiti')) {
          document.getElementById('area-lista-preferiti').remove();
          document
            .getElementById('preferiti-tools')
            .insertAdjacentHTML('beforeend', '<div id="area-lista-preferiti"></div>');

          for (const preferito of window.preferiti) {
            document.getElementById('area-lista-preferiti').insertAdjacentHTML(
              'afterbegin',
              `
            <div class="col">
            <img onclick="window.viewPreferitoPopup('${preferito.DataUrl}')" src=${preferito.DataUrl} />
            <p>Serie ${preferito.NumeroSerie} - ${preferito.DescrizioneSerie}</p>
            <p>N¶ø istanza: ${preferito.NumeroIstanza}</p>
            <button class="rimuovi-preferito-btn" onclick="window.rimuoviPreferito('${preferito.SOPInstanceUID}')">Rimuovi</button>
            </div>
            `
            );
          }
        }
        uiNotificationService.show({
          title: 'Preferiti',
          message: `Preferito rimosso`,
          type: 'error',
        });
        window.dispatchEvent(new Event('mdv-preferiti-updated'));
      }

      // Aggiungo l'elemento ai preferiti salvando screen dell'intera div con misurazioni e tutto
      // if (!isAlreadyPreferito && checked) {
      //   captureScreenshot().then(imgData => {
      //     const SOPInstanceUID = displaySets[0].instances[activeElementIndex].SOPInstanceUID;
      //     const NumeroSerie = displaySets[0].instances[activeElementIndex].SeriesNumber;
      //     const DescrizioneSerie = displaySets[0].instances[activeElementIndex].SeriesDescription;
      //     const NumeroIstanza = activeElementIndex + 1;
      //     window.preferiti.push({
      //       SeriesInstanceUID,
      //       SOPInstanceUID: SOPInstanceUID,
      //       DataUrl: imgData,
      //       NumeroSerie: NumeroSerie,
      //       DescrizioneSerie: DescrizioneSerie,
      //       NumeroIstanza: NumeroIstanza,
      //     });
      //     //Se ho la clipbooard preferiti aperta, inserisco il preferito in tempo reale
      //     if (document.getElementById('area-lista-preferiti')) {
      //       document.getElementById('area-lista-preferiti').insertAdjacentHTML(
      //         'afterbegin',
      //         `
      //       <div class="col">
      //       <img onclick="window.viewPreferitoPopup('${imgData}')" src=${imgData} />
      //       <p>Serie ${NumeroSerie} - ${DescrizioneSerie}</p>
      //       <p>N¶ø istanza: ${NumeroIstanza}</p>
      //       <button class="rimuovi-preferito-btn" onclick="window.rimuoviPreferito('${SOPInstanceUID}')">Rimuovi</button>
      //       </div>
      //       `
      //       );
      //     }
      //   });
      // }

      //Cattura del canvas senza misurazioni e altro anzichÇ¸ di tutta la div
      if (!isPreferito && checked && document.getElementById('preferiti-btn')) {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
        const SOPInstanceUID = sopUID;
        const NumeroSerie = instance?.SeriesNumber ?? displaySets?.[0]?.instance?.SeriesNumber;
        const DescrizioneSerie =
          instance?.SeriesDescription ?? displaySets?.[0]?.instance?.SeriesDescription;
        const NumeroIstanza = activeElementIndex + 1;
        const imgData =
          (await captureImageFromImageId(imageId, viewport)) ||
          document.querySelector('.mdv-selected .cornerstone-canvas')?.toDataURL('image/png');
        if (!imgData) {
          return;
        }

        // Cattura ANCHE una versione con le annotazioni (misurazioni
        // length/area/...) componendo il canvas + il layer SVG. Best-effort:
        // se fallisce ricadiamo sul DataUrl pulito così il print builder
        // continua a funzionare anche senza annotazioni.
        //
        // NB: passiamo `viewport` a captureImageWithAnnotationsFromElement
        // così quest'ultima può calcolare il rect dell'immagine nativa e
        // croppare l'output escludendo i bordi neri del viewport (senza
        // crop, il print builder fitterebbe anche i bordi nella cella e
        // l'immagine apparirebbe rimpicciolita).
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
        logPreferitiDebug('preferito-save', {
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

        window.preferiti.push({
          SeriesInstanceUID,
          SOPInstanceUID: SOPInstanceUID,
          DataUrl: imgData,
          DataUrlPrintBase: imgDataPrintBase,
          DataUrlAnnotated: imgDataAnnotated,
          DataUrlAnnotationOverlay: annotationOverlayDataUrl || null,
          NumeroSerie: NumeroSerie,
          DescrizioneSerie: DescrizioneSerie,
          NumeroIstanza: NumeroIstanza,
        });
        setIsPreferito(true);

        //Se ho la clipbooard preferiti aperta, inserisco il preferito in tempo reale
        if (document.getElementById('area-lista-preferiti')) {
          document.getElementById('area-lista-preferiti').insertAdjacentHTML(
            'afterbegin',
            `
        <div class="col">
        <img onclick="window.viewPreferitoPopup('${imgData}')" src=${imgData} />
        <p>Serie ${NumeroSerie} - ${DescrizioneSerie}</p>
        <p>N¶ø istanza: ${NumeroIstanza}</p>
        <button class="rimuovi-preferito-btn" onclick="window.rimuoviPreferito('${SOPInstanceUID}')">Rimuovi</button>
        </div>
      `
          );
        }

        document.getElementById('preferiti-btn').classList.add('pulse');

        uiNotificationService.show({
          title: 'Preferiti',
          message: `Aggiunto ai preferiti`,
          type: 'success',
        });
        window.dispatchEvent(new Event('mdv-preferiti-updated'));
      }

      document.querySelector('.mdv-selected .preferiti-btn').click(); //Nascondo cosÇª lo switch appena aperto
    },
    [
      displaySets,
      isPreferito,
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
      {/* <button onClick={onSetPreferito}>
        {!isAlreadyPreferito ? 'Aggiungi ai preferiti' : 'Rimuovi'}
      </button> */}
      <SwitchButton
        label={!isPreferito ? 'Aggiungi ai preferiti' : 'Rimuovi dai preferiti'}
        checked={isPreferito}
        onChange={e => {
          void onSetPreferito(e);
        }}
      />
    </div>
  );
}
