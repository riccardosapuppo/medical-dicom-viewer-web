import React, { useCallback } from 'react';

import MontageCell, { type VoiRange } from './MontageCell';
import { framesOnPage, MONTAGE_GRIDS, pageCount, type MontageGrid } from './montageLayout';

export type MontageFrame = {
  imageId: string;
  label: string;
};

type MontageSheetProps = {
  frames: MontageFrame[];
  seriesDescription: string;
  grid: MontageGrid;
  page: number;
  activeFrameIndex: number;
  keptImageIds: ReadonlySet<string>;
  voiRange?: VoiRange;
  onGridChange: (grid: MontageGrid) => void;
  onPageChange: (page: number) => void;
  onSelectFrame: (frameIndex: number) => void;
  onToggleKeep: (frameIndex: number) => void;
  onClose: () => void;
};

/**
 * The whole series laid out as a sheet of frames, the way film was hung on a
 * light box. It is an overview: the reader finds the level they want and clicks
 * it, which returns them to the stack at that instance.
 *
 * The lines between frames are the same blue as the lines between viewports, so
 * a sheet reads as a subdivision of the viewport it sits in rather than as a
 * different kind of window.
 */
function MontageSheet({
  frames,
  seriesDescription,
  grid,
  page,
  activeFrameIndex,
  keptImageIds,
  voiRange,
  onGridChange,
  onPageChange,
  onSelectFrame,
  onToggleKeep,
  onClose,
}: MontageSheetProps) {
  const total = frames.length;
  const pages = pageCount(total, grid);
  const visible = framesOnPage(page, total, grid);

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaY === 0) {
        return;
      }
      onPageChange(page + (event.deltaY > 0 ? 1 : -1));
    },
    [onPageChange, page]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = { PageDown: 1, PageUp: -1, ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (step !== undefined) {
        event.preventDefault();
        onPageChange(page + step);
      } else if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose, onPageChange, page]
  );

  return (
    <div
      className="bg-background absolute inset-0 z-10 flex flex-col"
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label="Series montage"
    >
      <div className="text-foreground flex shrink-0 items-center gap-2 px-2 py-1 text-xs">
        <select
          className="bg-popover text-popover-foreground rounded border-none px-1.5 py-0.5 text-xs"
          value={`${grid.rows}x${grid.columns}`}
          onChange={event => {
            const [rows, columns] = event.target.value.split('x').map(Number);
            onGridChange({ rows, columns });
          }}
          aria-label="Montage grid"
        >
          {MONTAGE_GRIDS.map(option => (
            <option
              key={`${option.rows}x${option.columns}`}
              value={`${option.rows}x${option.columns}`}
            >
              {option.rows} &times; {option.columns}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="disabled:text-muted-foreground px-1 disabled:cursor-default"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 0}
            aria-label="Previous page"
          >
            &#8249;
          </button>
          <span className="tabular-nums">
            {Math.min(page + 1, pages)} / {pages}
          </span>
          <button
            type="button"
            className="disabled:text-muted-foreground px-1 disabled:cursor-default"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages - 1}
            aria-label="Next page"
          >
            &#8250;
          </button>
          <span className="text-muted-foreground tabular-nums">{total} frames</span>
          <button
            type="button"
            className="px-1"
            onClick={onClose}
            aria-label="Close montage"
          >
            &#215;
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <span className="rw-badge pointer-events-none absolute left-1.5 top-1.5 z-20 max-w-[55%] truncate rounded px-1.5 py-px text-xs font-semibold">
          {seriesDescription}
        </span>
        <span className="rw-badge pointer-events-none absolute right-1.5 top-1.5 z-20 rounded px-1.5 py-px text-xs font-semibold tabular-nums">
          {grid.rows} &times; {grid.columns}
        </span>

        <div
          className="rw-montage grid h-full w-full gap-px p-px"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
          }}
        >
          {visible.map(frameIndex => (
            <MontageCell
              key={frames[frameIndex].imageId}
              imageId={frames[frameIndex].imageId}
              label={frames[frameIndex].label}
              frameIndex={frameIndex}
              isActive={frameIndex === activeFrameIndex}
              isKept={keptImageIds.has(frames[frameIndex].imageId)}
              voiRange={voiRange}
              onSelect={onSelectFrame}
              onToggleKeep={onToggleKeep}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default MontageSheet;
