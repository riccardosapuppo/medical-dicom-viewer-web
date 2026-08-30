export type PrimaryViewerTool =
  | 'length'
  | 'magnify'
  | 'pan'
  | 'polygon'
  | 'scroll'
  | 'reference'
  | 'window'
  | 'zoom'
  | 'probe'
  | 'rectangle';

export const cornerstoneToolNames: Record<Exclude<PrimaryViewerTool, 'reference'>, string> = {
  length: 'Length',
  magnify: 'Magnify',
  pan: 'Pan',
  polygon: 'PlanarFreehandROI',
  scroll: 'StackScroll',
  window: 'WindowLevel',
  zoom: 'Zoom',
  probe: 'Probe',
  rectangle: 'RectangleROI',
};

export const toolbarGroups = [
  {
    id: 'measurements',
    label: 'Measurements',
    tools: ['length', 'probe', 'rectangle', 'polygon'] as const,
  },
  {
    id: 'navigation',
    label: 'Navigation',
    tools: ['pan', 'scroll', 'reference', 'window', 'zoom', 'magnify'] as const,
  },
] as const;

export function isCornerstonePrimaryTool(tool: PrimaryViewerTool): tool is Exclude<PrimaryViewerTool, 'reference'> {
  return tool !== 'reference';
}
