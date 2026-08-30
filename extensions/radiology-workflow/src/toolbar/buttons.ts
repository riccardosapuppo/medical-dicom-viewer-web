import { ViewportGridService } from '@ohif/core';
import type { Button } from '@ohif/core/types';

/**
 * Buttons this mode adds on top of the ones OHIF already defines. Everything
 * else in the toolbar is stock: reusing OHIF's buttons keeps their behaviour,
 * their icons and their disabled states consistent with the rest of the viewer.
 */

/** Makes a tool the active one across every tool group a viewport might use. */
const setToolActive = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'SRToolGroup', 'volume3d'],
  },
};

/**
 * Overlays are enabled and disabled rather than made active, and have to be
 * re-evaluated when the reader moves to another viewport.
 */
const overlayListeners = (toolName: string) => ({
  [ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED]: [
    { commandName: 'setViewportForToolConfiguration', commandOptions: { toolName } },
  ],
  [ViewportGridService.EVENTS.VIEWPORTS_READY]: [
    { commandName: 'setViewportForToolConfiguration', commandOptions: { toolName } },
  ],
});

const toolbarButtons: Button[] = [
  // Rotating and flipping belong together and are reached occasionally, so they
  // are one entry in the row rather than four.
  { id: 'TransformTools', uiType: 'ohif.toolButtonList', props: { buttonSection: true } },

  {
    // MPR on its own icon rather than buried in the layout menu. Reformatting a
    // volume is something a reader reaches for constantly on a thin-slice study,
    // and it is one decision, not a choice of grid. Pressing it again returns
    // the study to the way it was laid out before.
    id: 'LayoutMPR',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-mpr',
      label: 'MPR',
      tooltip: 'Reformat this series in three planes',
      commands: [{ commandName: 'toggleHangingProtocol', commandOptions: { protocolId: 'mpr' } }],
      evaluate: {
        name: 'evaluate.displaySetIsReconstructable',
        disabledText: 'This series cannot be reformatted: its slices are not evenly spaced.',
      },
    },
  },

  {
    id: 'Stacks',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-stack-scroll',
      label: 'Back to slices',
      tooltip: 'Return every viewport to the slices as acquired',
      commands: 'resetViewportsToStacks',
      evaluate: 'evaluate.action',
    },
  },

  {
    id: 'Montage',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'layout-common-2x3',
      label: 'Subgrid',
      tooltip: 'Lay the series out as a sheet of frames',
      commands: 'toggleMontage',
      evaluate: 'evaluate.montage',
    },
  },

  {
    id: 'LayoutPresets',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-layout',
      label: 'Arrangements',
      tooltip: 'Save how this study is arranged, and apply it to the next one like it',
      commands: 'showLayoutPresets',
      evaluate: 'evaluate.action',
    },
  },

  {
    // Cornerstone ships this tool and OHIF never registers it, so no stock
    // toolbar can offer it. The extension registers it; this exposes it.
    id: 'ReferenceCursors',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-point',
      label: 'Reference cursors',
      tooltip: 'Show this pointer position in every viewport of the same anatomy',
      commands: setToolActive,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },

  {
    // Also shipped by Cornerstone and not registered by OHIF.
    id: 'ScaleOverlay',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-length',
      label: 'Scale',
      tooltip: 'Draw a ruler down the side of the image',
      commands: 'toggleEnabledDisabledToolbar',
      listeners: overlayListeners('ScaleOverlay'),
      evaluate: [
        'evaluate.cornerstoneTool.toggle',
        { name: 'evaluate.viewport.supported', unsupportedViewportTypes: ['video'] },
      ],
    },
  },

  {
    id: 'StudyInformation',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tab-patient-info',
      label: 'Study text',
      tooltip: 'Hide or show the text burned over every viewport',
      commands: 'toggleStudyInformation',
      evaluate: 'evaluate.studyInformation',
    },
  },

  {
    id: 'rotate-left',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rotate-right',
      label: 'Rotate left',
      tooltip: 'Rotate -90',
      commands: 'rotateViewportCCW',
      evaluate: [
        'evaluate.action',
        { name: 'evaluate.viewport.supported', unsupportedViewportTypes: ['video'] },
      ],
    },
  },

  {
    id: 'flipVertical',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: 'Flip vertical',
      tooltip: 'Flip vertically',
      commands: 'flipViewportVertical',
      evaluate: [
        'evaluate.action',
        { name: 'evaluate.viewport.supported', unsupportedViewportTypes: ['video'] },
      ],
    },
  },
];

export default toolbarButtons;
