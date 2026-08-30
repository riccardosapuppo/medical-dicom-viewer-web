/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ============================================================
 * window.mdvPrint — sorgente immagini per l'editor di stampa
 * ------------------------------------------------------------
 * L'editor Stimulsoft (`platform/app/public/print/builder.html`) gira in un
 * iframe SAME-ORIGIN col viewer. Oltre ai preferiti (`window.parent.preferiti`)
 * vogliamo poter stampare anche tutte le istanze di una SERIE o dello STUDIO.
 *
 * Quelle istanze non sono necessariamente a schermo, quindi vanno renderizzate
 * off-screen partendo dall'imageId (come le thumbnail dello study browser).
 *
 * NOTE IMPLEMENTATIVE
 * - imageId: si ottengono con `dataSource.getImageIdsForDisplaySet(ds)` (modo
 *   canonico OHIF). `instances[i].imageId` può essere undefined per serie non
 *   ancora visualizzate → era la causa degli item vuoti su Serie/Studio.
 * - Cache per imageId: una volta renderizzata, l'immagine NON viene rifatta
 *   (ri-selezione serie/studio istantanea; aggiungere un'annotazione non forza
 *   il re-render dell'intera serie).
 * - Rendering parallelo (concorrenza limitata) + callback progressiva onItem.
 *
 * Gli item prodotti hanno la STESSA forma dei preferiti, così l'editor li
 * consuma senza modifiche al motore di stampa.
 *
 * Registrato a module-load + via registerMdvPrint() in init.tsx.
 * ============================================================
 */
import {
  metaData,
  imageLoader,
  utilities as csUtilities,
  Enums as csEnums,
  getEnabledElements as csGetEnabledElements,
} from '@cornerstonejs/core';
// Riusa la cattura "viewport vivo + layer annotazioni" dei preferiti, così le
// immagini di Serie/Studio attualmente a schermo mostrano le misurazioni.
import { captureImageWithAnnotationsFromElement } from '../components/Preferiti/Preferiti';

const MAX_EDGE = 1536;
const RENDER_CONCURRENCY = 4;

// Cache imageId -> { DataUrl, width, height }. Persistente per sessione.
const renderCache = new Map<string, { DataUrl: string; width: number; height: number }>();

function log(...args: unknown[]): void {
  try {
    // eslint-disable-next-line no-console
    console.log('[mdvPrint]', ...args);
  } catch {
    /* noop */
  }
}

type PrintItem = {
  DataUrl: string;
  DataUrlPrintBase: string;
  DataUrlAnnotated: string;
  DataUrlAnnotationOverlay: string | null;
  NumeroSerie: number | string | null;
  DescrizioneSerie: string;
  NumeroIstanza: number | string | null;
  SeriesInstanceUID: string | null;
  SOPInstanceUID: string | null;
  imageId: string;
};

type SeriesInfo = {
  displaySetInstanceUID: string;
  seriesInstanceUID: string | null;
  seriesNumber: number | string | null;
  seriesDescription: string;
  modality: string;
  instanceCount: number;
};

type RenderOpts = {
  onProgress?: (done: number, total: number) => void;
  onItem?: (item: PrintItem, index: number) => void;
  signal?: { aborted?: boolean } | null;
};

function getServices(): any {
  return (window as any).servicesManager?.services ?? null;
}

function getActiveDataSource(): any {
  try {
    const em = (window as any).extensionManager;
    const ds = em?.getActiveDataSource?.();
    if (Array.isArray(ds)) return ds[0] ?? null;
    return ds ?? null;
  } catch {
    return null;
  }
}

// imageId di un display set: prima via dataSource (canonico), poi fallback.
function getImageIdsForDisplaySet(ds: any): string[] {
  try {
    const dataSource = getActiveDataSource();
    const ids = dataSource?.getImageIdsForDisplaySet?.(ds);
    if (Array.isArray(ids) && ids.length) return ids.filter(Boolean);
  } catch {
    /* fallback sotto */
  }
  if (Array.isArray(ds?.instances)) {
    const ids = ds.instances.map((i: any) => i?.imageId).filter(Boolean);
    if (ids.length) return ids;
  }
  if (Array.isArray(ds?.imageIds) && ds.imageIds.length) return ds.imageIds.filter(Boolean);
  return [];
}

// Studio corrente: prima dal viewport attivo, poi da window.mdvStudyInstanceUIDs.
function getCurrentStudyUID(): string | null {
  const services = getServices();
  try {
    const vgs = services?.viewportGridService;
    const activeId = vgs?.getState?.().activeViewportId;
    const dsUIDs = activeId ? vgs.getDisplaySetsUIDsForViewport?.(activeId) : null;
    if (dsUIDs?.length) {
      const primary = services.displaySetService.getDisplaySetByUID(dsUIDs[0]);
      if (primary?.StudyInstanceUID) return primary.StudyInstanceUID;
    }
  } catch {
    /* fallback sotto */
  }
  return (window as any).mdvStudyInstanceUIDs || null;
}

// Display set "immagine" dello studio corrente (scarta SR/SEG/ecc.).
function getImageDisplaySetsForStudy(): any[] {
  const displaySetService = getServices()?.displaySetService;
  if (!displaySetService) {
    log('no displaySetService');
    return [];
  }

  const all: any[] =
    displaySetService.getActiveDisplaySets?.() || displaySetService.activeDisplaySets || [];

  const studyUID = getCurrentStudyUID();
  let sets = all;
  if (studyUID) {
    const filtered = all.filter((ds: any) => ds?.StudyInstanceUID === studyUID);
    if (filtered.length) sets = filtered;
  }

  return sets.filter(
    (ds: any) => ds && !ds.unsupported && getImageIdsForDisplaySet(ds).length > 0
  );
}

function listStudySeries(): SeriesInfo[] {
  const sets = getImageDisplaySetsForStudy();
  const series: SeriesInfo[] = sets.map((ds: any) => {
    const first = (Array.isArray(ds.instances) && ds.instances.find((i: any) => i)) || {};
    return {
      displaySetInstanceUID: ds.displaySetInstanceUID,
      seriesInstanceUID: ds.SeriesInstanceUID || first?.SeriesInstanceUID || null,
      seriesNumber: ds.SeriesNumber ?? first?.SeriesNumber ?? null,
      seriesDescription: ds.SeriesDescription || first?.SeriesDescription || '',
      modality: ds.Modality || first?.Modality || '',
      instanceCount: getImageIdsForDisplaySet(ds).length,
    };
  });

  series.sort((a, b) => {
    const na = a.seriesNumber == null ? Number.MAX_SAFE_INTEGER : Number(a.seriesNumber);
    const nb = b.seriesNumber == null ? Number.MAX_SAFE_INTEGER : Number(b.seriesNumber);
    return na - nb;
  });

  log('listStudySeries →', series.length, 'serie', series.map(s => `${s.seriesNumber}:${s.instanceCount}`));
  return series;
}

function computeTargetSize(nativeW: number, nativeH: number): { w: number; h: number } {
  const w = Number.isFinite(nativeW) && nativeW > 0 ? nativeW : 1024;
  const h = Number.isFinite(nativeH) && nativeH > 0 ? nativeH : 1024;
  const longEdge = Math.max(w, h);
  if (longEdge <= MAX_EDGE) return { w, h };
  const ratio = MAX_EDGE / longEdge;
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
}

function canvasToDataUrl(src: HTMLCanvasElement, targetW: number, targetH: number): string {
  if (src.width === targetW && src.height === targetH) return src.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(src, 0, 0, targetW, targetH);
  }
  return out.toDataURL('image/png');
}

