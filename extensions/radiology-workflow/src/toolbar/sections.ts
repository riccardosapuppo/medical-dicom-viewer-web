import { ToolbarService } from '@ohif/core';

const { TOOLBAR_SECTIONS } = ToolbarService;

/**
 * The row a reading room wants in front of it.
 *
 * An earlier version put twenty-four entries in the row, on the reasoning that
 * a reader wants everything under the pointer. Thirty buttons reached the right
 * edge of a 1600 pixel screen and, worse, became unreadable: a group shows the
 * icon of whichever member was last used, so the measurement group appeared as
 * a ruler and the overflow group as an angle, and both looked like loose tools
 * that had escaped from somewhere.
 *
 * What is in the row now is what gets reached for constantly and is one thing.
 * What is grouped is grouped because its members are alternatives to one
 * another, so the icon standing for a group is always a fair summary of it.
 *
 * The order is the order of the work. Measure and move, then the window, then
 * what is on screen and how it is reformatted, then holding viewports together,
 * then what gets kept.
 */
const sections = {
  [TOOLBAR_SECTIONS.primary]: [
    'MeasurementTools',
    'Pan',
    'Zoom',
    'StackScroll',
    'WindowLevel',
    'TransformTools',
    'Layout',
    'LayoutMPR',
    'Montage',
    'Stacks',
    'Compare',
    'Display',
    'Capture',
    'MoreTools',
  ],

  // Everything that puts a number on the image. Angle, Cobb angle, the probe
  // and the calibration line were loose in the row and belong here: they are
  // measurements, and a reader reaching for one is choosing between them.
  MeasurementTools: [
    'Length',
    'Bidirectional',
    'ArrowAnnotate',
    'EllipticalROI',
    'RectangleROI',
    'CircleROI',
    'PlanarFreehandROI',
    'SplineROI',
    'LivewireContour',
    'Angle',
    'CobbAngle',
    'Probe',
    'CalibrationLine',
  ],

  // Rotating, flipping and inverting: alternatives to one another, reached
  // occasionally, one entry rather than six.
  TransformTools: [
    'rotate-right',
    'rotate-left',
    'flipHorizontal',
    'flipVertical',
    'invert',
    'Reset',
  ],

  // Holding several viewports to the same place, which is most of what reading
  // a multi-series study consists of.
  Compare: ['Crosshairs', 'ReferenceCursors', 'ImageSliceSync', 'ReferenceLines'],

  // What is drawn over the image, rather than what is done to it. The scale
  // leads it: a group wears the icon of its last used member, and a magnifier
  // as the group's face reads as a second zoom beside the real one.
  Display: [
    'ScaleOverlay',
    'StudyInformation',
    'Magnify',
    'AdvancedMagnify',
    'WindowLevelRegion',
    'ImageOverlayViewer',
  ],

  MoreTools: ['Cine', 'TrackballRotate', 'LayoutPresets', 'TagBrowser', 'SegmentLabelTool'],
};

export default sections;
