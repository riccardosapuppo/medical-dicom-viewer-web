import type { Modality, Study } from '../../../src/domain/study';

export interface WorklistFilters {
  patient: string;
  patientId: string;
  accessionNumber: string;
  description: string;
  modalities: Modality[];
  dateFrom: string;
  dateTo: string;
}

export const emptyFilters: WorklistFilters = {
  patient: '',
  patientId: '',
  accessionNumber: '',
  description: '',
  modalities: [],
  dateFrom: '',
  dateTo: '',
};

function contains(value: string, search: string) {
  return value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
}

export function filterStudies(studies: Study[], filters: WorklistFilters) {
  return studies.filter(study => {
    if (filters.patient && !contains(study.patientName.replace('^', ' '), filters.patient)) return false;
    if (filters.patientId && !contains(study.patientId, filters.patientId)) return false;
    if (filters.accessionNumber && !contains(study.accessionNumber, filters.accessionNumber)) return false;
    if (filters.description && !contains(study.description, filters.description)) return false;
    if (filters.modalities.length && !filters.modalities.includes(study.modality)) return false;
    if (filters.dateFrom && study.studyDate < filters.dateFrom.replaceAll('-', '')) return false;
    if (filters.dateTo && study.studyDate > filters.dateTo.replaceAll('-', '')) return false;
    return true;
  });
}

export function setDatePreset(filters: WorklistFilters, preset: 'today' | 'yesterday' | 'week' | 'all', today = new Date()) {
  if (preset === 'all') return { ...filters, dateFrom: '', dateTo: '' };
  const end = new Date(today);
  if (preset === 'yesterday') end.setDate(end.getDate() - 1);
  const start = new Date(end);
  if (preset === 'week') start.setDate(start.getDate() - 6);
  const toDateInput = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  return { ...filters, dateFrom: toDateInput(start), dateTo: toDateInput(end) };
}