// Renderizza un'istanza pulita (con cache). force=true bypassa la cache.
async function renderInstance(
  imageId: string,
  opts: { force?: boolean } = {}
): Promise<{ DataUrl: string; width: number; height: number } | null> {
  if (!imageId) return null;
  if (!opts.force && renderCache.has(imageId)) return renderCache.get(imageId)!;

  try {
    const imagePixelModule: any = metaData.get?.('imagePixelModule', imageId) || {};
    const photometric = (imagePixelModule.photometricInterpretation || '').toString().toUpperCase();
    const isColor =
      imagePixelModule.samplesPerPixel > 1 ||
      photometric.includes('RGB') ||
      photometric.includes('YBR') ||
      photometric.includes('PALETTE');
    const hasPhotometric = Boolean(photometric);

    const nativeW = Number(imagePixelModule.columns) || 0;
    const nativeH = Number(imagePixelModule.rows) || 0;
    const target = computeTargetSize(nativeW, nativeH);
    const reqType = (csEnums as any)?.RequestType?.Thumbnail;

    // --- Path immagine a colori ---
    if (isColor && imageLoader?.loadImage) {
      try {
        const image: any = await imageLoader.loadImage(imageId, {
          requestType: reqType,
          priority: -5,
          useRGBA: false,
        });
        if (image?.getCanvas) {
          const srcCanvas: HTMLCanvasElement = image.getCanvas();
          if (srcCanvas && srcCanvas.width && srcCanvas.height) {
            const tsize = computeTargetSize(srcCanvas.width, srcCanvas.height);
            const DataUrl = canvasToDataUrl(srcCanvas, tsize.w, tsize.h);
            const result = { DataUrl, width: tsize.w, height: tsize.h };
            renderCache.set(imageId, result);
            return result;
          }
        }
      } catch {
        /* fallback al path loadImageToCanvas */
      }
    }

    // --- Path grayscale / fallback ---
    const canvas = document.createElement('canvas');
    canvas.width = nativeW > 0 ? nativeW : 1024;
    canvas.height = nativeH > 0 ? nativeH : 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await csUtilities.loadImageToCanvas({
      canvas,
      imageId,
      useCPURendering: isColor || !hasPhotometric,
      requestType: reqType,
    } as any);

    const DataUrl = canvasToDataUrl(canvas, target.w, target.h);
    const result = { DataUrl, width: target.w, height: target.h };
    renderCache.set(imageId, result);
    return result;
  } catch (error) {
    log('render istanza fallito', imageId, (error as any)?.message || error);
    return null;
  }
}

