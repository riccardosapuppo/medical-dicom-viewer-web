import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OHIFCornerstoneViewport } from '@ohif/extension-cornerstone';
import { useSystem } from '@ohif/core';

import MontageSheet, { type MontageFrame } from './MontageSheet';
import MontageService, { type MontageViewportState } from '../services/MontageService';
import ReadingListService from '../services/ReadingListService';
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
  const { montageService, readingListService, cornerstoneViewportService } =
    servicesManager.services as {
      montageService: MontageService;
      readingListService: ReadingListService;
      cornerstoneViewportService: AppTypes.CornerstoneViewportService;
    };

  const displaySet = displaySets?.[0];

  const [montage, setMontage] = useState<MontageViewportState>(() =>
    montageService.getState(viewportId)
  );
  const [liveFrameIndex, setLiveFrameIndex] = useState(0);
  const [voiRange, setVoiRange] = useState<VoiRange | undefined>(undefined);
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());

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

  useEffect(() => {
    const refresh = () =>
      setKept(new Set(readingListService.getAll().map(frame => frame.imageId)));
    refresh();
    const { unsubscribe } = readingListService.subscribe(
      ReadingListService.EVENTS.CHANGED,
      refresh
    );
    return unsubscribe;
  }, [readingListService]);

  const frames: MontageFrame[] = useMemo(() => {
    const images = displaySet?.images ?? [];
    return images.map((image, index: number) => ({
      imageId: image.imageId,
      label: String(image.InstanceNumber ?? index + 1),
    }));
  }, [displaySet]);

  // The subgrid opens on the level the reader was already looking at, rendered
  // with the window level they had set, and divided to suit the length of the
  // series. Anything else means arriving at a sheet of images that do not match
  // what was on screen a moment earlier.
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
    montageService.open(viewportId, frames.length, index);
    // Deliberately keyed on the switch alone: re-running this while the reader
    // slides the window would drag it back to where they started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montage.enabled]);

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

  const onToggleKeep = useCallback(
    (frameIndex: number) => {
      const frame = frames[frameIndex];
      if (!frame || !displaySet) {
        return;
      }
      readingListService.toggle({
        imageId: frame.imageId,
        studyInstanceUID: displaySet.StudyInstanceUID,
        seriesInstanceUID: displaySet.SeriesInstanceUID,
        seriesDescription: displaySet.SeriesDescription || 'Series',
        instanceNumber: frame.label,
      });
    },
    [displaySet, frames, readingListService]
  );

  const onGridChange = useCallback(
    (grid: MontageGrid) => montageService.setGrid(viewportId, grid, frames.length),
    [frames.length, montageService, viewportId]
  );

  const onSlide = useCallback(
    (delta: number) => montageService.slide(viewportId, delta, frames.length),
    [frames.length, montageService, viewportId]
  );

  const onFirstIndexChange = useCallback(
    (first: number) => montageService.setFirstImageIndex(viewportId, first, frames.length),
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
          seriesDescription={displaySet?.SeriesDescription || 'Series'}
          montage={montage}
          activeFrameIndex={liveFrameIndex}
          keptImageIds={kept}
          voiRange={voiRange}
          onGridChange={onGridChange}
          onSlide={onSlide}
          onFirstIndexChange={onFirstIndexChange}
          onSelectFrame={onSelectFrame}
          onToggleKeep={onToggleKeep}
          onClose={onClose}
        />
      )}
    </div>
  );
}

export default RadiologyViewport;
