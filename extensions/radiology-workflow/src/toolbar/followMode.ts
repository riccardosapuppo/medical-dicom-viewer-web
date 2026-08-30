import { ToolbarService } from '@ohif/core';

import { readingRow, reformattingRow } from './sections';

const { TOOLBAR_SECTIONS } = ToolbarService;

/**
 * Keeps the toolbar in step with what the viewports are showing.
 *
 * Some tools only mean something once a study is being reformatted: crosshairs
 * act on the reformatting tool group, and trackball rotation needs a volume to
 * turn. Leaving them in the row the rest of the time gives the reader two
 * buttons that look available and do nothing, and hiding them behind a disabled
 * state is barely better — it still asks them to work out why.
 *
 * So the row follows the mode. Entering a reformatted arrangement brings them
 * in; going back to slices takes them out again.
 */
export default function followMode(servicesManager: AppTypes.ServicesManager): {
  unsubscribe: () => void;
} {
  const { hangingProtocolService, toolbarService } = servicesManager.services;

  const apply = () => {
    const active = hangingProtocolService?.getActiveProtocol?.()?.protocol?.id;

    // 'default' is the plain stack layout; any other protocol reformats.
    const reformatting = Boolean(active) && active !== 'default';

    toolbarService.updateSection(
      TOOLBAR_SECTIONS.primary,
      reformatting ? reformattingRow : readingRow
    );
  };

  apply();

  const subscriptions = [
    hangingProtocolService.subscribe(hangingProtocolService.EVENTS.PROTOCOL_CHANGED, apply),
    hangingProtocolService.subscribe(hangingProtocolService.EVENTS.PROTOCOL_RESTORED, apply),
  ];

  return {
    unsubscribe: () => subscriptions.forEach(subscription => subscription.unsubscribe()),
  };
}
