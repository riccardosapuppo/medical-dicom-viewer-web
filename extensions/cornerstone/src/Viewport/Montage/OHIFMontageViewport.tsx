import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import { eventTarget, RenderingEngine, getRenderingEngine } from '@cornerstonejs/core';
import { ToolGroupManager, Enums as csToolsEnums } from '@cornerstonejs/tools';

import { ImageScrollbar } from '@ohif/ui';

import MontageCell from './MontageCell';
import { deriveMontageCells, clampBase, DEFAULT_MONTAGE } from '../../types/Montage';
import './Montage.css';
// eslint-disable-next-line import/no-relative-packages
import {
  applyFraming,
  framingBeforeResize,
} from '../../../../../platform/app/public/estensioni/gestioneHP/framing';

/**
 * Viewport "Montage": suddivide UNA viewport OHIF in una sottogriglia interna di
 * righe×colonne celle, tutte sulla stessa serie, condividendo cache pixel,
 * strumenti e sincronizzazione (WL/VOI/zoom/pan/invert/LUT). Non crea viewport
 * OHIF aggiuntive nella griglia principale. Vedi docs/montage-viewport-design.md.
 *
 * Le celle vivono in un RenderingEngine DEDICATO (ohif-montage-<viewportId>):
 * così le operazioni sulle celle (enable/disable/resize) NON riconfigurano
 * l'offscreen condiviso dell'engine principale e NON fanno lampeggiare le altre
 * viewport. Le celle entrano nel toolGroup 'montage' (sincronizzazione + tool).
 * La cella 0 assume l'id della viewport OHIF attiva; inoltre il viewportId viene
 * registrato come "phantom" nel toolGroup 'montage' sotto l'engine principale,
 * così la toolbar risolve correttamente lo stato dei bottoni per la viewport.
 */
