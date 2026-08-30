/**
 * Paging arithmetic for the montage viewport.
 *
 * A montage shows a whole series as a sheet of small frames, the way film used
 * to be laid out on a light box. The grid is fixed by the reader, so the number
 * of pages follows from the series length. Keeping the arithmetic here, away
 * from rendering, is what makes it testable.
 */

export type MontageGrid = {
  rows: number;
  columns: number;
};

/** The grids offered in the toolbar, from a single frame to a full sheet. */
export const MONTAGE_GRIDS: readonly MontageGrid[] = Object.freeze([
  { rows: 1, columns: 2 },
  { rows: 2, columns: 2 },
  { rows: 2, columns: 3 },
  { rows: 3, columns: 4 },
  { rows: 4, columns: 5 },
  { rows: 5, columns: 6 },
]);

export const DEFAULT_MONTAGE_GRID: MontageGrid = { rows: 3, columns: 4 };

export function framesPerPage(grid: MontageGrid): number {
  return Math.max(1, Math.floor(grid.rows) * Math.floor(grid.columns));
}

export function pageCount(frameCount: number, grid: MontageGrid): number {
  if (frameCount <= 0) {
    return 1;
  }
  return Math.ceil(frameCount / framesPerPage(grid));
}

/** Keeps a page number inside the series, whatever the caller asked for. */
export function clampPage(page: number, frameCount: number, grid: MontageGrid): number {
  const last = pageCount(frameCount, grid) - 1;
  if (!Number.isFinite(page)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(page), 0), last);
}

/** The page holding a given frame, used to follow the active instance. */
export function pageOfFrame(frameIndex: number, frameCount: number, grid: MontageGrid): number {
  const safeIndex = Math.min(Math.max(Math.trunc(frameIndex) || 0, 0), Math.max(frameCount - 1, 0));
  return clampPage(Math.floor(safeIndex / framesPerPage(grid)), frameCount, grid);
}

/**
 * The frame indices drawn on a page. The last page is usually short, and the
 * grid is not padded out with blanks: an incomplete row is what a light box
 * looks like too.
 */
export function framesOnPage(page: number, frameCount: number, grid: MontageGrid): number[] {
  if (frameCount <= 0) {
    return [];
  }
  const size = framesPerPage(grid);
  const start = clampPage(page, frameCount, grid) * size;
  const end = Math.min(start + size, frameCount);
  const indices: number[] = [];
  for (let i = start; i < end; i++) {
    indices.push(i);
  }
  return indices;
}

/**
 * Spreads a fixed number of frames evenly across the series. Used when the
 * reader wants an overview of a long series on a single sheet rather than the
 * first N frames, which on a 300 slice CT would all look identical.
 */
export function sampleFrames(frameCount: number, count: number): number[] {
  if (frameCount <= 0 || count <= 0) {
    return [];
  }
  if (count >= frameCount) {
    return Array.from({ length: frameCount }, (_, i) => i);
  }
  const step = frameCount / count;
  const sampled: number[] = [];
  for (let i = 0; i < count; i++) {
    sampled.push(Math.min(frameCount - 1, Math.floor(i * step + step / 2)));
  }
  return sampled;
}
