import { ToolbarService } from '@ohif/core';

const { TOOLBAR_SECTIONS } = ToolbarService;

/**
 * The row a reading room actually wants in front of it.
 *
 * It is long on purpose. A radiologist reading all day reaches for the same
 * twenty things and wants them under the pointer, not two clicks down a menu;
 * hiding tools behind groups suits somebody opening a viewer once a month,
 * which is not who this is for. What is grouped is grouped because the members
 * are alternatives to one another: the measurements, and the transforms.
 *
 * The order is the order of the work. Measure and move first, because that is
 * most of it. Then the window, then what is on screen and how it is reformatted,
 * then the tools that hold viewports together, then what gets kept.
 *
 * This replaces the sections the viewer supplies rather than adding to them:
 * the mode lists this pack after the stock one, and a later pack wins per key.
 */
const sections = {
  [TOOLBAR_SECTIONS.primary]: [
    'MeasurementTools',
    'Pan',
    'Zoom',
    'StackScroll',
    'WindowLevel',
    'Magnify',
    'TransformTools',
    'invert',
    'Layout',
    'LayoutMPR',
    'Montage',
    'Stacks',
    'LayoutPresets',
    'Crosshairs',
    'ReferenceCursors',
    'ImageSliceSync',
    'ReferenceLines',
    'ScaleOverlay',
    'TrackballRotate',
    'Probe',
    'Cine',
    'StudyInformation',
    'Capture',
    'MoreTools',
  ],

  // Rotating and flipping are alternatives to one another and are reached
  // occasionally, so they are one entry rather than four.
  TransformTools: ['rotate-right', 'rotate-left', 'flipHorizontal', 'flipVertical', 'Reset'],

  MoreTools: [
    'Angle',
    'CobbAngle',
    'AdvancedMagnify',
    'CalibrationLine',
    'WindowLevelRegion',
    'ImageOverlayViewer',
    'TagBrowser',
    'SegmentLabelTool',
  ],
};

export default sections;
