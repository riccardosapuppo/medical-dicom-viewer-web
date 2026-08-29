import { syntheticStudies } from './syntheticStudies';
import { applyHangingProtocol, applicableHangingProtocols, captureHangingProtocol, type ViewerPresentationState } from './hangingProtocols';

const presentation: ViewerPresentationState = {
  gridLayout: '1x2',
  montageLayout: '2x2',
  sliceIndex: 7,
  windowCenter: 40,
  windowWidth: 350,
  colormap: 'grayscale',
  framing: { fillRatio: 1.4, offsetXRatio: 0.1, offsetYRatio: -0.05 },
};

describe('captured hanging protocols', () => {
  it('ranks an exam description protocol above a modality protocol', () => {
    const study = syntheticStudies[0];
    const exact = captureHangingProtocol('exact', 'Head', 'studyDescription', study, presentation, '2026-08-29T10:00:00Z');
    const modality = captureHangingProtocol('ct', 'CT default', 'modality', study, presentation, '2026-08-29T11:00:00Z');

    expect(applicableHangingProtocols([modality, exact], study).map(result => result.protocol.id)).toEqual(['exact', 'ct']);
  });

  it('can apply only layout fields without changing presentation', () => {
    const protocol = captureHangingProtocol('saved', 'Saved', 'modality', syntheticStudies[0], presentation);
    const current: ViewerPresentationState = { ...presentation, gridLayout: '1x1', montageLayout: 'off', sliceIndex: 2, windowCenter: 90 };
    const applied = applyHangingProtocol(current, protocol, 'gridOnly');

    expect(applied).toMatchObject({ gridLayout: '1x2', montageLayout: '2x2', sliceIndex: 2, windowCenter: 90 });
  });
});
