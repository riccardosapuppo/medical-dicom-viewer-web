import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Study, StudySeries } from './study';
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
import { KeyImageBoard } from './KeyImageBoard';
import { KeyImageRepository } from './keyImageRepository';
import { captureKeyImage, type KeyImage } from './keyImages';
import { MontageMenu } from './MontageMenu';
import { getMontageLayout, normalizeMontagePageStart, type MontageLayoutId } from './montage';
import { handleReferenceCursorMove } from './referenceCursors';
import { SyntheticImage } from './SyntheticImage';
import {
  CornerstoneViewport,
  type CornerstoneViewportHandle,
  type ViewportPresentation,
} from './CornerstoneViewport';
import type { PrimaryViewerTool } from './cornerstoneTools';

const defaultPresentation: ViewportPresentation = {
  windowCenter: 0,
  windowWidth: 0,
  zoom: 1,
  pan: [0, 0],
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  invert: false,
};

const toolInstructions: Record<PrimaryViewerTool, string> = {
  length: 'Drag between two points to measure a calibrated distance.',
  magnify: 'Drag the magnifying lens over the image.',
  pan: 'Drag the image to reposition it in the viewport.',
  polygon: 'Draw a freehand planar ROI and close the contour.',
  probe: 'Click a pixel to inspect its stored value.',
  rectangle: 'Drag a rectangular ROI over the anatomy.',
  reference: 'Drag the yellow cursor to synchronize the active stack.',
  scroll: 'Drag vertically or use the mouse wheel to move through the stack.',
  window: 'Drag horizontally and vertically to change width and level.',
  zoom: 'Drag vertically to change magnification.',
};

