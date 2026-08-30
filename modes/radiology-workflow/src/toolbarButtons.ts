import type { Button } from '@ohif/core/types';

/**
 * Buttons this mode adds on top of the ones OHIF already defines. Everything
 * else in the toolbar is stock: reusing OHIF's buttons is what keeps their
 * behaviour, their icons and their disabled states consistent with the rest of
 * the viewer.
 */
const toolbarButtons: Button[] = [
  {
    id: 'Montage',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'layout-common-2x3',
      label: 'Montage',
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
];

export default toolbarButtons;
