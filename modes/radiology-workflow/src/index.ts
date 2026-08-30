import {
  basicLayout,
  basicRoute,
  extensionDependencies as basicExtensionDependencies,
  mode as basicMode,
  modeInstance as basicModeInstance,
  ohif,
} from '@ohif/mode-basic';

import { id } from './id';

export const radiologyWorkflow = {
  viewport: 'ohif-extension-radiology-workflow.viewportModule.radiology',
};

export const extensionDependencies = {
  ...basicExtensionDependencies,
  'ohif-extension-radiology-workflow': '^1.0.0',
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
  // The study list offers one button per mode and labels it with this. It says
  // what pressing it does, rather than naming a mode the reader has no reason
  // to choose between, because this is the only one offered.
  displayName: 'Open study',
  routes: [route],
  extensions: extensionDependencies,

  // The toolbar is composed rather than restated: the viewer's own buttons and
  // layout, then this project's pack on top. A later pack wins per key, so the
  // primary row and the groups this project defines replace the stock ones
  // while every button the viewer supplies stays available.
  toolbarButtons: [
    { $reference: 'cornerstone.toolbarButtons' },
    { $reference: 'radiologyWorkflow.toolbarButtons' },
  ],
  toolbarSections: [
    { $reference: 'cornerstone.toolbarSections' },
    { $reference: 'radiologyWorkflow.toolbarSections' },
  ],

  // Reference cursors and the scale overlay ship with Cornerstone and are not
  // registered by the viewer, so they belong to no tool group and a button for
  // either would do nothing. The extension registers the tools; this puts them
  // in the group the viewports use. The scale starts off: a ruler down every
  // image is useful when asked for and clutter when not.
  toolGroupAdditions: {
    ...basicModeInstance.toolGroupAdditions,
    default: [
      {
        passive: [{ toolName: 'ReferenceCursors' }],
        disabled: [{ toolName: 'ScaleOverlay' }],
      },
    ],
  },
};

const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

export default mode;
export { ohif };
