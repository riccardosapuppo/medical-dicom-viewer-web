import { describe, expect, it } from 'vitest';
import { cornerstoneToolNames, isCornerstonePrimaryTool, toolbarGroups } from './cornerstoneTools';

describe('Cornerstone tool configuration', () => {
  it('maps every implemented standard tool to a Cornerstone tool name', () => {
    expect(cornerstoneToolNames).toEqual({
      length: 'Length',
      magnify: 'Magnify',
      pan: 'Pan',
      polygon: 'PlanarFreehandROI',
      scroll: 'StackScroll',
      window: 'WindowLevel',
      zoom: 'Zoom',
      probe: 'Probe',
      rectangle: 'RectangleROI',
    });
  });

  it('keeps the custom reference cursor outside the standard tool group', () => {
    expect(isCornerstonePrimaryTool('reference')).toBe(false);
    expect(toolbarGroups.flatMap(group => group.tools)).toContain('reference');
  });
});
