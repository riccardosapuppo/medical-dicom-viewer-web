import { ToolbarService } from '@ohif/core';

const { TOOLBAR_SECTIONS } = ToolbarService;

/**
 * The row while reading a stack, which is nearly all of the time.
 *
 * What is here is reached for constantly and is one thing. What is grouped is
 * grouped because its members are alternatives to one another, so the icon
 * standing for a group — always its active member, else its first — is a fair
 * summary of it. There is no overflow group: a button labelled "more" that
 * wears the icon of whatever happens to be first in it tells the reader
 * nothing, and everything worth having fits without one.
 */
export const readingRow = [
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
  'LayoutPresets',
  'Capture',
];

/**
 * The row once the study is being reformatted.
 *
 * Crosshairs act on the reformatting tool group and mean nothing on a stack;
 * trackball rotation means nothing until there is a volume to rotate. They
 * appear when they start working and not before, which is the same idea as the
 * layout selector growing its extra entries at that moment.
 */
export const reformattingRow = [
  'MeasurementTools',
  'Pan',
  'Zoom',
  'WindowLevel',
  'TransformTools',
  'Layout',
  'LayoutMPR',
  'Stacks',
  'Crosshairs',
  'TrackballRotate',
  'Compare',
  'Display',
  'LayoutPresets',
  'Capture',
];

const sections = {
  [TOOLBAR_SECTIONS.primary]: readingRow,

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
  // a multi-series study consists of. Crosshairs are not here: they belong to
  // the reformatting row, where they work.
  Compare: ['ReferenceCursors', 'ImageSliceSync', 'ReferenceLines'],

  /**
   * What is drawn over the image, rather than what is done to it.
   *
   * The study text leads it. A group wears its first member's icon, and both of
   * the obvious alternatives collide with something already in the row: the
   * scale is a ruler, which is what the measurement group wears, and the
   * magnifier reads as a second zoom beside the real one.
   */
  Display: [
    'StudyInformation',
    'ScaleOverlay',
    'Magnify',
    'AdvancedMagnify',
    'WindowLevelRegion',
    'ImageOverlayViewer',
    'Cine',
    'TagBrowser',
  ],

  // Nothing in the corner of the viewport. The stock arrangement puts an
  // orientation menu and a data overlay menu there, both of which offer axial,
  // sagittal, coronal and fusion on a viewport that is showing a plain stack.
  // Choosing one asks the graphics context to reformat, which is what the MPR
  // button is for and which fails outright where there is no such context.
  [TOOLBAR_SECTIONS.viewportActionMenu.topLeft]: [],
};

export default sections;
