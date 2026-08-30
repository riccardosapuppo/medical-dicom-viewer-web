import LayoutPresetModal from './layouts/LayoutPresetModal';
import { toggleStudyInformation } from './studyInformation';
import type MontageService from './services/MontageService';

/**
 * Commands the toolbar and the keyboard bind to. They all act on the viewport
 * the reader is in, which is the one the grid reports as active, so the same
 * button works whichever cell of a multi-viewport layout has focus.
 */
export default function getCommandsModule({ servicesManager }: withAppTypes) {
  const { montageService, viewportGridService, displaySetService, uiModalService, toolbarService } =
    servicesManager.services as {
      montageService: MontageService;
      viewportGridService: AppTypes.ViewportGridService;
      displaySetService: AppTypes.DisplaySetService;
      uiModalService: AppTypes.UIModalService;
      toolbarService: AppTypes.ToolbarService;
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

    /**
     * Puts every viewport back to a plain stack of the series it holds.
     *
     * The viewer remembers what was in each grid position, so returning from
     * an MPR layout to an ordinary grid brings the sagittal or the 3D view
     * back with it, in a viewport the reader expected to be showing slices as
     * acquired. This is the way out of that, in one action.
     */
    resetViewportsToStacks: async () => {
      const { viewports } = viewportGridService.getState();
      const updates = [];

      for (const [viewportId, viewport] of viewports) {
        const displaySetInstanceUIDs = viewport?.displaySetInstanceUIDs ?? [];
        if (displaySetInstanceUIDs.length === 0) {
          continue;
        }
        updates.push({
          viewportId,
          displaySetInstanceUIDs,
          viewportOptions: { viewportType: 'stack', orientation: 'acquisition' },
        });
      }

      if (updates.length > 0) {
        await viewportGridService.setDisplaySetsForViewports(updates);
      }
    },

    /** Hides or restores the text burned over every viewport at once. */
    toggleStudyInformation: () => {
      toggleStudyInformation();
      toolbarService.refreshToolbarState({ viewportId: viewportGridService.getActiveViewportId() });
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
