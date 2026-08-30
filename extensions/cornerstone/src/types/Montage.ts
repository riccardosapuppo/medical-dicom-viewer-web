/**
 * Tipi e helper per la "Sottogriglia (Montage)" interna a una singola viewport OHIF.
 *
 * La montage suddivide UNA viewport OHIF in righe×colonne celle, ognuna delle quali
 * mostra una diversa immagine della STESSA serie. Non vengono create viewport OHIF
 * aggiuntive nella griglia principale: le celle sono enabled-element Cornerstone
 * interni, gestiti da un RenderingEngine dedicato e mai registrati in
 * ViewportGridService. Vedi docs/montage-viewport-design.md.
 */

/** Stato della montage, persistito dentro viewportOptions.montage. */
export interface MontageState {
  enabled: boolean;
  rows: number;
  cols: number;
  /** indice (0-based) della prima immagine mostrata in alto a sinistra */
  firstImageIndex: number;
}

/** Modello di una singola cella della sottogriglia. */
export interface MontageCellModel {
  /** id interno cella, NON registrato in ViewportGridService */
  cellId: string;
  /** indice immagine assegnato a questa cella nello stack della serie */
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

/** Layout selezionabili dalla toolbar. */
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
 * Vincola `base` (indice della prima cella) a un intervallo valido, tenendo la
 * griglia il più piena possibile: `base` non supera mai `total - visibleCount`.
 * Così, se le immagini sono ≤ celle (es. 3 immagini in una 2×2), lo scroll è di
 * fatto disabilitato (base resta 0) e non si finisce con una sola immagine in
 * una cella e le altre vuote.
 */
export function clampBase(base: number, total: number, visibleCount = 1): number {
  if (total <= 0) {
    return 0;
  }
  const maxBase = Math.max(0, total - Math.max(1, visibleCount));
  return Math.min(Math.max(0, base || 0), maxBase);
}

/**
 * Deriva le celle (id + indice immagine) a partire dallo stato montage.
 * Le celle il cui `imageIndex` eccede `total` sono comunque restituite con
 * imageIndex fuori range: il componente cella le mostrerà come vuote.
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
