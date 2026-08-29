export interface ViewportFraming {
  scale: number;
  translationX: number;
  translationY: number;
}

export interface RelativeFraming {
  fillRatio: number;
  offsetXRatio: number;
  offsetYRatio: number;
}

export function captureRelativeFraming(framing: ViewportFraming, width: number, height: number): RelativeFraming {
  const shortestEdge = Math.max(1, Math.min(width, height));
  return {
    fillRatio: framing.scale,
    offsetXRatio: framing.translationX / shortestEdge,
    offsetYRatio: framing.translationY / shortestEdge,
  };
}

export function restoreRelativeFraming(relative: RelativeFraming, width: number, height: number): ViewportFraming {
  const shortestEdge = Math.max(1, Math.min(width, height));
  return {
    scale: relative.fillRatio,
    translationX: relative.offsetXRatio * shortestEdge,
    translationY: relative.offsetYRatio * shortestEdge,
  };
}

