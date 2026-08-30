import LayoutPresetModal from './layouts/LayoutPresetModal';
import type MontageService from './services/MontageService';

/**
 * Commands the toolbar and the keyboard bind to. They all act on the viewport
 * the reader is in, which is the one the grid reports as active, so the same
 * button works whichever cell of a multi-viewport layout has focus.
 */
export default function getCommandsModule({ servicesManager }: withAppTypes) {
  const { montageService, viewportGridService, displaySetService, uiModalService } =
    servicesManager.services as {
      montageService: MontageService;
      viewportGridService: AppTypes.ViewportGridService;
      displaySetService: AppTypes.DisplaySetService;
      uiModalService: AppTypes.UIModalService;
    };

  /** How many instances the active viewport is showing, for paging limits. */
  const frameCountOfActiveViewport = (viewportId: string): number => {
    const { viewports } = viewportGridService.getState();
    const uid = viewports.get(viewportId)?.displaySetInstanceUIDs?.[0];
    if (!uid) {
      return 0;
    }
    return displaySetService.getDisplaySetByUID(uid)?.images?.length ?? 0;
  };

  const active = () => viewportGridService.getActiveViewportId();

  const actions = {
    toggleMontage: () => {
      montageService.toggle(active());
    },

    showMontage: () => {
      montageService.setEnabled(active(), true);
    },

    hideMontage: () => {
      montageService.setEnabled(active(), false);
    },

    cycleMontageGrid: () => {
      const viewportId = active();
      if (!montageService.isEnabled(viewportId)) {
        montageService.setEnabled(viewportId, true);
        return;
      }
      montageService.nextGrid(viewportId);
    },

    nextMontagePage: () => {
      const viewportId = active();
      montageService.movePage(viewportId, 1, frameCountOfActiveViewport(viewportId));
    },

    showLayoutPresets: () => {
      uiModalService.show({
        content: LayoutPresetModal,
        title: 'Saved arrangements',
        containerClassName: 'max-w-lg p-4',
      });
    },

    previousMontagePage: () => {
      const viewportId = active();
      montageService.movePage(viewportId, -1, frameCountOfActiveViewport(viewportId));
    },
  };

  const definitions = Object.fromEntries(
    Object.entries(actions).map(([commandName, commandFn]) => [
      commandName,
      { commandFn, storeContexts: [] },
    ])
  );

  return { actions, definitions, defaultContext: 'CORNERSTONE' };
}
