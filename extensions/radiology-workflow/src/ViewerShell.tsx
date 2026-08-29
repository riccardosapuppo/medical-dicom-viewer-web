import { useMemo, useState } from 'react';
import type { Study } from '../../../src/domain/study';
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
import { MontageMenu } from './MontageMenu';
import { MontageViewport } from './MontageViewport';
import type { MontageLayoutId } from './montage';
import { SyntheticImage } from './SyntheticImage';

export function ViewerShell({ study }: { study: Study }) {
  const [slice, setSlice] = useState(Math.floor(study.slices / 2));
  const [montageLayout, setMontageLayout] = useState<MontageLayoutId>('off');
  const [montageMenuOpen, setMontageMenuOpen] = useState(false);
  const [gridLayout, setGridLayout] = useState<ViewportGridLayoutId>('1x1');
  const [windowCenter, setWindowCenter] = useState(study.modality === 'CT' ? 48 : 620);
  const [windowWidth, setWindowWidth] = useState(study.modality === 'CT' ? 400 : 1100);
  const [colormap, setColormap] = useState<'grayscale' | 'inverse'>('grayscale');
  const [protocolManagerOpen, setProtocolManagerOpen] = useState(false);
  const repository = useMemo(() => new HangingProtocolRepository(window.localStorage), []);
  const [protocols, setProtocols] = useState<SavedHangingProtocol[]>(() => repository.list());
  const grid = viewportGridLayouts[gridLayout];
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
        <button type="button" className="active">Scroll</button><button type="button">Window</button><button type="button">Zoom</button><button type="button">Pan</button><button type="button">Length</button><button type="button">Reference</button><i />
        <button type="button" className={gridLayout !== '1x1' ? 'active' : ''} onClick={cycleGrid}>Layout {gridLayout}</button>
        <span className="toolbar-menu-anchor"><button type="button" className={montageLayout !== 'off' ? 'active' : ''} aria-expanded={montageMenuOpen} onClick={() => setMontageMenuOpen(open => !open)}>Montage {montageLayout === 'off' ? '' : montageLayout}</button>{montageMenuOpen && <MontageMenu activeLayout={montageLayout} onSelect={layout => { setMontageLayout(layout); setMontageMenuOpen(false); }} />}</span>
        <button type="button" onClick={() => setProtocolManagerOpen(true)}>Protocols <span className="button-count">{protocols.length}</span></button><button type="button">Key images</button>
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
                <div className={viewportIndex === 0 ? 'viewport active-viewport' : 'viewport'} key={viewportIndex}>
                  {viewportIndex === 0 && montageLayout !== 'off' ? <MontageViewport study={study} layoutId={montageLayout} onPageChange={setSlice} /> : <div className={colormap === 'inverse' ? 'standard-image inverse' : 'standard-image'}><SyntheticImage study={study} slice={viewportSlice} /></div>}
                  <div className="overlay top-left"><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId}</span><span>{study.description}</span></div>
                  <div className="overlay top-right"><span>{study.modality}</span><span>{study.seriesDescription}</span><span>W: {windowWidth} L: {windowCenter}</span></div>
                  <div className="overlay bottom-left"><span>Viewport {viewportIndex + 1}</span><span>Slice {viewportSlice + 1} / {study.slices}</span></div>
                  <div className="orientation orientation-top">A</div><div className="orientation orientation-left">R</div>
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
    </section>
  );
}
