import { useEffect, useMemo, useState } from 'react';
import type { Study } from './study';
import { formatDate, formatPatientName, formatTime } from './format';
import { SyntheticImage } from './SyntheticImage';
import { queryStudyInstanceUIDs } from './dicomWeb';
import { emptyFilters, filterStudies, setDatePreset, type WorklistFilters } from './worklistFilters';

interface WorklistProps {
  studies: Study[];
  openStudyUIDs: Set<string>;
  onOpenStudy(study: Study): void;
}

export function Worklist({ studies, openStudyUIDs, onOpenStudy }: WorklistProps) {
  const [filters, setFilters] = useState<WorklistFilters>(() => setDatePreset(emptyFilters, 'today', new Date(2026, 7, 29)));
  const [expandedStudyUID, setExpandedStudyUID] = useState<string | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<{ online: boolean; count: number }>({ online: false, count: studies.length });
  useEffect(() => {
    let active = true;
    queryStudyInstanceUIDs()
      .then(uids => { if (active) setArchiveStatus({ online: true, count: uids.length }); })
      .catch(() => { if (active) setArchiveStatus({ online: false, count: studies.length }); });
    return () => { active = false; };
  }, [studies.length]);
  const filteredStudies = useMemo(() => filterStudies(studies, filters), [filters, studies]);
  const change = (field: keyof WorklistFilters, value: string) => setFilters(current => ({ ...current, [field]: value }));
  const toggleModality = (modality: 'CT' | 'MR') =>
    setFilters(current => ({
      ...current,
      modalities: current.modalities.includes(modality)
        ? current.modalities.filter(value => value !== modality)
        : [...current.modalities, modality],
    }));

  return (
    <section className="worklist-page">
      <header className="worklist-heading">
        <div>
          <p className="eyebrow">Synthetic DICOM archive</p>
          <h1>Study worklist</h1>
          <p>Search the archive, inspect a series, then keep several studies open while reading.</p>
        </div>
        <div className={archiveStatus.online ? 'archive-status online' : 'archive-status'}><span /> {archiveStatus.online ? 'Orthanc connected' : 'Local catalog'} · {archiveStatus.count} studies</div>
      </header>

      <div className="worklist-filters" aria-label="Study filters">
        <label>Patient name<input value={filters.patient} onChange={event => change('patient', event.target.value)} placeholder="Surname or given name" /></label>
        <label>Patient ID<input value={filters.patientId} onChange={event => change('patientId', event.target.value)} placeholder="SYN-0001" /></label>
        <label>Accession number<input value={filters.accessionNumber} onChange={event => change('accessionNumber', event.target.value)} placeholder="DEMO-…" /></label>
        <label>Study description<input value={filters.description} onChange={event => change('description', event.target.value)} placeholder="Head, brain, chest…" /></label>
        <label>From<input type="date" value={filters.dateFrom} onChange={event => change('dateFrom', event.target.value)} /></label>
        <label>To<input type="date" value={filters.dateTo} onChange={event => change('dateTo', event.target.value)} /></label>
        <fieldset>
          <legend>Modality</legend>
          {(['CT', 'MR'] as const).map(modality => (
            <button key={modality} type="button" className={filters.modalities.includes(modality) ? 'filter-chip active' : 'filter-chip'} onClick={() => toggleModality(modality)}>{modality}</button>
          ))}
        </fieldset>
        <div className="date-presets">
          <span>Quick dates</span>
          <button type="button" onClick={() => setFilters(current => setDatePreset(current, 'today', new Date(2026, 7, 29)))}>Today</button>
          <button type="button" onClick={() => setFilters(current => setDatePreset(current, 'yesterday', new Date(2026, 7, 29)))}>Yesterday</button>
          <button type="button" onClick={() => setFilters(current => setDatePreset(current, 'week', new Date(2026, 7, 29)))}>7 days</button>
          <button type="button" onClick={() => setFilters(current => setDatePreset(current, 'all'))}>All</button>
        </div>
      </div>

      <div className="worklist-summary"><strong>{filteredStudies.length}</strong> matching studies <span>·</span> Page 1 of 1</div>
      <div className="study-table-wrap">
        <table className="study-table">
          <thead><tr><th aria-label="Expand series" /><th>Patient</th><th>MRN</th><th>Study date</th><th>Description</th><th>Modality</th><th>Accession</th><th>Instances</th></tr></thead>
          <tbody>
            {filteredStudies.map(study => {
              const expanded = expandedStudyUID === study.studyInstanceUID;
              return (
                <FragmentRow key={study.studyInstanceUID}>
                  <tr className={openStudyUIDs.has(study.studyInstanceUID) ? 'study-row open' : 'study-row'} onDoubleClick={() => onOpenStudy(study)}>
                    <td><button className="expand-button" type="button" aria-expanded={expanded} aria-label={`Inspect ${study.description} series`} onClick={() => setExpandedStudyUID(expanded ? null : study.studyInstanceUID)}>›</button></td>
                    <td><button className="patient-link" type="button" onClick={() => onOpenStudy(study)}>{formatPatientName(study.patientName)}</button></td>
                    <td>{study.patientId}</td>
                    <td>{formatDate(study.studyDate)}<small>{formatTime(study.studyTime)}</small></td>
                    <td>{study.description}</td>
                    <td><span className={`modality ${study.modality.toLowerCase()}`}>{study.modality}</span></td>
                    <td>{study.accessionNumber}</td>
                    <td>{study.numberOfStudyRelatedInstances}</td>
                  </tr>
                  {expanded && (
                    <tr className="series-row"><td /><td colSpan={7}><div className="series-preview"><SyntheticImage study={study} compact /><div><strong>Series 1 · {study.seriesDescription}</strong><span>{study.modality} · {study.slices} images · {study.bodyPart}</span></div><button type="button" onClick={() => onOpenStudy(study)}>Open study</button></div></td></tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
