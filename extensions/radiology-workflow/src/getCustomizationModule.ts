import buttons from './toolbar/buttons';
import sections from './toolbar/sections';

/**
 * The toolbar this extension makes available.
 *
 * The viewer registers its own buttons and layout as named packs, and a mode
 * composes the packs it wants by reference. Publishing ours the same way means
 * the mode says which toolbar it uses rather than restating it, and anything
 * else that wants these buttons can have them without depending on the mode.
 */
export default function getCustomizationModule() {
  return [
    {
      name: 'default',
      value: {
        'radiologyWorkflow.toolbarButtons': buttons,
        'radiologyWorkflow.toolbarSections': sections,
      },
    },
  ];
}
