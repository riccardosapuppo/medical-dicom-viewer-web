import { syntheticStudies } from '../../../src/data/studies';
import { annotationLength, captureKeyImage } from './keyImages';

describe('key image capture', () => {
  it('keeps DICOM references and a detached annotation snapshot', () => {
    const annotation = { start: { x: 0.1, y: 0.2 }, end: { x: 0.4, y: 0.6 }, label: '50 px' };
    const image = captureKeyImage(syntheticStudies[0], 3, annotation, '2026-08-29T10:00:00Z');
    annotation.label = 'changed';

    expect(image).toMatchObject({ sopInstanceUID: syntheticStudies[0].sopInstanceUIDs[3], instanceNumber: 4, annotation: { label: '50 px' } });
  });

  it('measures normalized annotations against the viewport size', () => {
    const length = annotationLength({ start: { x: 0, y: 0 }, end: { x: 0.3, y: 0.4 }, label: '' }, 100, 100);
    expect(length).toBe(50);
  });
});