function getSopInstanceUID(imageId: string): string | null {
  try {
    return (metaData.get?.('sopCommonModule', imageId) as any)?.sopInstanceUID || null;
  } catch {
    return null;
  }
}

// Una "entry" da renderizzare: imageId + metadati (presi a livello di display
// set, affidabili) + posizione nella serie (1-based) usata come numero immagine.
type RenderEntry = {
  imageId: string;
  NumeroSerie: number | string | null;
  DescrizioneSerie: string;
  NumeroIstanza: number;
  SeriesInstanceUID: string | null;
};

// Costruisce le entry per un display set: NumeroSerie/DescrizioneSerie dal
// display set, NumeroIstanza = posizione nella serie (sempre corretta e
// distinta; il lookup per-immagine di InstanceNumber non è affidabile qui).
function buildEntriesForDisplaySet(ds: any): RenderEntry[] {
  const first = (Array.isArray(ds?.instances) && ds.instances.find((i: any) => i)) || {};
  const numeroSerie = ds?.SeriesNumber ?? first?.SeriesNumber ?? null;
  const descrizioneSerie = ds?.SeriesDescription || first?.SeriesDescription || '';
  const seriesUID = ds?.SeriesInstanceUID || first?.SeriesInstanceUID || null;
  return getImageIdsForDisplaySet(ds).map((imageId: string, i: number) => ({
    imageId,
    NumeroSerie: numeroSerie,
    DescrizioneSerie: descrizioneSerie,
    NumeroIstanza: i + 1,
    SeriesInstanceUID: seriesUID,
  }));
}

function makeAbortError(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

// Mappa imageId -> { viewport, element } per le immagini ATTUALMENTE mostrate
// negli enabled element. Serve a catturarne le annotazioni dal viewport vivo.
function getDisplayedImageElements(): Map<string, { viewport: any; element: HTMLElement }> {
  const map = new Map<string, { viewport: any; element: HTMLElement }>();
  try {
    const enabled: any[] = (csGetEnabledElements?.() as any[]) || [];
    for (const e of enabled) {
      const vp = e?.viewport;
      const element = vp?.element as HTMLElement | undefined;
      if (!vp || !element) continue;
      let imageId: string | null = null;
      try {
        if (typeof vp.getCurrentImageId === 'function') imageId = vp.getCurrentImageId();
      } catch {
        /* noop */
      }
      if (imageId) map.set(imageId, { viewport: vp, element });
    }
  } catch {
    /* noop */
  }
  return map;
}

type ImageUrls = {
  DataUrl: string;
  DataUrlPrintBase: string;
  DataUrlAnnotationOverlay: string | null;
  DataUrlAnnotated: string;
};

// Risolve gli URL di un'immagine. Se è a schermo e HA annotazioni, cattura
// base croppata + overlay + annotata dal viewport vivo (riuso della logica
// dei preferiti) così le misurazioni compaiono anche in Serie/Studio.
// Altrimenti render pulito (cachato).
async function resolveImageUrls(
  imageId: string,
  displayed?: { viewport: any; element: HTMLElement }
): Promise<ImageUrls | null> {
  if (displayed?.element) {
    try {
      const overlay = await captureImageWithAnnotationsFromElement(displayed.element, {
        drawBase: false,
        drawAnnotations: true,
        viewport: displayed.viewport,
      });
      if (overlay) {
        const printBase = await captureImageWithAnnotationsFromElement(displayed.element, {
          drawBase: true,
          drawAnnotations: false,
          viewport: displayed.viewport,
        });
        const annotated = await captureImageWithAnnotationsFromElement(displayed.element, {
          drawBase: true,
          drawAnnotations: true,
          viewport: displayed.viewport,
        });
        const clean = (await renderInstance(imageId))?.DataUrl || printBase || annotated || '';
        const base = printBase || clean;
        if (base) {
          return {
            DataUrl: clean || base,
            DataUrlPrintBase: base,
            DataUrlAnnotationOverlay: overlay,
            DataUrlAnnotated: annotated || base,
          };
        }
      }
    } catch {
      /* fallback al render pulito */
    }
  }

  const r = await renderInstance(imageId);
  if (!r?.DataUrl) return null;
  return {
    DataUrl: r.DataUrl,
    DataUrlPrintBase: r.DataUrl,
    DataUrlAnnotationOverlay: null,
    DataUrlAnnotated: r.DataUrl,
  };
}

// Renderizza un set di entry in parallelo (concorrenza limitata) con progress
// + callback progressiva. Mantiene l'ordine nell'array finale.
async function renderImageIds(entries: RenderEntry[], opts: RenderOpts = {}): Promise<PrintItem[]> {
  const { onProgress, onItem, signal } = opts;
  const total = entries.length;
  const items: PrintItem[] = new Array(total);
  const displayedMap = getDisplayedImageElements();
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < total) {
      if (signal?.aborted) throw makeAbortError();
      const i = next++;
      const entry = entries[i];
      const urls = await resolveImageUrls(entry.imageId, displayedMap.get(entry.imageId));
      done++;
      try {
        onProgress?.(done, total);
      } catch {
        /* noop */
      }
      if (urls?.DataUrl) {
        const item: PrintItem = {
          DataUrl: urls.DataUrl,
          DataUrlPrintBase: urls.DataUrlPrintBase,
          DataUrlAnnotated: urls.DataUrlAnnotated,
          DataUrlAnnotationOverlay: urls.DataUrlAnnotationOverlay,
          imageId: entry.imageId,
          NumeroSerie: entry.NumeroSerie,
          DescrizioneSerie: entry.DescrizioneSerie,
          NumeroIstanza: entry.NumeroIstanza,
          SeriesInstanceUID: entry.SeriesInstanceUID,
          SOPInstanceUID: getSopInstanceUID(entry.imageId),
        };
        items[i] = item;
        try {
          onItem?.(item, i);
        } catch {
          /* noop */
        }
      }
    }
  }

  const n = Math.min(RENDER_CONCURRENCY, total);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < n; w++) workers.push(worker());
  await Promise.all(workers);

  return items.filter(Boolean) as PrintItem[];
}

