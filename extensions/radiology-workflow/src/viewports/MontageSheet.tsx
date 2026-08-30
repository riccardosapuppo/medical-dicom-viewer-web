import React, { useCallback } from 'react';

import MontageCell, { type VoiRange } from './MontageCell';
import {
  cellsFor,
  MONTAGE_GRIDS,
  scrollRange,
  type MontageGrid,
  type MontageState,
} from './montageLayout';

export type MontageFrame = {
  imageId: string;
  label: string;
};

type MontageSheetProps = {
  frames: MontageFrame[];
  seriesDescription: string;
  montage: MontageState;
  activeFrameIndex: number;
  keptImageIds: ReadonlySet<string>;
  voiRange?: VoiRange;
  onGridChange: (grid: MontageGrid) => void;
  onSlide: (delta: number) => void;
  onFirstIndexChange: (first: number) => void;
  onSelectFrame: (frameIndex: number) => void;
  onToggleKeep: (frameIndex: number) => void;
  onClose: () => void;
};

/**
 * The series laid out as a sheet of frames inside one viewport.
 *
 * It is a window onto the stack, not a set of pages: the wheel and the bar on
 * the right slide it one image at a time, and every cell stays filled. The
 * badges sit over the sheet rather than in a bar above it, so the frames get
 * the whole viewport.
 */
function MontageSheet({
  frames,
  seriesDescription,
  montage,
  activeFrameIndex,
  keptImageIds,
  voiRange,
  onGridChange,
  onSlide,
  onFirstIndexChange,
  onSelectFrame,
  onToggleKeep,
  onClose,
}: MontageSheetProps) {
  const total = frames.length;
  const { grid, firstImageIndex } = montage;
  const indices = cellsFor(montage, total);
  const range = scrollRange(total, grid);

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaY === 0) {
        return;
      }
      // One row at a time: a wheel notch that moved a single image would take
      // forever down a 300 slice study, and one that moved a whole sheet would
      // skip levels.
      onSlide(event.deltaY > 0 ? grid.columns : -grid.columns);
    },
    [grid.columns, onSlide]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = {
        ArrowDown: grid.columns,
        ArrowUp: -grid.columns,
        ArrowRight: 1,
        ArrowLeft: -1,
        PageDown: grid.rows * grid.columns,
        PageUp: -(grid.rows * grid.columns),
      }[event.key];

      if (step !== undefined) {
        event.preventDefault();
        onSlide(step);
      } else if (event.key === 'Escape') {
        onClose();
      }
    },
    [grid.columns, grid.rows, onClose, onSlide]
  );

  return (
    <div
      className="bg-background absolute inset-0 z-10 flex"
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="group"
      aria-label={`Subgrid of ${seriesDescription}`}
    >
      <div className="relative min-w-0 flex-1">
        <span className="rw-badge pointer-events-none absolute left-1.5 top-1.5 z-20 max-w-[55%] truncate rounded px-1.5 py-px text-xs font-semibold">
          {seriesDescription}
        </span>

        <select
          className="rw-badge absolute right-1.5 top-1.5 z-20 cursor-pointer rounded border-none px-1.5 py-px text-xs font-semibold tabular-nums"
          value={`${grid.rows}x${grid.columns}`}
          onChange={event => {
            const [rows, columns] = event.target.value.split('x').map(Number);
            onGridChange({ rows, columns });
          }}
          aria-label="Subgrid layout"
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

        <button
          type="button"
          className="rw-badge absolute bottom-1.5 right-1.5 z-20 rounded px-1.5 py-px text-xs"
          onClick={onClose}
          aria-label="Close the subgrid"
        >
          Close
        </button>

        <div
          className="rw-montage grid h-full w-full gap-px p-px"
          style={{
            gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
          }}
        >
          {indices.map((frameIndex, cell) =>
            frameIndex < 0 ? (
              <div
                key={`empty-${cell}`}
                className="bg-black"
              />
            ) : (
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
            )
          )}
        </div>
      </div>

      {/*
        The series bar, down the right of the sheet, in the same place and the
        same direction as the one on an ordinary viewport. A subgrid is a way of
        looking at a stack, so moving through it should feel like moving through
        a stack.
      */}
      {range > 0 && (
        <div className="bg-background flex w-4 shrink-0 items-stretch justify-center py-1">
          <input
            type="range"
            className="rw-series-bar"
            min={0}
            max={range}
            step={1}
            value={firstImageIndex}
            onChange={event => onFirstIndexChange(Number(event.target.value))}
            aria-label="Position in the series"
            aria-valuetext={`Image ${firstImageIndex + 1} of ${total}`}
          />
        </div>
      )}
    </div>
  );
}

export default MontageSheet;
