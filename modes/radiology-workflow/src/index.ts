import { ToolbarService } from '@ohif/core';
import {
  basicLayout,
  basicRoute,
  extensionDependencies as basicExtensionDependencies,
  initToolGroups,
  mode as basicMode,
  modeInstance as basicModeInstance,
  ohif,
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
 * The order of the primary row follows the way a study is actually read:
 * measure, navigate, set the window, arrange the screen, then the montage for
 * an overview, then the tools that keep several viewports in step. Everything
 * that is reached occasionally sits under More, so the row stays short enough
 * to be read at a glance.
 */
export const toolbarSections = {
  ...basicToolbarSections,

  [TOOLBAR_SECTIONS.primary]: [
    'Navigate',
    'WindowLevel',
    'MeasurementTools',
    'Compare',
    'Arrange',
    'Capture',
    'MoreTools',
  ],

  // Moving through the study.
  Navigate: ['StackScroll', 'Pan', 'Zoom', 'Magnify'],

  // Holding two viewports to the same place, which is most of what reading a
  // multi-series study consists of.
  Compare: ['Crosshairs', 'ImageSliceSync', 'ReferenceLines'],

  // Deciding what is on screen, and getting back out of a layout that is not
  // what was wanted.
  Arrange: ['Layout', 'LayoutPresets', 'Montage', 'Stacks'],

  MoreTools: [
    'Reset',
    'rotate-right',
    'flipHorizontal',
    'invert',
    'Probe',
    'Cine',
    'Angle',
    'CobbAngle',
    'AdvancedMagnify',
    'CalibrationLine',
    'WindowLevelRegion',
    'ImageOverlayViewer',
    'TagBrowser',
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

export const modeInstance = {
  ...basicModeInstance,
  id,
  routeName: 'radiology',
  displayName: 'Radiology Workflow',
  routes: [route],
  extensions: extensionDependencies,
  toolbarButtons,
  toolbarSections,
};

const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

export default mode;
export { initToolGroups, ohif };
