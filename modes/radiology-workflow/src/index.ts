import { ToolbarService } from '@ohif/core';
import {
  basicLayout,
  basicRoute,
  extensionDependencies as basicExtensionDependencies,
  initToolGroups,
  mode as basicMode,
  modeInstance as basicModeInstance,
  ohif,
  onModeEnter as basicOnModeEnter,
  toolbarButtons as basicToolbarButtons,
  toolbarSections as basicToolbarSections,
} from '@ohif/mode-basic';

import { id } from './id';
import modeToolbarButtons from './toolbarButtons';

const { TOOLBAR_SECTIONS } = ToolbarService;

export const radiologyWorkflow = {
  viewport: 'ohif-extension-radiology-workflow.viewportModule.radiology',
};

export const extensionDependencies = {
  ...basicExtensionDependencies,
  'ohif-extension-radiology-workflow': '^1.0.0',
};

export const toolbarButtons = [...basicToolbarButtons, ...modeToolbarButtons];

/**
 * The row a reading room actually wants in front of it.
 *
 * It is long on purpose. A radiologist reading all day reaches for the same
 * twenty things and wants them under the pointer, not two clicks down a menu;
 * hiding tools behind groups suits somebody opening the viewer once a month,
 * which is not who this is for. What is grouped is grouped because the members
 * are alternatives to each other: measurements, and the transforms.
 *
 * The order is the order of the work. Measure and move first, because that is
 * most of it. Then the window, then what is on screen and how it is reformatted.
 * Then the tools that hold viewports together, then what gets kept.
 */
export const toolbarSections = {
  ...basicToolbarSections,

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

/**
 * The layout is the basic one with our viewport put in front of Cornerstone's
 * for ordinary images. Ours wraps Cornerstone's, so nothing is lost by taking
 * precedence; the other viewports, for reports, video and segmentations, are
 * left exactly as they were.
 */
export const layoutInstance = {
  ...basicLayout,
  props: {
    ...basicLayout.props,
    viewports: [
      {
        namespace: radiologyWorkflow.viewport,
        displaySetsToDisplay: basicLayout.props.viewports[0].displaySetsToDisplay,
      },
      ...basicLayout.props.viewports,
    ],
  },
};

export const route = {
  ...basicRoute,
  path: 'radiology',
  layoutInstance,
};

/**
 * Reference cursors and the scale overlay ship with Cornerstone but are not
 * registered by OHIF, so they belong to no tool group and a button for either
 * would do nothing. The extension registers the tools; this puts them in the
 * group the viewports use, after the stock groups have been built.
 */
export function onModeEnter(props: withAppTypes) {
  basicOnModeEnter.call(this, props);

  const { toolGroupService } = props.servicesManager.services;
  // The scale starts off: a ruler down every image is useful when asked for and
  // clutter when not.
  toolGroupService.addToolsToToolGroup('default', {
    passive: [{ toolName: 'ReferenceCursors' }],
    disabled: [{ toolName: 'ScaleOverlay' }],
  });
}

export const modeInstance = {
  ...basicModeInstance,
  id,
  routeName: 'radiology',
  displayName: 'Radiology Workflow',
  routes: [route],
  extensions: extensionDependencies,
  toolbarButtons,
  toolbarSections,
  onModeEnter,
};

const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

export default mode;
export { initToolGroups, ohif };
