export interface ReferenceCursorMove {
  x: number;
  y: number;
  primaryButtonDown: boolean;
  closestSliceIndex: number;
}

export interface ReferenceCursorResult {
  cursor: { x: number; y: number; dragging: boolean };
  synchronizeSliceIndex?: number;
}

export function handleReferenceCursorMove(move: ReferenceCursorMove): ReferenceCursorResult {
  return {
    cursor: { x: move.x, y: move.y, dragging: move.primaryButtonDown },
    ...(move.primaryButtonDown ? { synchronizeSliceIndex: move.closestSliceIndex } : {}),
  };
}

