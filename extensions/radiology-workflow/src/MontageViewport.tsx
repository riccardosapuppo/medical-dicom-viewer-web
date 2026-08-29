import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import type { Study } from '../../../src/domain/study';
import { SyntheticImage } from './SyntheticImage';
import { getMontageLayout, moveMontagePage, visibleMontageSlices, type MontageLayoutId } from './montage';
import { captureRelativeFraming, restoreRelativeFraming, type RelativeFraming } from './relativeFraming';

interface MontageViewportProps {
  study: Study;
  layoutId: MontageLayoutId;
  onPageChange?(firstSlice: number): void;
}

const defaultFraming: RelativeFraming = { fillRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };

export function MontageViewport({ study, layoutId, onPageChange }: MontageViewportProps) {
  const layout = getMontageLayout(layoutId);
  const [pageStart, setPageStart] = useState(0);
  const [relativeFraming, setRelativeFraming] = useState(defaultFraming);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; start: RelativeFraming } | null>(null);
  const slices = useMemo(() => visibleMontageSlices(study.slices, layout, pageStart), [layout, pageStart, study.slices]);

  useEffect(() => {
    setPageStart(0);
  }, [layoutId, study.studyInstanceUID]);

  const changePage = (direction: -1 | 1) => {
    const next = moveMontagePage(study.slices, layout.rows * layout.columns, pageStart, direction);
    setPageStart(next);
    onPageChange?.(next);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.ctrlKey) {
      setRelativeFraming(current => ({ ...current, fillRatio: Math.max(0.6, Math.min(3, current.fillRatio - event.deltaY * 0.001)) }));
      return;
    }
    changePage(event.deltaY > 0 ? 1 : -1);
  };

  const framing = restoreRelativeFraming(
    relativeFraming,
    containerRef.current?.clientWidth ?? 1,
    containerRef.current?.clientHeight ?? 1
  );

  return (
    <div
      ref={containerRef}
      className="montage-viewport"
      style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}
      onWheel={onWheel}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, start: relativeFraming };
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag || !containerRef.current) return;
        const shortestEdge = Math.max(1, Math.min(containerRef.current.clientWidth, containerRef.current.clientHeight));
        const next = {
          ...drag.start,
          offsetXRatio: drag.start.offsetXRatio + (event.clientX - drag.x) / shortestEdge,
          offsetYRatio: drag.start.offsetYRatio + (event.clientY - drag.y) / shortestEdge,
        };
        setRelativeFraming(captureRelativeFraming(restoreRelativeFraming(next, shortestEdge, shortestEdge), shortestEdge, shortestEdge));
      }}
      onPointerUp={() => { dragRef.current = null; }}
      aria-label={`${layout.label} montage viewport`}
    >
      {slices.map(slice => (
        <div className="montage-cell" key={slice}>
          <div className="montage-image-frame" style={{ transform: `translate(${framing.translationX}px, ${framing.translationY}px) scale(${framing.scale})` }}>
            <SyntheticImage study={study} slice={slice} />
          </div>
          <span>IM {slice + 1}</span>
        </div>
      ))}
      <div className="montage-page-indicator">Images {slices[0] + 1}–{slices.at(-1)! + 1} of {study.slices}<small>Wheel: page · Ctrl+wheel: zoom · Drag: pan</small></div>
    </div>
  );
}

