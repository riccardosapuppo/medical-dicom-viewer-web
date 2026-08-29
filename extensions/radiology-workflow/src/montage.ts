export type MontageLayoutId = 'off' | '1x1' | '1x2' | '2x1' | '1x3' | '3x1' | '2x2' | '3x3' | '4x4';

export interface MontageLayout {
  id: MontageLayoutId;
  rows: number;
  columns: number;
  label: string;
}

export const montageLayouts: MontageLayout[] = [
  { id: '1x1', rows: 1, columns: 1, label: '1 × 1' },
  { id: '1x2', rows: 1, columns: 2, label: '1 × 2' },
  { id: '2x1', rows: 2, columns: 1, label: '2 × 1' },
  { id: '1x3', rows: 1, columns: 3, label: '1 × 3' },
  { id: '3x1', rows: 3, columns: 1, label: '3 × 1' },
  { id: '2x2', rows: 2, columns: 2, label: '2 × 2' },
  { id: '3x3', rows: 3, columns: 3, label: '3 × 3' },
  { id: '4x4', rows: 4, columns: 4, label: '4 × 4' },
];

export function getMontageLayout(id: MontageLayoutId) {
  return montageLayouts.find(layout => layout.id === id) ?? montageLayouts[0];
}

export function normalizeMontagePageStart(totalImages: number, cellCount: number, requestedStart: number) {
  if (totalImages <= cellCount) return 0;
  return Math.max(0, Math.min(requestedStart, totalImages - cellCount));
}

export function moveMontagePage(totalImages: number, cellCount: number, currentStart: number, direction: -1 | 1) {
  return normalizeMontagePageStart(totalImages, cellCount, currentStart + direction * cellCount);
}

export function visibleMontageSlices(totalImages: number, layout: MontageLayout, pageStart: number) {
  const cellCount = layout.rows * layout.columns;
  const start = normalizeMontagePageStart(totalImages, cellCount, pageStart);
  return Array.from({ length: Math.min(cellCount, totalImages) }, (_, index) => start + index);
}

