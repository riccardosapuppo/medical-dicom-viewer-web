import { captureRelativeFraming, restoreRelativeFraming } from './relativeFraming';

describe('relative viewport framing', () => {
  it('preserves zoom and relative pan after a viewport resize', () => {
    const captured = captureRelativeFraming({ scale: 1.75, translationX: 80, translationY: -40 }, 800, 600);
    const restored = restoreRelativeFraming(captured, 400, 300);

    expect(restored).toEqual({ scale: 1.75, translationX: 40, translationY: -20 });
  });
});

