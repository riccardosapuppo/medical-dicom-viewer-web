import { useMemo, useReducer } from 'react';
import { syntheticStudies } from '../../../src/data/studies';
import { formatPatientName } from './format';
import { studyTabsReducer, initialStudyTabsState } from './studyTabs';
import { ViewerShell } from './ViewerShell';
import { Worklist } from './Worklist';

export function RadiologyWorkflow() {
  const [tabs, dispatch] = useReducer(studyTabsReducer, initialStudyTabsState);
  const activeStudy = tabs.openStudies.find(study => study.studyInstanceUID === tabs.activeStudyUID);
  const openStudyUIDs = useMemo(() => new Set(tabs.openStudies.map(study => study.studyInstanceUID)), [tabs.openStudies]);

  return (
    <div className="radiology-app">
      <header className="app-header">
        <button className="brand" type="button" onClick={() => dispatch({ type: 'activate', studyInstanceUID: null })} aria-label="Open worklist"><span>R</span><div><strong>Radiology</strong><small>workflow viewer</small></div></button>
        <nav className="study-tabs" aria-label="Open studies">
          <button type="button" className={tabs.activeStudyUID === null ? 'study-tab active' : 'study-tab'} onClick={() => dispatch({ type: 'activate', studyInstanceUID: null })}><span className="tab-icon">▦</span><span><strong>Worklist</strong><small>18 synthetic studies</small></span></button>
          {tabs.openStudies.map(study => (
            <div key={study.studyInstanceUID} className={tabs.activeStudyUID === study.studyInstanceUID ? 'study-tab active' : 'study-tab'}>
              <button type="button" className="tab-main" onClick={() => dispatch({ type: 'activate', studyInstanceUID: study.studyInstanceUID })}><span className={`tab-modality ${study.modality.toLowerCase()}`}>{study.modality}</span><span><strong>{formatPatientName(study.patientName)}</strong><small>{study.accessionNumber}</small></span></button>
              <button type="button" className="tab-close" aria-label={`Close ${study.description}`} onClick={() => dispatch({ type: 'close', studyInstanceUID: study.studyInstanceUID })}>×</button>
            </div>
          ))}
        </nav>
        <div className="operator"><span>Demo reader</span><small>Local session</small></div>
      </header>
      {activeStudy ? <ViewerShell key={activeStudy.studyInstanceUID} study={activeStudy} /> : <Worklist studies={syntheticStudies} openStudyUIDs={openStudyUIDs} onOpenStudy={study => dispatch({ type: 'open', study })} />}
    </div>
  );
}
