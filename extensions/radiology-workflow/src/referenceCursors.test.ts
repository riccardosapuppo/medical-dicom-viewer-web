import { handleReferenceCursorMove } from './referenceCursors';

describe('reference cursor interaction', () => {
  it('shows the cursor on hover without synchronizing slices', () => {
    expect(handleReferenceCursorMove({ x: 25, y: 60, primaryButtonDown: false, closestSliceIndex: 8 })).toEqual({ cursor: { x: 25, y: 60, dragging: false } });
  });

  it('synchronizes the closest slice only while dragging', () => {
    expect(handleReferenceCursorMove({ x: 25, y: 60, primaryButtonDown: true, closestSliceIndex: 8 })).toEqual({ cursor: { x: 25, y: 60, dragging: true }, synchronizeSliceIndex: 8 });
  });
});

