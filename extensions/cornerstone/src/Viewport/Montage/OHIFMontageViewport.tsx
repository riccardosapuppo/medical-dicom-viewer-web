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
} from '../../../../../platform/app/public/extensions/hangingProtocols/framing';

/**
 * The montage viewport: it divides ONE viewport into an inner subgrid of
 * rows by columns of cells, all on the same series, sharing the pixel cache, the
 * tools and the synchronisation (window level, VOI, zoom, pan, invert, LUT). It
 * adds no viewports to the main grid. See docs/montage-viewport-design.md.
 *
 * The cells live in their OWN RenderingEngine (ohif-montage-<viewportId>), so
 * enabling, disabling or resizing a cell does NOT reconfigure the main engine's
 * shared offscreen surface and does NOT make the other viewports flash. The cells
 * join the 'montage' tool group, which is where the sync and the tools come from.
 * Cell 0 takes the id of the active viewport, and the viewportId is also registered
 * as a "phantom" in the 'montage' tool group under the main engine, so the toolbar
 * resolves the state of its buttons for that viewport correctly.
 */
function OHIFMontageViewport(props: withAppTypes) {
  const { viewportId, displaySets, viewportOptions, dataSource, servicesManager } = props;
  const { syncGroupService, viewportGridService, cornerstoneViewportService, uiNotificationService } =
    servicesManager.services;

  const displaySet = displaySets?.[0];

  // Resolved ONCE: every cell reuses the same array, so the cache is shared.
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

  // Realigns `base` when the layout or the number of images changes.
  useEffect(() => {
    setBase(prev => clampBase(prev, total, visibleCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, total]);

  // A change of series (another series dropped on the viewport, or a thumbnail
  // clicked while the subgrid is on): start again from the first image of the new
  // series. The cells are remounted, see `key` below, so they load the right stack
  // instead of showing a mix of the old one and the new.
  // The FIRST run, on mount, is skipped: it would clear the `firstImageIndex`
  // handed over by a hanging protocol (the subgrid's saved scroll position).
  const firstDisplaySetRunRef = useRef(true);
  useEffect(() => {
    if (firstDisplaySetRunRef.current) {
      firstDisplaySetRunRef.current = false;
      return;
    }
    setBase(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySetUID]);

  // The series description badge, at grid level, with a modern tooltip only when the
  // text is truncated. The truncation is measured (scrollWidth > clientWidth) and
  // refreshed whenever the badge is resized (a change of layout, or of window). When it
  // is not truncated the badge stays `pointer-events:none` (see the CSS): no tooltip, and
  // nothing gets in the way of the work in the viewport.
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

  // A RenderingEngine of the subgrid's OWN, not the main one: the cells live here.
  // Enabling, disabling or resizing a cell (turning the subgrid on, changing the
  // layout, refitting) therefore reconfigures ONLY the subgrid's offscreen surface
  // and does NOT make every other viewport in the grid redraw and flash.
  const renderingEngineId = `ohif-montage-${viewportId}`;
  const renderingEngine = useMemo(
    () => getRenderingEngine(renderingEngineId) || new RenderingEngine(renderingEngineId),
    [renderingEngineId]
  );

  // A tool group of the montage's own: like 'default' for interaction and measurement,
  // but WITHOUT the cross-viewport tools (reference lines, crosshairs, reference
  // cursors), which mean nothing between cells of one series.
  // Falls back to 'default' if the mode never created a 'montage' tool group.
  const toolGroupId = ToolGroupManager.getToolGroup('montage')
    ? 'montage'
    : viewportOptions?.toolGroupId || 'default';
  const voiSyncId = `montage-voi-${viewportId}`;
  const zoomPanSyncId = `montage-zoompan-${viewportId}`;

  // The dedicated engine is torn down on unmount (leaving the subgrid, or changing
  // series). A "phantom" reference to the OHIF viewport is also registered in the
  // 'montage' tool group UNDER the main engine. Its only job is to let
  // toolGroupService.getToolGroupForViewport(viewportId), which asks the main engine,
  // resolve at all, so the toolbar buttons work out active and disabled correctly.
  // The phantom has no enabled element, so it renders nothing.
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

  // Tells the grid the viewport is ready. The usual path is onElementEnabled, which
  // is absent here because this does not go through cornerstoneViewportService.
  useEffect(() => {
    viewportGridService?.setViewportIsReady?.(viewportId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportId]);

  const containerRef = useRef<HTMLDivElement>(null);

  // The cells' REAL viewports in the dedicated engine. Every id has the shape
  // `<viewportId>::montage::<k>` with k from 0 (deriveMontageCells in
  // types/Montage.ts). The old "cell 0 is the viewportId" mapping is obsolete and
  // left the FIRST cell out of refits and restores: in one-up it stayed at fit,
  // larger than the rest. Filtering by prefix survives both schemes.
  const getCellViewports = useCallback((): any[] => {
    if (!renderingEngine) {
      return [];
    }
    const prefix = `${viewportId}::montage::`;
    return (renderingEngine.getViewports() as any[]).filter(
      vp => vp.id === viewportId || String(vp.id).startsWith(prefix)
    );
  }, [renderingEngine, viewportId]);

  // Refits the camera of the montage cells only, leaving other viewports alone.
  const resetCellCameras = useCallback(() => {
    if (!renderingEngine) {
      return;
    }
    getCellViewports().forEach(vp => {
      vp?.resetCamera?.();
      vp?.render?.();
    });
  }, [renderingEngine, getCellViewports]);

  // Resizes the engine, keeping the camera, and refits the cells. Used when the
  // subgrid is turned on or the layout changes, when no grid resize fires and the
  // cells' canvases would otherwise be the wrong size, stretching the images.
  const refitCells = useCallback(() => {
    if (!renderingEngine) {
      return;
    }
    try {
      // Fit IS the wanted result here, so keepCamera buys nothing, and it would set
      // off the same sync cascade described in onContainerResize.
      renderingEngine.resize(true, false);
      resetCellCameras();
    } catch (e) {
      /* noop */
    }
  }, [renderingEngine, resetCellCameras]);

  // Refit when the subgrid opens or the layout changes, on rAF, once the CSS grid
  // has been measured. It depends on rows, cols and total but NOT on `base`, so
  // scrolling does not refit and the zoom a reader set survives the scroll.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      refitCells();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, total, refitCells]);

  // Puts the cells' saved state back (window level, zoom and pan) when it arrives in
  // the subgrid is built, or rebuilt, by a hanging protocol. The values arrive in
  // viewportOptions.montage.{voiRange,viewPresentation}. Cells are created
  // asynchronously and auto-fit themselves (resetCamera), so this is applied ONCE,
  // after they have settled, and best effort. The scroll position instead comes
  // from `firstImageIndex`, which is what `base` starts at.
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
      // Is the geometry settled? Going one-up, or changing layout, takes the
      // container through a provisional size. The viewPresentation zoom is RELATIVE
      // to the cell's fit
      // camera: applied to a provisional geometry it produces a camera that is wrong
      // (images shrunk to a dot), and the resize that follows, with keepCamera,
      // KEEPS it. So it is applied only once the container has a real size, the
      // same one as the previous attempt.
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
        // Wait for the cell to have drawn an image: otherwise setProperties and
        // voiRange do not take, which is where the disappearing window level came from.
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
            // A sound reference: refit against the cell's CURRENT geometry before
            // applying a relative zoom and pan. A cell created during a layout
            // change starts with a camera for a provisional size, and a zoom
            // relative to that means nothing.
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

  // The container is resized (one-up and back, panels toggled, the window resized).
  // The cells' pan and zoom are kept in RELATIVE form through framing.js, see the
  // comment in the body: cornerstone's keepCamera cannot be used here because of the
  // zoompan sync cascade. The first fit is handled by the effect
  // su rows/cols/total (attivazione/cambio layout).
  const onContainerResize = useCallback(() => {
    if (!renderingEngine) {
      return;
    }
    try {
      // The cells are tied together by a zoompan sync. With resize(keepCamera=true)
      // cornerstone works through them IN SEQUENCE (reset, then restore) and each one
      // emits CAMERA_MODIFIED; the sync pours its transient state onto the cells not
      // yet processed, so the "camera to keep" is photographed already polluted. The
      // ratio of old fit to new fit compounds once per cell: measured live at
      // 2.102^8 = 381.6 (zoom 381.603 in the one-up log), which is images shrunk to a
      // dot or blown up beyond sense.
      // So: photograph each cell RELATIVELY first (framingBeforeResize), resize
      // WITHOUT keepCamera (all of them to fit, where the sync spreading is harmless
      // because fit is the same state for every cell), then reapply per cell with
      // events suppressed (applyFraming), and the sync never fires.
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
    // leading: refit at the FIRST resize event rather than waiting out the debounce,
    // coming back from one-up for instance, which cuts the flash of stretched
    // images before the refit.
    refreshOptions: { leading: true },
    onResize: onContainerResize,
  });

  // The first sync of the active tool: the 'montage' tool group has an active tool of
  // its own, window level by default. When the subgrid opens, its active tool and
  // cursor are lined up with the 'default' tool group's.
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

  // Keeps the cells' cursor in step with the montage tool group's active tool on every
  // change of tool. It uses setViewportsCursorByToolName only, which does NOT re-emit
  // TOOL_ACTIVATED, so there is no loop. setToolActive would.
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

  // The reference scale (ScaleOverlay): when the subgrid opens it mirrors the state of
  // the 'default' tool group, so it comes on here if it was on for the ordinary
  // viewports and stays off otherwise. After that the toolbar toggle keeps the two
  // tool groups in step. Nothing here refits or resizes dynamically: the room for the
  // label is STATIC padding on the cells (see .montage-cell in Montage.css), so it
  // never gets in the way of the rendering.
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

  // Scrolling by blocks: the step is rows by columns.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }
    const handler = (e: WheelEvent) => {
      // Capture plus stopPropagation: catches the wheel BEFORE it reaches the cells'
      // enabled elements, so the shared tool group's stack scroll does not move each
      // cell separately. Scrolling here advances a WHOLE block.
      e.preventDefault();
      e.stopPropagation();
      const dir = e.deltaY > 0 ? 1 : -1;
      setBase(prev => clampBase(prev + dir * visibleCount, total, visibleCount));
    };
    el.addEventListener('wheel', handler, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handler, { capture: true } as any);
  }, [visibleCount, total]);

  // Scrolling with the stack scroll TOOL (left button drag) has to move EVERY cell
  // together, like the wheel, not one cell. So when that tool is the active one, the
  // drag is caught in capture (stopPropagation, so cornerstone's own stack scroll does
  // NOT move a single cell) and `base` is advanced for the whole block. For the other
  // tools (pan, window level, zoom) it is left alone.
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
      // Do not swallow clicks on the favourites star, or on the scrollbar.
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

  // The scrollbar: scrolling by blocks moves `base` within [0, total - visibleCount].
  // Shown only when there is something to scroll, meaning more images than the layout
  // has cells for. The height is worked out as in the ordinary viewports.
  const maxBase = Math.max(0, total - visibleCount);
  const scrollbarHeight = `${Math.max(40, (containerHeight || 0) - 40)}px`;

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      // react-resize-detector takes either a ref callback or an object
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
      {/* The series description, one for the whole grid because every cell shows the
          SAME series, so it is clear which series is on screen. */}
      {seriesBadgeText && (
        <>
          <div
            ref={seriesBadgeRef}
            className={`montage-series-badge${
              seriesBadgeTruncated ? ' montage-series-badge--truncated' : ''
            }`}
            // Held to the width of the FIRST cell, minus the star, so the badge does
            // not run across where the other cells' stars sit (every cell has its own,
            // at the top left).
            style={{ maxWidth: `calc(${100 / cols}% - 44px)` }}
          >
            {seriesBadgeText}
          </div>
          {/* A tooltip carrying the WHOLE description, shown only when the text is
              truncated, since otherwise all of it is already visible. It is a
              separate sibling because the badge has overflow:hidden for the
              ellipsis, which would cut off an ::after inside it. It appears on
              hover over the badge; see the CSS `--truncated:hover + ...`. */}
          {seriesBadgeTruncated && (
            <div className="montage-series-tooltip">{seriesBadgeText}</div>
          )}
        </>
      )}
      <div className="montage-layout-badge">{`Subgrid ${rows}×${cols}`}</div>
      {/* A thin scrollbar, the viewports' own style but narrower, shown only when
          there is something to scroll, meaning more images than the layout has
          cells for. It moves the visible block (`base`). `.scroll` is
          position:absolute, so it takes no cell of the grid. */}
      {maxBase > 0 && (
        <ImageScrollbar
          value={base}
          max={maxBase}
          height={scrollbarHeight}
          onChange={(idx: number) => setBase(clampBase(idx, total, visibleCount))}
        />
      )}
      {cells.map((cell, idx) => {
        // Every cell has a cornerstone id of its own in the dedicated engine. The
        // toolbar resolves its tools for the OHIF viewport through the "phantom" (the
        // viewportId in the 'montage' tool group under the main engine), so no cell
        // needs to borrow the viewportId any more.
        return (
          <MontageCell
            // The key carries the series: when the series changes the cell remounts and
            // loads the right stack, while the cornerstone id `cellId` stays put.
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
