import React, { useCallback } from 'react';

import MontageCell, { type VoiRange } from './MontageCell';
import {
  framesOnPage,
  MONTAGE_GRIDS,
  pageCount,
  type MontageGrid,
} from './montageLayout';

export type MontageFrame = {
  imageId: string;
  label: string;
};

type MontageSheetProps = {
  frames: MontageFrame[];
  grid: MontageGrid;
  page: number;
  activeFrameIndex: number;
  voiRange?: VoiRange;
  onGridChange: (grid: MontageGrid) => void;
  onPageChange: (page: number) => void;
  onSelectFrame: (frameIndex: number) => void;
  onClose: () => void;
};

/**
 * The whole series laid out as a sheet of frames, the way film used to be hung
 * on a light box. It is an overview tool: the reader finds the level they want
 * and clicks it, which returns them to the stack at that instance.
 */
function MontageSheet({
  frames,
  grid,
  page,
  activeFrameIndex,
  voiRange,
  onGridChange,
  onPageChange,
  onSelectFrame,
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
      event.preventDefault();
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
      <div className="text-foreground flex shrink-0 items-center gap-3 px-2 py-1 text-xs">
        <span className="font-medium">Montage</span>

        <select
          className="bg-popover text-foreground rounded border-none px-1 py-0.5 text-xs"
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
              {option.rows} x {option.columns}
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
          <span className="text-muted-foreground">{total} frames</span>
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

      <div
        className="grid min-h-0 flex-1 gap-px p-px"
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
            voiRange={voiRange}
            onSelect={onSelectFrame}
          />
        ))}
      </div>
    </div>
  );
}

export default MontageSheet;
