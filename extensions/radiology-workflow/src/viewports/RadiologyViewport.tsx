import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OHIFCornerstoneViewport } from '@ohif/extension-cornerstone';
import { useSystem } from '@ohif/core';

import MontageSheet, { type MontageFrame } from './MontageSheet';
import MontageService, { type MontageViewportState } from '../services/MontageService';
import type { VoiRange } from './MontageCell';
import type { MontageGrid } from './montageLayout';

type RadiologyViewportProps = {
  viewportId: string;
  displaySets: AppTypes.DisplaySet[];
};

/**
 * The viewport this mode puts in every cell of the grid.
 *
 * It is the stock OHIF Cornerstone viewport, with the montage laid over it when
 * the reader asks for one. Wrapping rather than replacing is deliberate: every
 * tool, overlay and scrollbar keeps working because it is the real viewport
 * underneath, and the montage is an addition rather than a reimplementation.
 * The Cornerstone viewport is never unmounted, so window level, zoom and the
 * current instance survive a trip through the montage.
 */
function RadiologyViewport(props: RadiologyViewportProps) {
  const { servicesManager } = useSystem();
  const { viewportId, displaySets } = props;
  const { montageService, cornerstoneViewportService } = servicesManager.services as {
    montageService: MontageService;
    cornerstoneViewportService: AppTypes.CornerstoneViewportService;
  };

  const [montage, setMontage] = useState<MontageViewportState>(() =>
    montageService.getState(viewportId)
  );
  const [liveFrameIndex, setLiveFrameIndex] = useState(0);
  const [voiRange, setVoiRange] = useState<VoiRange | undefined>(undefined);

  useEffect(() => {
    setMontage(montageService.getState(viewportId));
    const { unsubscribe } = montageService.subscribe(
      MontageService.EVENTS.STATE_CHANGED,
      ({ viewportId: changed }: { viewportId: string }) => {
        if (changed === viewportId) {
          setMontage(montageService.getState(viewportId));
        }
      }
    );
    return unsubscribe;
  }, [montageService, viewportId]);

  const frames: MontageFrame[] = useMemo(() => {
    const images = displaySets?.[0]?.images ?? [];
    return images.map((image, index: number) => ({
      imageId: image.imageId,
      label: String(image.InstanceNumber ?? index + 1),
    }));
  }, [displaySets]);

  // The montage opens on the level the reader was already looking at, rendered
  // with the window level they had set. Anything else means arriving at a sheet
  // of images that do not match what was on screen a moment earlier.
  useEffect(() => {
    if (!montage.enabled) {
      return;
    }
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as {
      getCurrentImageIdIndex?: () => number;
      getProperties?: () => { voiRange?: VoiRange };
    } | null;

    const index = viewport?.getCurrentImageIdIndex?.() ?? 0;
    setLiveFrameIndex(index);
    setVoiRange(viewport?.getProperties?.()?.voiRange);
    montageService.revealFrame(viewportId, index, frames.length);
  }, [montage.enabled, cornerstoneViewportService, montageService, viewportId, frames.length]);

  const onSelectFrame = useCallback(
    (frameIndex: number) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId) as {
        setImageIdIndex?: (index: number) => Promise<void> | void;
      } | null;

      // Only a stack viewport addresses images by index; on a volume the
      // montage is a read-only overview and clicking simply closes it.
      Promise.resolve(viewport?.setImageIdIndex?.(frameIndex)).finally(() => {
        montageService.setEnabled(viewportId, false);
      });
    },
    [cornerstoneViewportService, montageService, viewportId]
  );

  const onGridChange = useCallback(
    (grid: MontageGrid) => montageService.setGrid(viewportId, grid),
    [montageService, viewportId]
  );

  const onPageChange = useCallback(
    (page: number) => montageService.setPage(viewportId, page, frames.length),
    [frames.length, montageService, viewportId]
  );

  const onClose = useCallback(
    () => montageService.setEnabled(viewportId, false),
    [montageService, viewportId]
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <OHIFCornerstoneViewport {...props} />

      {montage.enabled && frames.length > 0 && (
        <MontageSheet
          frames={frames}
          grid={montage.grid}
          page={montage.page}
          activeFrameIndex={liveFrameIndex}
          voiRange={voiRange}
          onGridChange={onGridChange}
          onPageChange={onPageChange}
          onSelectFrame={onSelectFrame}
          onClose={onClose}
        />
      )}
    </div>
  );
}

export default RadiologyViewport;
