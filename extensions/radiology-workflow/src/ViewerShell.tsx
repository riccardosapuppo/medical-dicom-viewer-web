import { useState } from 'react';
import type { Study } from '../../../src/domain/study';
import { formatDate, formatPatientName } from './format';
import { SyntheticImage } from './SyntheticImage';

export function ViewerShell({ study }: { study: Study }) {
  const [slice, setSlice] = useState(Math.floor(study.slices / 2));

  return (
    <section className="viewer-shell">
      <header className="patient-strip">
        <div><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId} · {study.sex} · {study.birthYear}</span></div>
        <div><strong>{study.description}</strong><span>{formatDate(study.studyDate)} · {study.accessionNumber}</span></div>
        <div className="study-count"><strong>{study.modality}</strong><span>{study.slices} images</span></div>
      </header>
      <nav className="viewer-toolbar" aria-label="Viewer tools">
        <button type="button" className="active">Scroll</button><button type="button">Window</button><button type="button">Zoom</button><button type="button">Pan</button><button type="button">Length</button><button type="button">Reference</button><i />
        <button type="button">Layout</button><button type="button">Montage</button><button type="button">Protocols</button><button type="button">Key images</button>
      </nav>
      <div className="viewer-body">
        <aside className="series-browser">
          <div className="panel-title"><strong>Series</strong><span>1</span></div>
          <button className="series-card selected" type="button"><SyntheticImage study={study} compact /><span><strong>1 · {study.seriesDescription}</strong><small>{study.slices} images</small></span></button>
        </aside>
        <main className="viewport-stage">
          <div className="viewport active-viewport">
            <SyntheticImage study={study} slice={slice} />
            <div className="overlay top-left"><strong>{formatPatientName(study.patientName)}</strong><span>{study.patientId}</span><span>{study.description}</span></div>
            <div className="overlay top-right"><span>{study.modality}</span><span>{study.seriesDescription}</span><span>W: 400 L: 48</span></div>
            <div className="overlay bottom-left"><span>Zoom 100%</span><span>Slice {slice + 1} / {study.slices}</span></div>
            <div className="orientation orientation-top">A</div><div className="orientation orientation-left">R</div>
            <input aria-label="Current slice" className="slice-slider" type="range" min="0" max={study.slices - 1} value={slice} onChange={event => setSlice(Number(event.target.value))} />
          </div>
        </main>
        <aside className="measurements-panel"><div className="panel-title"><strong>Measurements</strong><span>0</span></div><div className="empty-panel"><span>＋</span><strong>No findings</strong><small>Measurements and segmentations provided by OHIF appear here.</small></div></aside>
      </div>
    </section>
  );
}

