import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Enums, RenderingEngine, Types as csTypes, metaData } from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';

import { setEnabledElement } from '../../state';
import {
  captureImageFromImageId,
  captureImageWithAnnotationsFromElement,
} from '../../components/Favourites/Favourites';

/**
 * One cell of the montage subgrid.
 *
 * It makes a cornerstone STACK enabled element on the MAIN RenderingEngine, loads the
 * series into it (the same imageIds array every cell uses, so the pixel cache is
 * shared) and sits on image `imageIndex`. The cell joins the same tool group
 * ('default') as the other viewports, so the toolbar's tools work on it. It is NOT
 * registered with ViewportGridService: it is internal to the OHIF viewport hosting it.
 */
function MontageCell(props: {
  cellId: string;
  ohifViewportId?: string;
  renderingEngine: RenderingEngine;
  renderingEngineId: string;
  toolGroupId: string;
  syncGroupService: any;
  voiSyncId: string;
  zoomPanSyncId: string;
  imageIds: string[];
  imageIndex: number;
  total: number;
  instanceNumber?: number | string | null;
  isPrimary?: boolean;
  // Details for the favourites star: they identify the instance shown in the cell.
  seriesInstanceUID?: string;
  sopInstanceUID?: string;
  seriesNumber?: number | string | null;
  seriesDescription?: string | null;
  uiNotificationService?: any;
}) {
  const {
    cellId,
    ohifViewportId,
    renderingEngine,
    renderingEngineId,
    toolGroupId,
    syncGroupService,
    voiSyncId,
    zoomPanSyncId,
    imageIds,
    imageIndex,
    total,
    instanceNumber,
    isPrimary,
    seriesInstanceUID,
    sopInstanceUID,
    seriesNumber,
    seriesDescription,
    uiNotificationService,
  } = props;

  const elementRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const isEmpty = imageIndex < 0 || imageIndex >= total;

  // The identifier of the FRAME shown in the cell. In a multiframe every frame shares
  // one SOPInstanceUID, so this is what tells them apart in the favourites, where it is
  // saved as instanceNumber. It uses imageIndex+1, the POSITION in the stack, exactly as
  // the ordinary viewports' favourites do (`activeElementIndex+1`): unique per frame,
  // no collisions, and it matches consistently across viewports.
  const frameNumber = imageIndex + 1;

  // The enabled element's life cycle: it is created, or created again, when the cell
  // changes or when the cell goes from empty to full, scrolling towards the last block.
  useEffect(() => {
    const element = elementRef.current;
    if (isEmpty || !element) {
      return undefined;
    }

    renderingEngine.enableElement({
      viewportId: cellId,
      element,
      type: Enums.ViewportType.STACK,
      defaultOptions: { background: [0, 0, 0] as csTypes.Point3 },
    });

    const viewport = renderingEngine.getViewport(cellId) as csTypes.IStackViewport;

    viewport
      .setStack(imageIds, imageIndex)
      .then(() => {
        // Refit to the cell canvas's current size, which avoids stretched images when
        // the canvas is sized or resized as the montage opens. resetCamera keeps the
        // aspect ratio right.
        viewport.resetCamera();
        viewport.render();
      })
      .catch(() => {
        /* the viewport may have been destroyed during a change of layout */
      });

    // The primary cell registers its own enabled element in the OHIF state UNDER the
    // active OHIF viewport's id (ohifViewportId), so the toolbar commands that act on
    // the active viewport (getActiveViewportEnabledElement) find a cell to work on:
    // invert, rotate, flip and reset, which commandsModule then spreads to every cell.
    if (isPrimary && ohifViewportId) {
      setEnabledElement(ohifViewportId, element);
    }

    // Attach the tools and synchronisers AFTER the element is enabled.
    ToolGroupManager.getToolGroup(toolGroupId)?.addViewport(cellId, renderingEngineId);
    syncGroupService.addViewportToSyncGroup(cellId, renderingEngineId, [
      {
        type: 'voi',
        id: voiSyncId,
        source: true,
        target: true,
        options: { syncInvertState: true, syncColormap: true },
      },
      {
        type: 'zoompan',
        id: zoomPanSyncId,
        source: true,
        target: true,
      },
    ]);

    return () => {
      try {
        if (isPrimary && ohifViewportId) {
          setEnabledElement(ohifViewportId, null as any);
        }
        syncGroupService.removeViewportFromSyncGroup(cellId, renderingEngineId, voiSyncId);
        syncGroupService.removeViewportFromSyncGroup(cellId, renderingEngineId, zoomPanSyncId);
        ToolGroupManager.getToolGroup(toolGroupId)?.removeViewports(renderingEngineId, cellId);
        renderingEngine.disableElement(cellId);
      } catch (e) {
        /* noop: teardown best-effort */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellId, isEmpty]);

  // Updates the image index during a block scroll or a change of first image, without
  // enabling the element again.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (isEmpty) {
      return;
    }
    const viewport = renderingEngine.getViewport(cellId) as csTypes.IStackViewport;
    if (!viewport) {
      return;
    }
    viewport
      .setImageIdIndex(imageIndex)
      .then(() => viewport.render())
      .catch(() => {
        /* invalid index, or the viewport was destroyed */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageIndex]);

  // -- Favourites (the star) ------------------------------------------------
  // Resolves the SOPInstanceUID of the instance currently shown in the cell: from the
  // current imageId's metadata first, which always matches what is on screen, and
  // falling back to the prop the hosting viewport passed in.
  const resolveSopUID = useCallback((): string | undefined => {
    const imageId = imageIds[imageIndex];
    if (imageId) {
      try {
        const sop = (metaData.get('sopCommonModule', imageId) as { sopInstanceUID?: string })
          ?.sopInstanceUID;
        if (sop) {
          return sop;
        }
      } catch (e) {
        /* fallback sotto */
      }
    }
    return sopInstanceUID;
  }, [imageIds, imageIndex, sopInstanceUID]);

  const computeIsFav = useCallback((): boolean => {
    const list = (window as any).favourites as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(list) || !list.length || !seriesInstanceUID) {
      return false;
    }
    const sopUID = resolveSopUID();
    if (!sopUID) {
      return false;
    }
    // Matched on SOP plus frame. Without the frame, a multiframe (one SOP for every
    // frame) would light the star up on EVERY cell.
    return list.some(
      p =>
        p.SeriesInstanceUID === seriesInstanceUID &&
        p.SOPInstanceUID === sopUID &&
        String(p.instanceNumber) === String(frameNumber)
    );
  }, [seriesInstanceUID, resolveSopUID, frameNumber]);

  const [isFav, setIsFav] = useState(false);

  // Lines the star's state up again when the cell's image changes, and when the
  // favourites change elsewhere: other cells, the window level panel, the favourites list.
  useEffect(() => {
    if (isEmpty) {
      setIsFav(false);
      return undefined;
    }
    setIsFav(computeIsFav());
    const handler = () => setIsFav(computeIsFav());
    window.addEventListener('mdv-favourites-updated', handler);
    return () => window.removeEventListener('mdv-favourites-updated', handler);
  }, [isEmpty, computeIsFav]);

  const onToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const sopUID = resolveSopUID();
      const imageId = imageIds[imageIndex];
      const viewport = renderingEngine.getViewport(cellId) as csTypes.IStackViewport | undefined;
      if (!sopUID || !seriesInstanceUID || !imageId || !viewport) {
        return;
      }

      if (!(window as any).favourites) {
        (window as any).favourites = [];
      }
      const list = (window as any).favourites as Array<Record<string, unknown>>;

      // Keeps the global favourites button's "pulse" in step, which is what says there
      // are favourites waiting to be printed, as the ordinary viewports' favourites do.
      const syncFavouritesPulse = () => {
        const btn = document.getElementById('favourites-btn');
        if (!btn) {
          return;
        }
        if (((window as any).favourites?.length || 0) > 0) {
          btn.classList.add('pulse');
        } else {
          btn.classList.remove('pulse');
        }
      };

      const matchesThisFrame = p =>
        p.SeriesInstanceUID === seriesInstanceUID &&
        p.SOPInstanceUID === sopUID &&
        String(p.instanceNumber) === String(frameNumber);
      const already = list.some(matchesThisFrame);

      // ── Rimozione ──
      if (already) {
        (window as any).favourites = list.filter(p => !matchesThisFrame(p));
        setIsFav(false);
        syncFavouritesPulse();
        uiNotificationService?.show?.({
          title: 'Favourites',
          message: 'Favourite removed',
          type: 'error',
        });
        window.dispatchEvent(new Event('mdv-favourites-updated'));
        return;
      }

      // -- Adding --
      // The same four versions the ordinary viewports' favourites capture (clean,
      // printBase, overlay, annotated), so the print builder treats them identically.
      const element = elementRef.current;
      const cleanUrl =
        (await captureImageFromImageId(imageId, viewport)) ||
        (element?.querySelector('canvas') as HTMLCanvasElement | null)?.toDataURL('image/png');
      if (!cleanUrl) {
        return;
      }
      const printBase =
        (await captureImageWithAnnotationsFromElement(element, {
          drawBase: true,
          drawAnnotations: false,
          viewport,
        })) || cleanUrl;
      const overlay = await captureImageWithAnnotationsFromElement(element, {
        drawBase: false,
        drawAnnotations: true,
        viewport,
      });
      const annotated =
        (await captureImageWithAnnotationsFromElement(element, {
          drawBase: true,
          drawAnnotations: true,
          viewport,
        })) || printBase;

      list.push({
        SeriesInstanceUID: seriesInstanceUID,
        SOPInstanceUID: sopUID,
        DataUrl: cleanUrl,
        DataUrlPrintBase: printBase,
        DataUrlAnnotated: annotated,
        DataUrlAnnotationOverlay: overlay || null,
        seriesNumber: seriesNumber,
        SeriesDescription: seriesDescription,
        instanceNumber: frameNumber,
      });
      setIsFav(true);
      syncFavouritesPulse();
      uiNotificationService?.show?.({
        title: 'Favourites',
        message: 'Added to favourites',
        type: 'success',
      });
      window.dispatchEvent(new Event('mdv-favourites-updated'));
    },
    [
      resolveSopUID,
      imageIds,
      imageIndex,
      renderingEngine,
      cellId,
      seriesInstanceUID,
      seriesNumber,
      seriesDescription,
      instanceNumber,
      frameNumber,
      uiNotificationService,
    ]
  );

  return (
    <div className="montage-cell">
      <div
        ref={elementRef}
        className="montage-cell-element"
        onContextMenu={e => e.preventDefault()}
      />
      {isEmpty ? (
        <div className="montage-cell-empty" />
      ) : (
        <>
          <button
            type="button"
            className={`montage-cell-fav${isFav ? ' is-fav' : ''}`}
            title={isFav ? 'Remove from favourites' : 'Add to favourites'}
            aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
            onClick={onToggleFavorite}
            onPointerDown={e => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 2.5l2.81 6.06 6.69.62-5.04 4.43 1.49 6.39L12 16.98 6.05 20.4l1.49-6.39L2.5 9.18l6.69-.62L12 2.5z" />
            </svg>
          </button>
          <div className="montage-cell-overlay overlay-info-dicom">
            {instanceNumber != null && instanceNumber !== ''
              ? `I: ${instanceNumber} (${imageIndex + 1}/${total})`
              : `${imageIndex + 1}/${total}`}
          </div>
        </>
      )}
    </div>
  );
}

export default MontageCell;
