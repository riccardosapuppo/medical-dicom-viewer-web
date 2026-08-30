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
  voiRange?: VoiRange;
  onSelect: (frameIndex: number) => void;
};

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
  voiRange,
  onSelect,
}: MontageCellProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLButtonElement | null>(null);
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
    <button
      type="button"
      ref={boxRef}
      onClick={() => onSelect(frameIndex)}
      aria-label={`Frame ${label}`}
      aria-current={isActive}
      className={`group relative flex items-center justify-center overflow-hidden bg-black
        outline-none ring-inset transition-shadow
        ${isActive ? 'ring-primary-light ring-2' : 'ring-0 hover:ring-1 hover:ring-white/40'}`}
    >
      {failed ? (
        <span className="text-muted-foreground text-[10px]">unavailable</span>
      ) : (
        <canvas
          ref={canvasRef}
          className="max-h-full max-w-full"
        />
      )}
      <span
        className="pointer-events-none absolute bottom-0.5 right-1 text-[10px] leading-none
          text-white/70 mix-blend-difference"
      >
        {label}
      </span>
    </button>
  );
}

export default MontageCell;
