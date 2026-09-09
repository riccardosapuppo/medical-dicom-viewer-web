/**
 * Types and helpers for the "subgrid (montage)" inside a single OHIF viewport.
 *
 * A montage divides ONE OHIF viewport into rows by columns of cells, each showing a
 * different image of the SAME series. No extra OHIF viewports are made in the main grid:
 * the cells are internal cornerstone enabled elements, run by a RenderingEngine of their
 * own and never registered with ViewportGridService. See docs/montage-viewport-design.md.
 */

/** The montage's state, kept inside viewportOptions.montage. */
export interface MontageState {
  enabled: boolean;
  rows: number;
  cols: number;
  /** the 0-based index of the first image, the one at the top left */
  firstImageIndex: number;
}

/** The model of one subgrid cell. */
export interface MontageCellModel {
  /** the cell's internal id, NOT registered with ViewportGridService */
  cellId: string;
  /** which image of the series' stack this cell shows */
  imageIndex: number;
  row: number;
  col: number;
}

export interface MontageDerived {
  total: number;
  visibleCount: number;
  cells: MontageCellModel[];
}

export const DEFAULT_MONTAGE: MontageState = {
  enabled: false,
  rows: 2,
  cols: 2,
  firstImageIndex: 0,
};

/** The layouts the toolbar offers. */
export const MONTAGE_LAYOUTS: Array<{ id: string; label: string; rows: number; cols: number }> = [
  { id: '1x1', label: '1×1', rows: 1, cols: 1 },
  { id: '1x2', label: '1×2', rows: 1, cols: 2 },
  { id: '2x1', label: '2×1', rows: 2, cols: 1 },
  { id: '1x3', label: '1×3', rows: 1, cols: 3 },
  { id: '3x1', label: '3×1', rows: 3, cols: 1 },
  { id: '2x2', label: '2×2', rows: 2, cols: 2 },
  { id: '3x3', label: '3×3', rows: 3, cols: 3 },
  { id: '4x4', label: '4×4', rows: 4, cols: 4 },
];

/**
 * Holds `base`, the first cell's index, inside a valid range while keeping the grid as
 * full as it can be: `base` never goes past `total - visibleCount`.
 * So when there are no more images than cells (three images in a 2x2, say) scrolling is
 * effectively off, base stays at 0, and nobody ends up with one image in one cell and
 * the rest empty.
 */
export function clampBase(base: number, total: number, visibleCount = 1): number {
  if (total <= 0) {
    return 0;
  }
  const maxBase = Math.max(0, total - Math.max(1, visibleCount));
  return Math.min(Math.max(0, base || 0), maxBase);
}

/**
 * Works the cells out (id plus image index) from the montage state.
 * Cells whose `imageIndex` runs past `total` are still returned, with the index out of
 * range: the cell component draws those as empty.
 */
export function deriveMontageCells(
  state: Pick<MontageState, 'rows' | 'cols' | 'firstImageIndex'>,
  total: number,
  ohifViewportId: string
): MontageDerived {
  const rows = Math.max(1, state.rows || 1);
  const cols = Math.max(1, state.cols || 1);
  const visibleCount = rows * cols;
  const firstImageIndex = clampBase(state.firstImageIndex || 0, total, visibleCount);

  const cells: MontageCellModel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      cells.push({
        cellId: `${ohifViewportId}::montage::${k}`,
        imageIndex: firstImageIndex + k,
        row: r,
        col: c,
      });
    }
  }

  return { total, visibleCount, cells };
}
