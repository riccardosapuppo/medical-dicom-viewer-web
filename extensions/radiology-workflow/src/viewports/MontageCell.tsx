import React, { useEffect, useRef, useState } from 'react';
import { utilities as csUtils } from '@cornerstonejs/core';

const { loadImageToCanvas } = csUtils;

export type VoiRange = {
  lower: number;
  upper: number;
};

type MontageCellProps = {
  imageId: string;
  /** Instance number as the archive reports it, not the position in the array. */
  label: string;
  frameIndex: number;
  isActive: boolean;
  isKept: boolean;
  voiRange?: VoiRange;
  onSelect: (frameIndex: number) => void;
  onToggleKeep: (frameIndex: number) => void;
};

/** Outline only until the frame is kept, then filled: kept is visible at a glance. */
function Star() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
    >
      <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" />
    </svg>
  );
}

/**
 * One frame of the montage.
 *
 * Frames are drawn with Cornerstone's own off-screen renderer, so the pixel
 * pipeline is the one the main viewport uses: modality LUT, rescale and window
 * level all behave as they do in the full size image. Drawing them ourselves
 * would have meant reimplementing that, and getting it subtly wrong.
 */
function MontageCell({
  imageId,
  label,
  frameIndex,
  isActive,
  isKept,
  voiRange,
  onSelect,
  onToggleKeep,
}: MontageCellProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxHeight, setBoxHeight] = useState(0);
  const [failed, setFailed] = useState(false);

  // Cells are sized by the grid, which changes with the layout and the window.
  // Redrawing at the new size keeps the frames from being scaled up by the
  // browser, which on a diagnostic image reads as blur.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return undefined;
    }
    setBoxHeight(box.clientHeight);

    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(entries => {
      const height = Math.round(entries[0]?.contentRect.height ?? 0);
      // Ignore the sub-pixel jitter that a flex layout produces while resizing.
      setBoxHeight(previous => (Math.abs(previous - height) > 4 ? height : previous));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageId || boxHeight <= 0) {
      return undefined;
    }

    let abandoned = false;
    setFailed(false);

    // The renderer derives the canvas width from the image aspect ratio, so
    // only the height is ours to choose. Device pixel ratios above one are
    // common on reporting monitors and the frames look soft without it.
    const height = Math.max(32, Math.round(boxHeight * (window.devicePixelRatio || 1)));
    canvas.height = height;
    canvas.width = height;

    loadImageToCanvas({
      canvas,
      imageId,
      imageAspect: true,
      // A low priority keeps the montage from competing for the request pool
      // with the stack the reader is actually scrolling through.
      priority: -10,
      viewportOptions: voiRange ? { voiRange } : undefined,
    }).catch(() => {
      if (!abandoned) {
        setFailed(true);
      }
    });

    return () => {
      abandoned = true;
    };
  }, [imageId, boxHeight, voiRange?.lower, voiRange?.upper]);

  return (
    <div
      ref={boxRef}
      className={`rw-frame relative flex items-center justify-center overflow-hidden bg-black
        ${isActive ? 'outline outline-2 -outline-offset-2 outline-primary' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelect(frameIndex)}
        aria-label={`Go to instance ${label}`}
        aria-current={isActive}
        className="flex h-full w-full items-center justify-center"
      >
        {failed ? (
          <span className="text-muted-foreground text-[10px]">unavailable</span>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-h-full max-w-full"
          />
        )}
      </button>

      <button
        type="button"
        onClick={() => onToggleKeep(frameIndex)}
        aria-pressed={isKept}
        title={isKept ? 'Remove from the reading list' : 'Keep for the report'}
        aria-label={isKept ? `Remove instance ${label} from the reading list` : `Keep instance ${label}`}
        className={`rw-star absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center
          rounded bg-black/40 ${isKept ? 'is-kept' : ''}`}
      >
        <Star />
      </button>

      <span className="rw-frame-number pointer-events-none absolute bottom-0.5 right-1 text-[10px] leading-none">
        {label}
      </span>
    </div>
  );
}

export default MontageCell;
