import { utils } from '@ohif/ui-next';

import type MontageService from './services/MontageService';

/**
 * Tells the toolbar whether the montage button should look pressed, and on
 * which viewports it means anything at all. A montage is a way of looking at a
 * series of images, so it is offered only where there is a stack to lay out.
 */
export default function getToolbarModule({ servicesManager }: withAppTypes) {
  const { montageService, viewportGridService, displaySetService } = servicesManager.services as {
    montageService: MontageService;
    viewportGridService: AppTypes.ViewportGridService;
    displaySetService: AppTypes.DisplaySetService;
  };

  return [
    {
      name: 'evaluate.montage',
      evaluate: ({ viewportId }: { viewportId: string }) => {
        const uid = viewportGridService
          .getState()
          .viewports.get(viewportId)?.displaySetInstanceUIDs?.[0];
        const frameCount = uid
          ? (displaySetService.getDisplaySetByUID(uid)?.images?.length ?? 0)
          : 0;

        if (frameCount < 2) {
          return {
            disabled: true,
            disabledText: 'The montage needs a series of more than one image',
          };
        }

        const enabled = montageService.isEnabled(viewportId);
        return {
          className: utils.getToggledClassName(enabled),
          isActive: enabled,
        };
      },
    },
  ];
}
