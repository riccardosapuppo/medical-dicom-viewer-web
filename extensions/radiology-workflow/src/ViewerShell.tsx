import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import type { Study } from './study';
import { formatDate, formatPatientName } from './format';
import { HangingProtocolManager } from './HangingProtocolManager';
import { HangingProtocolRepository } from './hangingProtocolRepository';
import {
  applyHangingProtocol,
  viewportGridLayouts,
  type SavedHangingProtocol,
  type ViewerPresentationState,
  type ViewportGridLayoutId,
} from './hangingProtocols';
import { AnnotationOverlay } from './AnnotationOverlay';
import { KeyImageBoard } from './KeyImageBoard';
import { KeyImageRepository } from './keyImageRepository';
import { annotationLength, captureKeyImage, type KeyImage, type LengthAnnotation, type Point } from './keyImages';
import { MontageMenu } from './MontageMenu';
import { MontageViewport } from './MontageViewport';
import type { MontageLayoutId } from './montage';
import { handleReferenceCursorMove } from './referenceCursors';
import { SafeStackScroller } from './SafeStackScroller';
import { SyntheticImage } from './SyntheticImage';
import { useSmartImageLoading } from './useSmartImageLoading';

export function ViewerShell({ study }: { study: Study }) {
  const [slice, setSlice] = useState(Math.floor(study.slices / 2));
  const [montageLayout, setMontageLayout] = useState<MontageLayoutId>('off');
  const [montageMenuOpen, setMontageMenuOpen] = useState(false);
  const [gridLayout, setGridLayout] = useState<ViewportGridLayoutId>('1x1');
  const [windowCenter, setWindowCenter] = useState(study.modality === 'CT' ? 48 : 620);
  const [windowWidth, setWindowWidth] = useState(study.modality === 'CT' ? 400 : 1100);
  const [colormap, setColormap] = useState<'grayscale' | 'inverse'>('grayscale');
  const [protocolManagerOpen, setProtocolManagerOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<'scroll' | 'window' | 'zoom' | 'pan' | 'length' | 'reference'>('scroll');
  const [referenceCursor, setReferenceCursor] = useState<{ x: number; y: number; dragging: boolean } | null>(null);
  const [lengthAnnotation, setLengthAnnotation] = useState<LengthAnnotation | undefined>();
  const [drawingLength, setDrawingLength] = useState(false);
  const [keyImageBoardOpen, setKeyImageBoardOpen] = useState(false);
  const repository = useMemo(() => new HangingProtocolRepository(window.localStorage), []);
  const [protocols, setProtocols] = useState<SavedHangingProtocol[]>(() => repository.list());
  const keyImageRepository = useMemo(() => new KeyImageRepository(window.localStorage), []);
  const [keyImages, setKeyImages] = useState<KeyImage[]>(() => keyImageRepository.list());
  const grid = viewportGridLayouts[gridLayout];
  const imageLoading = useSmartImageLoading(study, slice);
  const scrollerRef = useRef<SafeStackScroller | null>(null);
  if (!scrollerRef.current) {
    scrollerRef.current = new SafeStackScroller(
      slice,
      study.slices,
      () => Promise.resolve(),
      index => setSlice(index)
    );
  }
  useEffect(() => scrollerRef.current?.synchronize(slice), [slice]);
  const currentKeyImageId = study.sopInstanceUIDs[slice];
  const isCurrentKeyImage = keyImages.some(image => image.id === currentKeyImageId);

  useEffect(() => {
    if (!keyImageRepository.list().some(image => image.id === currentKeyImageId)) return;
    keyImageRepository.upsert(captureKeyImage(study, slice, lengthAnnotation));
    setKeyImages(keyImageRepository.list());
  }, [currentKeyImageId, keyImageRepository, lengthAnnotation, slice, study]);
  const presentation: ViewerPresentationState = {
    gridLayout,
    montageLayout,
    sliceIndex: slice,
    windowCenter,
    windowWidth,
    colormap,
    framing: { fillRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
  };

  const cycleGrid = () => {
    const layouts: ViewportGridLayoutId[] = ['1x1', '1x2', '2x2'];
    setGridLayout(layouts[(layouts.indexOf(gridLayout) + 1) % layouts.length]);
  };

  const moveReferenceCursor = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'reference') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const result = handleReferenceCursorMove({
      x,
      y,
      primaryButtonDown: (event.buttons & 1) === 1,
      closestSliceIndex: Math.max(0, Math.min(study.slices - 1, Math.round((y / Math.max(1, rect.height)) * (study.slices - 1)))),
    });
    setReferenceCursor(result.cursor);
    if (result.synchronizeSliceIndex !== undefined) setSlice(result.synchronizeSliceIndex);
  };

  const normalizedPoint = (event: PointerEvent<HTMLDivElement>): { point: Point; width: number; height: number } => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      point: {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
      },
      width: rect.width,
      height: rect.height,
    };
  };

  const drawLength = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'length' || !drawingLength) return;
    const { point, width, height } = normalizedPoint(event);
    setLengthAnnotation(current => {
      if (!current) return current;
      const next = { ...current, end: point };
      return { ...next, label: `${annotationLength(next, width, height).toFixed(1)} px` };
    });
  };

  const viewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || montageLayout !== 'off') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activeTool === 'reference') moveReferenceCursor(event);
    if (activeTool === 'length') {
      const { point } = normalizedPoint(event);
      setLengthAnnotation({ start: point, end: point, label: '0.0 px' });
      setDrawingLength(true);
    }
  };

  const viewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    moveReferenceCursor(event);
    drawLength(event);
  };

  const viewportPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'reference') {
      moveReferenceCursor(event);
      setReferenceCursor(current => current ? { ...current, dragging: false } : null);
    }
    if (activeTool === 'length') {
      drawLength(event);
      setDrawingLength(false);
    }
  };

  const toggleKeyImage = () => {
    if (isCurrentKeyImage) keyImageRepository.delete(currentKeyImageId);
    else keyImageRepository.upsert(captureKeyImage(study, slice, lengthAnnotation));
    setKeyImages(keyImageRepository.list());
  };

  const scrollStack = (event: WheelEvent<HTMLDivElement>) => {
    if (montageLayout !== 'off' || activeTool !== 'scroll') return;
    event.preventDefault();
    void scrollerRef.current?.step(event.deltaY > 0 ? 1 : -1);
  };

  const applyProtocol = (protocol: SavedHangingProtocol, mode: 'full' | 'gridOnly') => {
    const applied = applyHangingProtocol(presentation, protocol, mode);
    setGridLayout(applied.gridLayout);
    setMontageLayout(applied.montageLayout);
    if (mode === 'full') {
      setSlice(Math.min(study.slices - 1, applied.sliceIndex));
      setWindowCenter(applied.windowCenter);
      setWindowWidth(applied.windowWidth);
      setColormap(applied.colormap);
    }
    setProtocolManagerOpen(false);
  };

  return (
    <section className="viewer-shell">
      <header className="patient-strip">
        <div><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId} · {study.sex} · {study.birthYear}</span></div>
        <div><strong>{study.description}</strong><span>{formatDate(study.studyDate)} · {study.accessionNumber}</span></div>
        <div className="study-count"><strong>{study.modality}</strong><span>{study.slices} images</span></div>
      </header>
      <nav className="viewer-toolbar" aria-label="Viewer tools">
        <button type="button" className={activeTool === 'scroll' ? 'active' : ''} onClick={() => setActiveTool('scroll')}>Scroll</button><button type="button" className={activeTool === 'window' ? 'active' : ''} onClick={() => setActiveTool('window')}>Window</button><button type="button" className={activeTool === 'zoom' ? 'active' : ''} onClick={() => setActiveTool('zoom')}>Zoom</button><button type="button" className={activeTool === 'pan' ? 'active' : ''} onClick={() => setActiveTool('pan')}>Pan</button><button type="button" className={activeTool === 'length' ? 'active' : ''} onClick={() => setActiveTool('length')}>Length</button><button type="button" className={activeTool === 'reference' ? 'active' : ''} onClick={() => setActiveTool('reference')}>Reference</button><i />
        <button type="button" className={gridLayout !== '1x1' ? 'active' : ''} onClick={cycleGrid}>Layout {gridLayout}</button>
        <span className="toolbar-menu-anchor"><button type="button" className={montageLayout !== 'off' ? 'active' : ''} aria-expanded={montageMenuOpen} onClick={() => setMontageMenuOpen(open => !open)}>Montage {montageLayout === 'off' ? '' : montageLayout}</button>{montageMenuOpen && <MontageMenu activeLayout={montageLayout} onSelect={layout => { setMontageLayout(layout); setMontageMenuOpen(false); }} />}</span>
        <button type="button" onClick={() => setProtocolManagerOpen(true)}>Protocols <span className="button-count">{protocols.length}</span></button><button type="button" className={isCurrentKeyImage ? 'active' : ''} onClick={toggleKeyImage}>{isCurrentKeyImage ? '★ Key image' : '☆ Mark key'}</button><button type="button" onClick={() => setKeyImageBoardOpen(true)}>Key images <span className="button-count">{keyImages.length}</span></button>
      </nav>
      <div className="viewer-body">
        <aside className="series-browser">
          <div className="panel-title"><strong>Series</strong><span>1</span></div>
          <button className="series-card selected" type="button"><SyntheticImage study={study} compact /><span><strong>1 · {study.seriesDescription}</strong><small>{study.slices} images</small></span></button>
        </aside>
        <main className="viewport-stage">
          <div className="viewport-grid" style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}>
            {Array.from({ length: grid.rows * grid.columns }, (_, viewportIndex) => {
              const viewportSlice = Math.min(study.slices - 1, slice + viewportIndex * Math.max(1, Math.floor(study.slices / (grid.rows * grid.columns))));
              return (
                <div
                  className={viewportIndex === 0 ? `viewport active-viewport tool-${activeTool}` : 'viewport'}
                  key={viewportIndex}
                  onWheel={viewportIndex === 0 ? scrollStack : undefined}
                  onPointerDown={viewportIndex === 0 ? viewportPointerDown : undefined}
                  onPointerMove={viewportIndex === 0 ? viewportPointerMove : undefined}
                  onPointerUp={viewportIndex === 0 ? viewportPointerUp : undefined}
                  onPointerLeave={viewportIndex === 0 ? () => setReferenceCursor(current => current?.dragging ? current : null) : undefined}
                >
                  {viewportIndex === 0 && montageLayout !== 'off' ? <MontageViewport study={study} layoutId={montageLayout} onPageChange={setSlice} /> : <div className={colormap === 'inverse' ? 'standard-image inverse' : 'standard-image'}><SyntheticImage study={study} slice={viewportSlice} /></div>}
                  <div className="overlay top-left"><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId}</span><span>{study.description}</span></div>
                  <div className="overlay top-right"><span>{study.modality}</span><span>{study.seriesDescription}</span><span>W: {windowWidth} L: {windowCenter}</span></div>
                  <div className="overlay bottom-left"><span>Viewport {viewportIndex + 1}</span><span>Slice {viewportSlice + 1} / {study.slices}</span></div>
                  <div className="orientation orientation-top">A</div><div className="orientation orientation-left">R</div>
                  {viewportIndex === 0 && montageLayout === 'off' && <AnnotationOverlay annotation={lengthAnnotation} />}
                  {viewportIndex === 0 && referenceCursor && activeTool === 'reference' && <div className={referenceCursor.dragging ? 'reference-cursor dragging' : 'reference-cursor'} style={{ left: referenceCursor.x, top: referenceCursor.y }}><i /><b /></div>}
                  {viewportIndex === 0 && imageLoading && <div className="image-loading" aria-label="Loading selected image"><span /></div>}
                  {viewportIndex === 0 && montageLayout === 'off' && <input aria-label="Current slice" className="slice-slider" type="range" min="0" max={study.slices - 1} value={slice} onChange={event => setSlice(Number(event.target.value))} />}
                </div>
              );
            })}
          </div>
        </main>
        <aside className="measurements-panel"><div className="panel-title"><strong>Measurements</strong><span>0</span></div><div className="empty-panel"><span>＋</span><strong>No findings</strong><small>Measurements and segmentations provided by OHIF appear here.</small></div></aside>
      </div>
      {protocolManagerOpen && (
        <HangingProtocolManager
          study={study}
          presentation={presentation}
          protocols={protocols}
          onSave={protocol => { repository.save(protocol); setProtocols(repository.list()); }}
          onDelete={id => { repository.delete(id); setProtocols(repository.list()); }}
          onApply={applyProtocol}
          onClose={() => setProtocolManagerOpen(false)}
        />
      )}
      {keyImageBoardOpen && <KeyImageBoard images={keyImages} onDelete={id => { keyImageRepository.delete(id); setKeyImages(keyImageRepository.list()); }} onClose={() => setKeyImageBoardOpen(false)} />}
    </section>
  );
}
