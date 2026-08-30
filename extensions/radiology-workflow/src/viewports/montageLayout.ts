/**
 * The arithmetic of the subgrid.
 *
 * A subgrid divides one viewport into rows by columns of cells, each showing a
 * different image of the same series. It is a window onto the stack rather than
 * a set of pages: the reader slides it an image at a time, the way a sheet of
 * film moves across a light box, and every cell always holds an image.
 *
 * Paging was the obvious model and the wrong one. Pages leave the last one
 * short — one image beside three empty cells — and moving between them jumps the
 * reader over levels rather than carrying them through. Sliding keeps the grid
 * full and keeps every level reachable.
 */

export type MontageGrid = {
  rows: number;
  columns: number;
};

export type MontageState = {
  enabled: boolean;
  grid: MontageGrid;
  /** Index in the series of the image in the top-left cell. */
  firstImageIndex: number;
};

/** The grids offered, including the asymmetric ones a reader reaches for. */
export const MONTAGE_GRIDS: readonly MontageGrid[] = Object.freeze([
  { rows: 1, columns: 2 },
  { rows: 2, columns: 1 },
  { rows: 1, columns: 3 },
  { rows: 3, columns: 1 },
  { rows: 2, columns: 2 },
  { rows: 2, columns: 3 },
  { rows: 3, columns: 3 },
  { rows: 4, columns: 4 },
]);

export const DEFAULT_MONTAGE_GRID: MontageGrid = { rows: 2, columns: 2 };

export function cellCount(grid: MontageGrid): number {
  return Math.max(1, Math.floor(grid.rows) * Math.floor(grid.columns));
}

/**
 * Holds the first index inside a range that keeps the grid full.
 *
 * It never exceeds the total minus the number of cells, so the last position
 * shows the final images with every cell occupied rather than trailing off into
 * blanks. Where the series is shorter than the grid the window cannot move at
 * all, which is the honest answer: there is nothing to slide past.
 */
export function clampFirstIndex(first: number, total: number, cells = 1): number {
  if (total <= 0) {
    return 0;
  }
  const last = Math.max(0, total - Math.max(1, cells));
  if (!Number.isFinite(first)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(first), 0), last);
}

/** How far the window can travel, in images. Zero when the series fits. */
export function scrollRange(total: number, grid: MontageGrid): number {
  return Math.max(0, total - cellCount(grid));
}

/**
 * The image index in each cell, in reading order, left to right and down.
 * A cell with no image of its own is given -1 rather than a repeat, which would
 * imply the reader is seeing more than the study contains.
 */
export function cellsFor(state: MontageState, total: number): number[] {
  const cells = cellCount(state.grid);
  const first = clampFirstIndex(state.firstImageIndex, total, cells);
  const indices: number[] = [];

  for (let cell = 0; cell < cells; cell++) {
    const index = first + cell;
    indices.push(index < total ? index : -1);
  }
  return indices;
}

/**
 * Slides the window so a given image is on the sheet, moving as little as
 * possible. Used when the reader was at some level in the stack and opens the
 * subgrid: they should find themselves where they were, not back at the top.
 */
export function revealIndex(state: MontageState, total: number, imageIndex: number): number {
  const cells = cellCount(state.grid);
  const first = clampFirstIndex(state.firstImageIndex, total, cells);
  const wanted = Math.min(Math.max(Math.trunc(imageIndex) || 0, 0), Math.max(total - 1, 0));

  if (wanted < first) {
    return clampFirstIndex(wanted, total, cells);
  }
  if (wanted >= first + cells) {
    return clampFirstIndex(wanted - cells + 1, total, cells);
  }
  return first;
}

/** Moves the window by a number of images, keeping it in range. */
export function slideBy(state: MontageState, total: number, delta: number): number {
  return clampFirstIndex(state.firstImageIndex + delta, total, cellCount(state.grid));
}

/**
 * Chooses a grid for a series when the reader has not: enough cells to show the
 * shape of the study without shrinking any one image past being readable, which
 * in practice means stopping at sixteen.
 */
export function gridForSeries(total: number): MontageGrid {
  if (total <= 4) {
    return { rows: 1, columns: 2 };
  }
  if (total <= 12) {
    return { rows: 2, columns: 2 };
  }
  if (total <= 40) {
    return { rows: 2, columns: 3 };
  }
  if (total <= 120) {
    return { rows: 3, columns: 3 };
  }
  return { rows: 4, columns: 4 };
}