function OHIFMontageViewport(props: withAppTypes) {
  const { viewportId, displaySets, viewportOptions, dataSource, servicesManager } = props;
  const { syncGroupService, viewportGridService, cornerstoneViewportService, uiNotificationService } =
    servicesManager.services;

  const displaySet = displaySets?.[0];

  // Risolto UNA volta: tutte le celle riusano lo stesso array → cache condivisa.
  const imageIds: string[] = useMemo(() => {
    if (!displaySet) {
      return [];
    }
    try {
      const ids = dataSource?.getImageIdsForDisplaySet?.(displaySet);
      if (ids?.length) {
        return ids;
      }
    } catch (e) {
      /* fallback sotto */
    }
    if (displaySet.imageIds?.length) {
      return displaySet.imageIds;
    }
    if (displaySet.images?.length) {
      return displaySet.images.map((img: any) => img.imageId).filter(Boolean);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySet?.displaySetInstanceUID]);

  const total = imageIds.length;

  const montage = { ...DEFAULT_MONTAGE, ...(viewportOptions?.montage || {}) };
  const rows = Math.max(1, montage.rows);
  const cols = Math.max(1, montage.cols);
  const visibleCount = rows * cols;

  const displaySetUID = displaySet?.displaySetInstanceUID;

  const [base, setBase] = useState(() => clampBase(montage.firstImageIndex || 0, total, visibleCount));
  const baseRef = useRef(base);
  useEffect(() => {
    baseRef.current = base;
  }, [base]);

  // Riallinea `base` quando cambia il layout o il numero di immagini.
  useEffect(() => {
    setBase(prev => clampBase(prev, total, visibleCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, total]);

  // Cambio serie (drag&drop di un'altra serie sulla viewport, o click su una
  // miniatura mentre la sottogriglia è attiva): riparti dalla prima immagine
  // della nuova serie. Le celle vengono rimontate (vedi `key` sotto) così
  // ricaricano lo stack corretto invece di mostrare un "mix" vecchia/nuova.
  // NB: salto il PRIMO run (mount), altrimenti azzererei il `firstImageIndex`
  // fornito da un Hanging Protocol (scroll/istanza salvata della sottogriglia).
  const firstDisplaySetRunRef = useRef(true);
  useEffect(() => {
    if (firstDisplaySetRunRef.current) {
      firstDisplaySetRunRef.current = false;
      return;
    }
    setBase(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySetUID]);

  // Badge descrizione serie (a livello griglia) + tooltip moderno SOLO se il
  // testo è troncato. Misuriamo la troncatura (scrollWidth > clientWidth) e ci
  // riaggiorniamo sui resize della badge (cambio layout/finestra). Quando NON è
  // troncato il badge resta `pointer-events:none` (vedi CSS): nessun tooltip e
  // nessuna interferenza col lavoro nella viewport.
  const seriesBadgeText = useMemo(
    () =>
      [
        displaySet?.SeriesNumber != null ? `S${displaySet.SeriesNumber}` : null,
        displaySet?.SeriesDescription || null,
      ]
        .filter(Boolean)
        .join(': '),
    [displaySet?.SeriesNumber, displaySet?.SeriesDescription]
  );
  const seriesBadgeRef = useRef<HTMLDivElement>(null);
  const [seriesBadgeTruncated, setSeriesBadgeTruncated] = useState(false);
  useEffect(() => {
    const el = seriesBadgeRef.current;
    if (!el) {
      setSeriesBadgeTruncated(false);
      return;
    }
    const measure = () => setSeriesBadgeTruncated(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [seriesBadgeText, cols, rows]);

  // RenderingEngine DEDICATO alla sottogriglia: le celle vivono qui, NON
  // nell'engine principale. Così enable/disable/resize delle celle (attivazione,
  // cambio layout, refit) riconfigurano SOLO l'offscreen della sottogriglia e
  // NON causano il ri-render/lampeggio di tutte le altre viewport della griglia.
  const renderingEngineId = `ohif-montage-${viewportId}`;
  const renderingEngine = useMemo(
    () => getRenderingEngine(renderingEngineId) || new RenderingEngine(renderingEngineId),
    [renderingEngineId]
  );

  // toolGroup dedicato alla montage: come 'default' per interazione e misure, ma
  // SENZA i tool cross-viewport (ReferenceLines/Crosshairs/ReferenceCursors),
  // privi di senso tra celle della stessa serie.
  // Fallback a 'default' se il toolGroup 'montage' non è stato creato dal mode.
  const toolGroupId = ToolGroupManager.getToolGroup('montage')
    ? 'montage'
    : viewportOptions?.toolGroupId || 'default';
  const voiSyncId = `montage-voi-${viewportId}`;
  const zoomPanSyncId = `montage-zoompan-${viewportId}`;

  // Teardown dell'engine dedicato all'unmount (uscita dalla sottogriglia/cambio
  // serie). Inoltre registriamo un riferimento "phantom" della viewport OHIF nel
  // toolGroup 'montage' SOTTO l'engine principale: serve solo a far risolvere
  // toolGroupService.getToolGroupForViewport(viewportId) (che interroga l'engine
  // principale) → così i bottoni della toolbar valutano stato attivo/disabilitato
  // correttamente. Il phantom non ha un enabled-element, quindi non renderizza.
  useEffect(() => {
    const mainEngineId = cornerstoneViewportService.getRenderingEngine?.()?.id;
    if (mainEngineId) {
      try {
        ToolGroupManager.getToolGroup(toolGroupId)?.addViewport(viewportId, mainEngineId);
      } catch (e) {
        /* noop */
      }
    }
    return () => {
      try {
        if (mainEngineId) {
          ToolGroupManager.getToolGroup(toolGroupId)?.removeViewports(mainEngineId, viewportId);
        }
      } catch (e) {
        /* noop */
      }
      try {
        renderingEngine.destroy();
      } catch (e) {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Segnala alla griglia che la viewport è pronta (il percorso normale passa da
  // onElementEnabled, qui assente perché non usiamo cornerstoneViewportService).
  useEffect(() => {
    viewportGridService?.setViewportIsReady?.(viewportId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportId]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport REALI delle celle nell'engine dedicato. Gli id sono TUTTI della
  // forma `<viewportId>::montage::<k>` con k da 0 (deriveMontageCells in
  // types/Montage.ts): il vecchio mapping "cella 0 = viewportId" e' obsoleto e
  // lasciava la PRIMA cella fuori da refit/ripristini (nel one-up restava a fit,
  // piu' grande delle altre). Filtro a prefisso, robusto a entrambi gli schemi.
  const getCellViewports = useCallback((): any[] => {
    if (!renderingEngine) {
      return [];
    }
    const prefix = `${viewportId}::montage::`;
    return (renderingEngine.getViewports() as any[]).filter(
      vp => vp.id === viewportId || String(vp.id).startsWith(prefix)
    );
  }, [renderingEngine, viewportId]);

  // Rifit della camera SOLO delle celle montage (non tocca le altre viewport).
  const resetCellCameras = useCallback(() => {
    if (!renderingEngine) {
      return;
    }
    getCellViewports().forEach(vp => {
      vp?.resetCamera?.();
      vp?.render?.();
    });
  }, [renderingEngine, getCellViewports]);

  // Ridimensiona l'engine (preserva la camera) e rifà il fit delle celle. Usato
  // all'attivazione/cambio layout, quando non scatta un resize della griglia e i
  // canvas delle celle sarebbero altrimenti mal dimensionati (immagini stirate).
  const refitCells = useCallback(() => {
    if (!renderingEngine) {
      return;
    }
    try {
      // Qui il risultato voluto E' il fit: keepCamera non serve (ed emetterebbe
      // la stessa cascata sync descritta in onContainerResize).
      renderingEngine.resize(true, false);
      resetCellCameras();
    } catch (e) {
      /* noop */
    }
  }, [renderingEngine, resetCellCameras]);

  // Refit all'attivazione/cambio layout (su rAF: la griglia CSS è già misurata).
  // Dipende da rows/cols/total (NON da `base`): lo scroll non rifà il fit, così
  // lo zoom impostato dall'utente è preservato durante lo scorrimento.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      refitCells();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, total, refitCells]);

  // Ripristino dello stato salvato delle celle (window level + zoom/pan) quando
  // la sottogriglia è (ri)creata da un Hanging Protocol: i valori arrivano in
  // viewportOptions.montage.{voiRange,viewPresentation}. Le celle si creano in
  // modo asincrono e fanno auto-fit (resetCamera), quindi applichiamo UNA volta
  // sola dopo che si sono stabilizzate (best-effort). Lo scroll/istanza è invece
  // gestito da `firstImageIndex` (init di `base`).
  const restoredCellStateRef = useRef(false);
  useEffect(() => {
    const mv = (montage as any).viewPresentation;
    const voi = (montage as any).voiRange;
    const colormap = (montage as any).colormap;
    if ((!mv && !voi && !colormap) || restoredCellStateRef.current) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let lastSize = '';
    const MAX_ATTEMPTS = 20;
    const tryApply = () => {
      attempts += 1;
      // Geometria stabile? Durante one-up / cambio layout il contenitore passa per
      // dimensioni provvisorie. Lo zoom del viewPresentation e' RELATIVO alla
      // camera di fit della cella: applicato su una geometria provvisoria produce
      // una camera sballata (immagini ridotte a un puntino) che il resize
      // successivo, con keepCamera, CONSERVA. Si applica solo quando il
      // contenitore ha una dimensione reale, uguale a quella del tentativo
      // precedente.
      const el = containerRef.current;
      const size = el ? `${el.clientWidth}x${el.clientHeight}` : '';
      const stable = !!el && el.clientWidth > 8 && el.clientHeight > 8 && size === lastSize;
      lastSize = size;
      if (!stable) {
        if (attempts < MAX_ATTEMPTS) {
          timer = setTimeout(tryApply, 150);
        }
        return;
      }
      const cellViewports = getCellViewports();
      let ready = cellViewports.length > 0;
      let appliedAny = false;
      for (const vp of cellViewports) {
        // Aspetta che la cella abbia un'immagine renderizzata: altrimenti
        // setProperties/voiRange non "attacca" (è il caso del WL che spariva).
        if (!vp || !vp.getImageData || !vp.getImageData()) {
          ready = false;
          continue;
        }
        try {
          if (voi && Number.isFinite(voi.lower) && Number.isFinite(voi.upper)) {
            vp.setProperties({ voiRange: { lower: voi.lower, upper: voi.upper } });
          }
          if (colormap && (colormap.name || typeof colormap === 'string')) {
            vp.setProperties({
              colormap: typeof colormap === 'string' ? { name: colormap } : colormap,
            });
          }
          if (mv) {
            // Riferimento sano: rifa' il fit sulla geometria ATTUALE della cella
            // prima di applicare zoom/pan relativi. Una cella creata durante una
            // transizione di layout ha una camera iniziale di una dimensione
            // provvisoria, e zoom/pan relativi a quella non hanno senso.
            vp.resetCamera?.();
            vp.setViewPresentation(mv);
          }
          vp.render();
          appliedAny = true;
        } catch (e) {
          ready = false;
        }
      }
      if (window.mdvHPDebug) {
        // eslint-disable-next-line no-console
        console.log('[HP] montage restore', { viewportId, attempt: attempts, ready, appliedAny, voi, colormap, hasPresentation: !!mv });
      }
      if (ready && appliedAny) {
        restoredCellStateRef.current = true;
        return;
      }
      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(tryApply, 150);
      }
    };
    timer = setTimeout(tryApply, 150);
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(montage as any).viewPresentation, (montage as any).voiRange, rows, cols, total]);

  // Resize del contenitore (one-up/ritorno, toggle pannelli, resize finestra):
  // pan/zoom delle celle preservati in forma RELATIVA via framing.js (vedi
  // commento nel corpo: il keepCamera di cornerstone qui non e' utilizzabile
  // per la cascata del sync zoompan). Il fit iniziale e' gestito dall'effetto
  // su rows/cols/total (attivazione/cambio layout).
  const onContainerResize = useCallback(() => {
    if (!renderingEngine) {
      return;
    }
    try {
      // Le celle sono collegate da un sync zoompan: con resize(keepCamera=true)
      // cornerstone le processa IN SEQUENZA (reset + ripristino) e ogni cella
      // emette CAMERA_MODIFIED; il sync riversa il suo stato transitorio sulle
      // celle non ancora processate, la cui "camera da conservare" viene quindi
      // fotografata gia' inquinata. Il rapporto vecchioFit/nuovoFit si compone
      // una volta per cella: misurato dal vivo 2.102^8 = 381.6 (zoom 381.603 nel
      // log del one-up) -> immagini a puntino o zoomate all'inverosimile.
      // Quindi: fotografia RELATIVA di ogni cella prima (framingBeforeResize),
      // resize SENZA keepCamera (tutte a fit: la propagazione del sync e'
      // innocua perche' il fit e' lo stesso stato per tutte), riapplicazione
      // per-cella a eventi soppressi (applyFraming) -> il sync non spara.
      const framings: Array<[string, any]> = [];
      getCellViewports().forEach(vp => {
        const framing = framingBeforeResize(vp);
        if (framing) {
          framings.push([vp.id, framing]);
        }
      });
      renderingEngine.resize(true, false);
      framings.forEach(([id, framing]) => applyFraming(renderingEngine.getViewport(id), framing));
      renderingEngine.render();
    } catch (e) {
      /* noop */
    }
  }, [renderingEngine, getCellViewports]);

  const { ref: resizeRef, height: containerHeight } = useResizeDetector({
    refreshMode: 'debounce',
    refreshRate: 30,
    // leading: rifà il fit SUBITO al primo evento di resize (es. ritorno dal
    // one-up) invece di aspettare il debounce → riduce il "lampo" di immagini
    // stirate prima del refit.
    refreshOptions: { leading: true },
    onResize: onContainerResize,
  });

  // Sync iniziale dello strumento attivo: il toolGroup 'montage' ha uno strumento
  // attivo proprio (di default WindowLevel). All'attivazione allineiamo lo
  // strumento attivo (e il cursore) a quello del toolGroup 'default'.
  useEffect(() => {
    const montageTg = ToolGroupManager.getToolGroup(toolGroupId);
    if (!montageTg) {
      return;
    }
    try {
      const defaultTg = ToolGroupManager.getToolGroup('default');
      const desired = defaultTg?.getActivePrimaryMouseButtonTool?.();
      const current = montageTg.getActivePrimaryMouseButtonTool?.();
      if (desired && montageTg.hasTool(desired) && desired !== current) {
        if (current) {
          montageTg.setToolPassive(current);
        }
        montageTg.setToolActive(desired, {
          bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
        });
      } else if (current) {
        montageTg.setViewportsCursorByToolName(current);
      }
    } catch (e) {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolGroupId, rows, cols, total]);

  // Mantiene il cursore delle celle allineato allo strumento attivo del toolGroup
  // montage ad ogni cambio strumento. Usa SOLO setViewportsCursorByToolName, che
  // NON rilancia TOOL_ACTIVATED → nessun loop (a differenza di setToolActive).
  useEffect(() => {
    const refreshCursor = () => {
      try {
        const montageTg = ToolGroupManager.getToolGroup(toolGroupId);
        const active = montageTg?.getActivePrimaryMouseButtonTool?.();
        if (active) {
          montageTg.setViewportsCursorByToolName(active);
        }
      } catch (e) {
        /* noop */
      }
    };
    eventTarget.addEventListener(csToolsEnums.Events.TOOL_ACTIVATED, refreshCursor);
    return () => {
      eventTarget.removeEventListener(csToolsEnums.Events.TOOL_ACTIVATED, refreshCursor);
    };
  }, [toolGroupId]);

  // Scala di riferimento (ScaleOverlay): all'apertura della sottogriglia
  // rispecchia lo stato dal toolGroup 'default' (se era attiva sulle viewport
  // normali la attiviamo anche qui, altrimenti la spegniamo). Il toggle dalla
  // toolbar mantiene poi i due toolGroup sincronizzati. NB: niente refit/resize
  // dinamico qui — lo spazio per l'etichetta è un padding STATICO sulle celle
  // (vedi .montage-cell in Montage.css), così non si interferisce col rendering.
  useEffect(() => {
    const tg = ToolGroupManager.getToolGroup(toolGroupId);
    if (!tg || !tg.hasTool?.('ScaleOverlay')) {
      return;
    }
    try {
      const defTg = ToolGroupManager.getToolGroup('default');
      const onInDefault =
        defTg?.getToolOptions?.('ScaleOverlay')?.mode === csToolsEnums.ToolModes.Enabled;
      const onHere =
        tg.getToolOptions?.('ScaleOverlay')?.mode === csToolsEnums.ToolModes.Enabled;
      if (onInDefault && !onHere) {
        tg.setToolEnabled('ScaleOverlay');
      } else if (!onInDefault && onHere) {
        tg.setToolDisabled('ScaleOverlay');
      }
    } catch (e) {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolGroupId]);

  // Scroll a blocchi: step = righe×colonne.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }
    const handler = (e: WheelEvent) => {
      // Capture + stopPropagation: intercetta la rotella PRIMA che raggiunga gli
      // enabled-element delle celle, così lo StackScroll del toolGroup condiviso
      // non scorre le singole celle. Lo scroll qui avanza di un BLOCCO intero.
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY > 0 ? 1 : -1;
      setBase(prev => clampBase(prev + dir * visibleCount, total, visibleCount));
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, { capture: true } as any);
  }, [visibleCount, total]);

  // Scroll col TOOL "Scorrimento" (drag tasto sinistro): deve muovere TUTTE le
  // celle insieme (come la rotella), non la singola cella. Quando lo strumento
  // attivo è StackScroll, intercettiamo il drag in capture (stopPropagation così
  // lo StackScroll di cornerstone NON scorre la singola cella) e aggiorniamo
  // `base` per tutto il blocco. Per gli altri strumenti (Pan/WL/Zoom) lasciamo
  // gestire a cornerstone normalmente.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }
    const PIXELS_PER_IMAGE = 4;
    let dragging = false;
    let startY = 0;
    let startBase = 0;

    const isScrollToolActive = () => {
      try {
        const tg = ToolGroupManager.getToolGroup(toolGroupId);
        return tg?.getActivePrimaryMouseButtonTool?.() === 'StackScroll';
      } catch (e) {
        return false;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      // Non intercettare i click sulla stellina dei preferiti né sulla scrollbar.
      if ((e.target as HTMLElement)?.closest?.('.montage-cell-fav, .scroll')) {
        return;
      }
      if (e.button !== 0 || !isScrollToolActive()) {
        return; // altri strumenti: lascia a cornerstone
      }
      dragging = true;
      startY = e.clientY;
      startBase = baseRef.current;
      e.preventDefault();
      e.stopPropagation();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const deltaImages = Math.round((e.clientY - startY) / PIXELS_PER_IMAGE);
      setBase(clampBase(startBase + deltaImages, total, visibleCount));
    };
    const onPointerUp = () => {
      dragging = false;
    };

    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
      window.removeEventListener('pointermove', onPointerMove, { capture: true } as any);
      window.removeEventListener('pointerup', onPointerUp, { capture: true } as any);
    };
  }, [toolGroupId, total, visibleCount]);

  const { cells } = useMemo(
    () => deriveMontageCells({ rows, cols, firstImageIndex: base }, total, viewportId),
    [rows, cols, base, total, viewportId]
  );

  // Scrollbar: lo scroll a blocchi muove `base` in [0, total - visibleCount].
  // Compare SOLO se c'è effettivamente da scorrere (più immagini delle celle
  // visibili nel layout corrente). Altezza calcolata come nelle viewport normali.
  const maxBase = Math.max(0, total - visibleCount);
  const scrollbarHeight = `${Math.max(40, (containerHeight || 0) - 40)}px`;

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      // react-resize-detector usa una ref-callback/object
      if (typeof resizeRef === 'function') {
        (resizeRef as (n: HTMLDivElement | null) => void)(node);
      } else if (resizeRef) {
        (resizeRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [resizeRef]
  );

  if (!displaySet || total === 0 || !renderingEngine) {
    return <div className="montage-grid montage-empty" />;
  }

  return (
    <div
      ref={setContainerRef}
      className={`montage-grid${maxBase > 0 ? ' montage-grid--scroll' : ''}`}
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
      data-montage-viewport-id={viewportId}
    >
      {/* Descrizione serie (una sola, a livello griglia: tutte le celle mostrano
          la STESSA serie) → si capisce quale serie si sta vedendo. */}
      {seriesBadgeText && (
        <>
          <div
            ref={seriesBadgeRef}
            className={`montage-series-badge${
              seriesBadgeTruncated ? ' montage-series-badge--truncated' : ''
            }`}
            // Limita alla larghezza della PRIMA cella (meno la stellina): così il
            // badge non attraversa le posizioni delle stelle delle altre celle
            // (ogni cella ha la sua stellina in alto a sinistra).
            style={{ maxWidth: `calc(${100 / cols}% - 44px)` }}
          >
            {seriesBadgeText}
          </div>
          {/* Tooltip moderno con la descrizione COMPLETA: solo se il testo è
              troncato (altrimenti è già tutto visibile). È un sibling separato
              perché il badge ha overflow:hidden (per l'ellissi), che taglierebbe
              un eventuale ::after interno. Si mostra all'hover del badge (vedi
              CSS `--truncated:hover + ...`). */}
          {seriesBadgeTruncated && (
            <div className="montage-series-tooltip">{seriesBadgeText}</div>
          )}
        </>
      )}
      <div className="montage-layout-badge">{`Sottogriglia ${rows}×${cols}`}</div>
      {/* Scrollbar sottile (stesso stile delle viewport, più sottile): solo se
          c'è da scorrere (total > celle visibili nel layout corrente). Muove il
          blocco visibile (`base`). `.scroll` è position:absolute → non occupa una
          cella della griglia. */}
      {maxBase > 0 && (
        <ImageScrollbar
          value={base}
          max={maxBase}
          height={scrollbarHeight}
          onChange={(idx: number) => setBase(clampBase(idx, total, visibleCount))}
        />
      )}
      {cells.map((cell, idx) => {
        // Tutte le celle hanno un id cornerstone proprio nell'engine dedicato.
        // La risoluzione dei tool della toolbar per la viewport OHIF avviene
        // tramite il "phantom" (viewportId nel toolGroup 'montage' sotto l'engine
        // principale), quindi NON serve più che una cella usi l'id viewportId.
        return (
          <MontageCell
            // La key include la serie: al cambio serie la cella si rimonta e
            // ricarica lo stack corretto (l'id cornerstone `cellId` resta stabile).
            key={`${cell.cellId}::${displaySetUID}`}
            cellId={cell.cellId}
            ohifViewportId={viewportId}
            renderingEngine={renderingEngine}
            renderingEngineId={renderingEngineId}
            toolGroupId={toolGroupId}
            syncGroupService={syncGroupService}
            voiSyncId={voiSyncId}
            zoomPanSyncId={zoomPanSyncId}
            imageIds={imageIds}
            imageIndex={cell.imageIndex}
            total={total}
            instanceNumber={displaySet.instances?.[cell.imageIndex]?.InstanceNumber}
            isPrimary={idx === 0}
            seriesInstanceUID={
              displaySet.instance?.SeriesInstanceUID ??
              displaySet.instances?.[cell.imageIndex]?.SeriesInstanceUID ??
              (displaySet as any).SeriesInstanceUID
            }
            sopInstanceUID={displaySet.instances?.[cell.imageIndex]?.SOPInstanceUID}
            seriesNumber={
              displaySet.instances?.[cell.imageIndex]?.SeriesNumber ??
              displaySet.instance?.SeriesNumber
            }
            seriesDescription={
              displaySet.instances?.[cell.imageIndex]?.SeriesDescription ??
              displaySet.instance?.SeriesDescription
            }
            uiNotificationService={uiNotificationService}
          />
        );
      })}
    </div>
  );
}

export default OHIFMontageViewport;
