import { id } from './id';
import getCommandsModule from './getCommandsModule';
import getToolbarModule from './getToolbarModule';
import getViewportModule from './getViewportModule';
import MontageService from './services/MontageService';

/** Held for the life of the mode, so leaving it does not leave listeners behind. */
const subscriptions: Array<{ unsubscribe: () => void }> = [];

/**
 * Reading-room additions for the OHIF Viewer.
 *
 * The extension deliberately owns as little as possible: image display,
 * measurement, window level and layout stay OHIF's. What is added here is the
 * handful of habits a reading room has that the stock viewer does not cover.
 */
const radiologyWorkflowExtension = {
  id,

  preRegistration: ({ servicesManager }: withAppTypes) => {
    servicesManager.registerService(MontageService.REGISTRATION);
  },

  onModeEnter: ({ servicesManager }: withAppTypes) => {
    const { montageService, toolbarService } = servicesManager.services as {
      montageService: MontageService;
      toolbarService: AppTypes.ToolbarService;
    };

    // The toolbar caches the result of each button's evaluator, so a button
    // that reflects state has to ask for a re-evaluation when that state moves.
    subscriptions.push(
      montageService.subscribe(
        MontageService.EVENTS.STATE_CHANGED,
        ({ viewportId }: { viewportId: string }) => {
          toolbarService.refreshToolbarState({ viewportId });
        }
      )
    );
  },

  onModeExit: ({ servicesManager }: withAppTypes) => {
    const { montageService } = servicesManager.services as { montageService: MontageService };
    subscriptions.splice(0).forEach(subscription => subscription.unsubscribe());
    montageService.onModeExit();
  },

  getViewportModule,
  getToolbarModule,
  getCommandsModule,
};

export default radiologyWorkflowExtension;
export { MontageService };
