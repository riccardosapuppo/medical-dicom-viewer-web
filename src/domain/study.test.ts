import { syntheticStudies } from '../data/studies';
import { isUid225 } from './study';

describe('synthetic study catalog', () => {
  it('contains a realistic CT and MR worklist', () => {
    expect(syntheticStudies).toHaveLength(18);
    expect(new Set(syntheticStudies.map(study => study.modality))).toEqual(new Set(['CT', 'MR']));
    expect(syntheticStudies.every(study => study.patientName.startsWith('SYNTHETIC^'))).toBe(true);
  });

  it('uses unique deterministic 2.25 UIDs for every study, series and instance', () => {
    const uids = syntheticStudies.flatMap(study => [study.studyInstanceUID, study.seriesInstanceUID, ...study.sopInstanceUIDs]);

    expect(uids.every(isUid225)).toBe(true);
    expect(new Set(uids).size).toBe(uids.length);
  });
});