export function ViewerShell({ study }: { study: Study }) {
  const [selectedSeriesKey, setSelectedSeriesKey] = useState(study.series[0].key);
  const selectedSeries = study.series.find(series => series.key === selectedSeriesKey) ?? study.series[0];
  const [slice, setSlice] = useState(Math.floor(selectedSeries.slices / 2));
  const [viewportSlices, setViewportSlices] = useState<Record<number, number>>({ 0: slice });
  const [activeViewport, setActiveViewport] = useState(0);
  const [activeTool, setActiveTool] = useState<PrimaryViewerTool>('scroll');
  const [montageLayout, setMontageLayout] = useState<MontageLayoutId>('off');
  const [gridLayout, setGridLayout] = useState<ViewportGridLayoutId>('1x1');
  const [openMenu, setOpenMenu] = useState<'measurements' | 'transform' | 'montage' | 'more' | null>(null);
  const [sliceSync, setSliceSync] = useState(false);
  const [cineRunning, setCineRunning] = useState(false);
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [protocolManagerOpen, setProtocolManagerOpen] = useState(false);
  const [keyImageBoardOpen, setKeyImageBoardOpen] = useState(false);
  const [referenceCursor, setReferenceCursor] = useState<{ x: number; y: number; dragging: boolean } | null>(null);
  const [presentation, setPresentation] = useState<ViewportPresentation>(defaultPresentation);
  const [annotationCount, setAnnotationCount] = useState(0);
  const [readyViewports, setReadyViewports] = useState<Set<number>>(() => new Set());
  const [viewportErrors, setViewportErrors] = useState<Record<number, string>>({});
  const viewportRefs = useRef<Array<CornerstoneViewportHandle | null>>([]);
  const sliceRef = useRef(slice);
  const repository = useMemo(() => new HangingProtocolRepository(window.localStorage), []);
  const [protocols, setProtocols] = useState<SavedHangingProtocol[]>(() => repository.list());
  const keyImageRepository = useMemo(() => new KeyImageRepository(window.localStorage), []);
  const [keyImages, setKeyImages] = useState<KeyImage[]>(() => keyImageRepository.list());

  sliceRef.current = slice;

  const grid = viewportGridLayouts[gridLayout];
  const montage = getMontageLayout(montageLayout);
  const rows = montageLayout === 'off' ? grid.rows : montage.rows;
  const columns = montageLayout === 'off' ? grid.columns : montage.columns;
  const viewportCount = rows * columns;

  const seriesForViewport = (index: number): StudySeries => {
    if (montageLayout !== 'off') return selectedSeries;
    const selectedIndex = study.series.findIndex(series => series.key === selectedSeries.key);
    return study.series[(selectedIndex + index) % study.series.length];
  };

  const initialSliceForViewport = (index: number, series: StudySeries) => {
    if (montageLayout !== 'off') {
      return Math.min(series.slices - 1, normalizeMontagePageStart(series.slices, viewportCount, slice) + index);
    }
    if (viewportSlices[index] !== undefined) return Math.min(series.slices - 1, viewportSlices[index]);
    return Math.min(series.slices - 1, Math.round((slice / Math.max(1, selectedSeries.slices - 1)) * (series.slices - 1)));
  };

  const selectSeries = (series: StudySeries) => {
    const nextSlice = Math.floor(series.slices / 2);
    setSelectedSeriesKey(series.key);
    setSlice(nextSlice);
    setViewportSlices({ 0: nextSlice });
    setActiveViewport(0);
    setMontageLayout('off');
    setReadyViewports(new Set());
    setViewportErrors({});
  };

  const updateViewportSlice = (viewportIndex: number, index: number) => {
    setViewportSlices(current => current[viewportIndex] === index ? current : { ...current, [viewportIndex]: index });
    if (viewportIndex !== activeViewport) return;
    setSlice(index);
    if (!sliceSync || montageLayout !== 'off') return;
    viewportRefs.current.forEach((viewport, otherIndex) => {
      if (otherIndex !== viewportIndex) void viewport?.jumpTo(index);
    });
  };

  useEffect(() => {
    if (!cineRunning) return;
    const timer = window.setInterval(() => {
      const series = seriesForViewport(activeViewport);
      const next = (sliceRef.current + 1) % series.slices;
      void viewportRefs.current[activeViewport]?.jumpTo(next);
    }, 120);
    return () => window.clearInterval(timer);
  }, [activeViewport, cineRunning, selectedSeriesKey, montageLayout]);

  const currentSeries = seriesForViewport(activeViewport);
  const currentSopInstanceUID = currentSeries.sopInstanceUIDs[Math.min(slice, currentSeries.slices - 1)];
  const isCurrentKeyImage = keyImages.some(image => image.id === currentSopInstanceUID);

  const toggleKeyImage = () => {
    if (isCurrentKeyImage) {
      keyImageRepository.delete(currentSopInstanceUID);
    } else {
      keyImageRepository.upsert(captureKeyImage({
        ...study,
        slices: currentSeries.slices,
        seriesDescription: currentSeries.description,
        seriesInstanceUID: currentSeries.seriesInstanceUID,
        sopInstanceUIDs: currentSeries.sopInstanceUIDs,
      }, Math.min(slice, currentSeries.slices - 1)));
    }
    setKeyImages(keyImageRepository.list());
  };

  const cycleGrid = () => {
    const layouts: ViewportGridLayoutId[] = ['1x1', '1x2', '2x2'];
    setMontageLayout('off');
    setGridLayout(layouts[(layouts.indexOf(gridLayout) + 1) % layouts.length]);
    setReadyViewports(new Set());
  };

  const moveReferenceCursor = (event: PointerEvent<HTMLDivElement>, viewportIndex: number, series: StudySeries) => {
    if (activeTool !== 'reference') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const result = handleReferenceCursorMove({
      x,
      y,
      primaryButtonDown: (event.buttons & 1) === 1,
      closestSliceIndex: Math.max(0, Math.min(series.slices - 1, Math.round((y / Math.max(1, rect.height)) * (series.slices - 1)))),
    });
    setReferenceCursor(result.cursor);
    if (result.synchronizeSliceIndex !== undefined) {
      void viewportRefs.current[viewportIndex]?.jumpTo(result.synchronizeSliceIndex);
    }
  };

  const hangingPresentation: ViewerPresentationState = {
    gridLayout,
    montageLayout,
    sliceIndex: slice,
    windowCenter: presentation.windowCenter,
    windowWidth: presentation.windowWidth,
    colormap: presentation.invert ? 'inverse' : 'grayscale',
    framing: { fillRatio: presentation.zoom, offsetXRatio: presentation.pan[0], offsetYRatio: presentation.pan[1] },
  };

  const applyProtocol = (protocol: SavedHangingProtocol, mode: 'full' | 'gridOnly') => {
    const applied = applyHangingProtocol(hangingPresentation, protocol, mode);
    setGridLayout(applied.gridLayout);
    setMontageLayout(applied.montageLayout);
    if (mode === 'full') {
      const nextSlice = Math.min(currentSeries.slices - 1, applied.sliceIndex);
      setSlice(nextSlice);
      void viewportRefs.current[activeViewport]?.jumpTo(nextSlice);
      viewportRefs.current[activeViewport]?.setWindow(applied.windowCenter, applied.windowWidth);
      if ((applied.colormap === 'inverse') !== presentation.invert) viewportRefs.current[activeViewport]?.toggleInvert();
    }
    setProtocolManagerOpen(false);
  };

  const chooseTool = (tool: PrimaryViewerTool) => {
    setActiveTool(tool);
    setOpenMenu(null);
  };

  return (
    <section className="viewer-shell">
      <header className="patient-strip">
        <div><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId} · {study.sex} · {study.birthYear}</span></div>
        <div><strong>{study.description}</strong><span>{formatDate(study.studyDate)} · {study.accessionNumber}</span></div>
        <div className="study-count"><strong>{study.modality}</strong><span>{study.numberOfStudyRelatedSeries} series · {study.numberOfStudyRelatedInstances} images</span></div>
      </header>

      <nav className="viewer-toolbar" aria-label="Viewer tools">
        <ToolbarMenu label="Measurements" active={['length', 'probe', 'rectangle'].includes(activeTool)} open={openMenu === 'measurements'} onToggle={() => setOpenMenu(openMenu === 'measurements' ? null : 'measurements')}>
          <button type="button" onClick={() => chooseTool('length')}>Length</button>
          <button type="button" onClick={() => chooseTool('probe')}>Probe</button>
          <button type="button" onClick={() => chooseTool('rectangle')}>Rectangle ROI</button>
        </ToolbarMenu>
        <ToolButton label="Pan" tool="pan" activeTool={activeTool} onSelect={chooseTool} />
        <ToolButton label="Stack scroll" tool="scroll" activeTool={activeTool} onSelect={chooseTool} />
        <ToolButton label="Reference cursors" tool="reference" activeTool={activeTool} onSelect={chooseTool} />
        <button type="button" className={sliceSync ? 'active' : ''} onClick={() => setSliceSync(value => !value)}>Image slice sync</button>
        <ToolButton label="Window / level" tool="window" activeTool={activeTool} onSelect={chooseTool} />
        <ToolButton label="Zoom" tool="zoom" activeTool={activeTool} onSelect={chooseTool} />
        <ToolbarMenu label="Transform" open={openMenu === 'transform'} onToggle={() => setOpenMenu(openMenu === 'transform' ? null : 'transform')}>
          <button type="button" onClick={() => viewportRefs.current[activeViewport]?.rotate(90)}>Rotate right</button>
          <button type="button" onClick={() => viewportRefs.current[activeViewport]?.rotate(-90)}>Rotate left</button>
          <button type="button" onClick={() => viewportRefs.current[activeViewport]?.flip('horizontal')}>Flip horizontal</button>
          <button type="button" onClick={() => viewportRefs.current[activeViewport]?.flip('vertical')}>Flip vertical</button>
        </ToolbarMenu>
        <ToolButton label="Magnify" tool="magnify" activeTool={activeTool} onSelect={chooseTool} />
        <button type="button" className={gridLayout !== '1x1' && montageLayout === 'off' ? 'active' : ''} onClick={cycleGrid}>Layout {gridLayout}</button>
        <ToolbarMenu label="Montage" active={montageLayout !== 'off'} open={openMenu === 'montage'} onToggle={() => setOpenMenu(openMenu === 'montage' ? null : 'montage')} wide>
          <MontageMenu activeLayout={montageLayout} onSelect={layout => { setMontageLayout(layout); setOpenMenu(null); setReadyViewports(new Set()); }} />
        </ToolbarMenu>
        <UnavailableTool label="MPR" />
        <UnavailableTool label="Historical MPR" />
        <UnavailableTool label="PT/CT layout" />
        <UnavailableTool label="Crosshairs" />
        <UnavailableTool label="3D rotate" />
        <button type="button" className={presentation.invert ? 'active' : ''} onClick={() => viewportRefs.current[activeViewport]?.toggleInvert()}>Invert</button>
        <ToolButton label="Polygon" tool="polygon" activeTool={activeTool} onSelect={chooseTool} />
        <ToolButton label="Probe" tool="probe" activeTool={activeTool} onSelect={chooseTool} />
        <button type="button" className={cineRunning ? 'active' : ''} onClick={() => setCineRunning(value => !value)}>{cineRunning ? 'Stop cine' : 'Cine'}</button>
        <button type="button" className={isCurrentKeyImage ? 'active' : ''} onClick={toggleKeyImage}>{isCurrentKeyImage ? 'Key image' : 'Capture'}</button>
        <button type="button" className={!overlaysVisible ? 'active' : ''} onClick={() => setOverlaysVisible(value => !value)}>{overlaysVisible ? 'Hide DICOM info' : 'Show DICOM info'}</button>
        <UnavailableTool label="Reference lines" />
        <UnavailableTool label="Scale overlay" />
        <ToolbarMenu label="More tools" open={openMenu === 'more'} onToggle={() => setOpenMenu(openMenu === 'more' ? null : 'more')}>
          <button type="button" onClick={() => { viewportRefs.current[activeViewport]?.reset(); setOpenMenu(null); }}>Reset viewport</button>
          <button type="button" onClick={() => chooseTool('rectangle')}>Rectangle ROI</button>
        </ToolbarMenu>
        <button type="button" onClick={() => setProtocolManagerOpen(true)}>Hanging protocols <span className="button-count">{protocols.length}</span></button>
        <button type="button" onClick={() => setKeyImageBoardOpen(true)}>Print <span className="button-count">{keyImages.length}</span></button>
      </nav>

      <div className="viewer-body">
        <aside className="series-browser">
          <div className="panel-title"><strong>Series</strong><span>{study.series.length}</span></div>
          <div className="series-list">
            {study.series.map(series => (
              <button className={series.key === selectedSeries.key ? 'series-card selected' : 'series-card'} type="button" key={series.seriesInstanceUID} onClick={() => selectSeries(series)}>
                <SyntheticImage study={study} slice={Math.floor(series.slices / 2)} compact />
                <span><strong>{series.seriesNumber} · {series.description}</strong><small>{series.orientation} · {series.slices} images</small><small>{series.pixelSpacing.join(' x ')} mm · {series.spacingBetweenSlices} mm</small></span>
              </button>
            ))}
          </div>
        </aside>

        <main className="viewport-stage">
          <div className="viewport-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {Array.from({ length: viewportCount }, (_, viewportIndex) => {
              const series = seriesForViewport(viewportIndex);
              const viewportSlice = initialSliceForViewport(viewportIndex, series);
              const isActive = viewportIndex === activeViewport;
              return (
                <div className={isActive ? 'viewport active-viewport' : 'viewport'} key={`${montageLayout}-${gridLayout}-${series.seriesInstanceUID}-${viewportIndex}`} onPointerDown={() => setActiveViewport(viewportIndex)}>
                  <CornerstoneViewport
                    ref={handle => { viewportRefs.current[viewportIndex] = handle; }}
                    series={series}
                    activeTool={activeTool}
                    initialIndex={viewportSlice}
                    onIndexChange={index => updateViewportSlice(viewportIndex, index)}
                    onPresentationChange={next => { if (isActive) setPresentation(next); }}
                    onAnnotationCountChange={count => { if (isActive) setAnnotationCount(count); }}
                    onReady={() => setReadyViewports(current => new Set(current).add(viewportIndex))}
                    onError={message => setViewportErrors(current => ({ ...current, [viewportIndex]: message }))}
                  />
                  {overlaysVisible && (
                    <>
                      <div className="overlay top-left"><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId}</span><span>{study.description}</span></div>
                      <div className="overlay top-right"><span>{study.modality}</span><span>{series.description}</span><span>W: {presentation.windowWidth} L: {presentation.windowCenter}</span></div>
                      <div className="overlay bottom-left"><span>Viewport {viewportIndex + 1}</span><span>Image {(viewportSlices[viewportIndex] ?? viewportSlice) + 1} / {series.slices}</span></div>
                      <div className="orientation orientation-top">A</div><div className="orientation orientation-left">R</div>
                    </>
                  )}
                  {activeTool === 'reference' && isActive && (
                    <div
                      className="reference-interaction"
                      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); moveReferenceCursor(event, viewportIndex, series); }}
                      onPointerMove={event => moveReferenceCursor(event, viewportIndex, series)}
                      onPointerUp={event => { moveReferenceCursor(event, viewportIndex, series); setReferenceCursor(current => current ? { ...current, dragging: false } : null); }}
                    />
                  )}
                  {referenceCursor && activeTool === 'reference' && isActive && <div className={referenceCursor.dragging ? 'reference-cursor dragging' : 'reference-cursor'} style={{ left: referenceCursor.x, top: referenceCursor.y }}><i /><b /></div>}
                  {!readyViewports.has(viewportIndex) && !viewportErrors[viewportIndex] && <div className="viewport-loader"><span />Loading DICOM stack…</div>}
                  {viewportErrors[viewportIndex] && <div className="viewport-error"><strong>Stack unavailable</strong><span>{viewportErrors[viewportIndex]}</span></div>}
                  <div className="vertical-slider-track">
                    <input
                      aria-label={`Viewport ${viewportIndex + 1} current image`}
                      className="slice-slider"
                      type="range"
                      min="0"
                      max={series.slices - 1}
                      value={Math.min(series.slices - 1, viewportSlices[viewportIndex] ?? viewportSlice)}
                      onChange={event => void viewportRefs.current[viewportIndex]?.jumpTo(Number(event.target.value))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="measurements-panel">
          <div className="panel-title"><strong>Tools</strong><span>{annotationCount}</span></div>
          <div className="tool-status">
            <p className="eyebrow">Active tool</p>
            <h3>{activeTool}</h3>
            <p>{toolInstructions[activeTool]}</p>
          </div>
          <dl className="viewport-properties">
            <div><dt>Series</dt><dd>{currentSeries.seriesNumber} · {currentSeries.orientation}</dd></div>
            <div><dt>Image</dt><dd>{slice + 1} / {currentSeries.slices}</dd></div>
            <div><dt>Window</dt><dd>{presentation.windowWidth} / {presentation.windowCenter}</dd></div>
            <div><dt>Zoom</dt><dd>{presentation.zoom.toFixed(2)}x</dd></div>
            <div><dt>Pan</dt><dd>{Math.round(presentation.pan[0])}, {Math.round(presentation.pan[1])}</dd></div>
            <div><dt>Orientation</dt><dd>{currentSeries.orientation}</dd></div>
            <div><dt>Spacing</dt><dd>{currentSeries.pixelSpacing.join(' × ')} mm</dd></div>
          </dl>
          <div className="measurement-summary"><strong>{annotationCount} measurement{annotationCount === 1 ? '' : 's'}</strong><span>Cornerstone annotations remain attached to this local reading session.</span></div>
        </aside>
      </div>

      {protocolManagerOpen && (
        <HangingProtocolManager
          study={study}
          presentation={hangingPresentation}
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

function ToolButton({ label, tool, activeTool, onSelect }: { label: string; tool: PrimaryViewerTool; activeTool: PrimaryViewerTool; onSelect(tool: PrimaryViewerTool): void }) {
  return <button type="button" className={activeTool === tool ? 'active' : ''} onClick={() => onSelect(tool)}>{label}</button>;
}

function UnavailableTool({ label }: { label: string }) {
  return <button type="button" disabled title="Provided by the upstream OHIF distribution; outside this extension demo.">{label}</button>;
}

function ToolbarMenu({ label, active = false, open, onToggle, wide = false, children }: { label: string; active?: boolean; open: boolean; onToggle(): void; wide?: boolean; children: React.ReactNode }) {
  return (
    <span className={wide ? 'toolbar-menu-anchor wide' : 'toolbar-menu-anchor'}>
      <button type="button" className={active ? 'active' : ''} aria-expanded={open} onClick={onToggle}>{label}</button>
      {open && <div className="toolbar-popover">{children}</div>}
    </span>
  );
}
