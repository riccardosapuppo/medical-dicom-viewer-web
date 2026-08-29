import { syntheticStudies } from './syntheticStudies';
import { emptyFilters, filterStudies, setDatePreset } from './worklistFilters';

describe('worklist filtering', () => {
  it('combines patient, modality, date and description filters', () => {
    const result = filterStudies(syntheticStudies, {
      ...emptyFilters,
      patient: 'Aurora',
      modalities: ['CT'],
      description: 'head',
      dateFrom: '2026-08-29',
      dateTo: '2026-08-29',
    });

    expect(result.map(study => study.patientId)).toEqual(['SYN-0001']);
  });

  it('builds quick date ranges without changing the other filters', () => {
    const filters = setDatePreset({ ...emptyFilters, patient: 'Synthetic' }, 'week', new Date(2026, 7, 29));

    expect(filters).toMatchObject({ patient: 'Synthetic', dateFrom: '2026-08-23', dateTo: '2026-08-29' });
  });
});