async function getSeriesItems(
  displaySetInstanceUID: string,
  opts: RenderOpts = {}
): Promise<PrintItem[]> {
  const ds = getServices()?.displaySetService?.getDisplaySetByUID?.(displaySetInstanceUID);
  if (!ds) {
    log('getSeriesItems: displaySet non trovato', displaySetInstanceUID);
    return [];
  }
  const entries = buildEntriesForDisplaySet(ds);
  log('getSeriesItems', displaySetInstanceUID, '→', entries.length, 'imageId');
  return renderImageIds(entries, opts);
}

async function getStudyItems(opts: RenderOpts = {}): Promise<PrintItem[]> {
  const sets = getImageDisplaySetsForStudy();
  const entries: RenderEntry[] = [];
  for (const ds of sets) {
    for (const entry of buildEntriesForDisplaySet(ds)) entries.push(entry);
  }
  log('getStudyItems', sets.length, 'serie →', entries.length, 'imageId');
  return renderImageIds(entries, opts);
}

function countStudyInstances(): number {
  return getImageDisplaySetsForStudy().reduce(
    (sum, ds) => sum + getImageIdsForDisplaySet(ds).length,
    0
  );
}

// Conta quante immagini NON sono ancora in cache (cioè quante saranno
// effettivamente renderizzate). Usato dal builder per saltare il confirm di
// soglia quando tutto è già cachato.
function countUncachedIds(imageIds: string[]): number {
  let n = 0;
  for (const id of imageIds) if (!renderCache.has(id)) n++;
  return n;
}

function countUncachedForSeries(displaySetInstanceUID: string): number {
  const ds = getServices()?.displaySetService?.getDisplaySetByUID?.(displaySetInstanceUID);
  if (!ds) return 0;
  return countUncachedIds(getImageIdsForDisplaySet(ds));
}

function countUncachedForStudy(): number {
  let n = 0;
  for (const ds of getImageDisplaySetsForStudy()) {
    n += countUncachedIds(getImageIdsForDisplaySet(ds));
  }
  return n;
}

// Invalida la cache di un'immagine (es. dopo aver aggiunto un'annotazione su
// quell'imageId) così il prossimo render la rifà; il resto della serie resta
// in cache e NON viene rifatto.
function invalidate(imageId: string): void {
  if (imageId) renderCache.delete(imageId);
}

function clearCache(): void {
  renderCache.clear();
}

export function registerMdvPrint(): void {
  (window as any).mdvPrint = {
    listStudySeries,
    renderInstance,
    getSeriesItems,
    getStudyItems,
    countStudyInstances,
    countUncachedForSeries,
    countUncachedForStudy,
    invalidate,
    clearCache,
    MAX_EDGE,
  };
}

// Registra subito a module-load per disponibilità precoce; init.tsx la richiama
// comunque esplicitamente (idempotente) così l'inclusione nel bundle è garantita.
registerMdvPrint();
