import { getShouldUseCPURendering } from '@cornerstonejs/core';
import { utils } from '@ohif/ui-next';

import { isStudyInformationHidden } from './studyInformation';
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
      /**
       * Reformatting a volume is done by the graphics context. Where there is
       * none the viewer draws on the CPU, and pressing the button reaches a
       * library that asks for a 3D context, receives null, and throws. Saying
       * so on the button is the difference between a demonstration that
       * explains itself and one that appears broken.
       */
      name: 'evaluate.gpuRendering',
      evaluate: () =>
        getShouldUseCPURendering()
          ? {
              disabled: true,
              disabledText:
                'This session is drawing on the CPU, which cannot reformat a volume. It needs graphics acceleration in the browser.',
            }
          : undefined,
    },
    {
      // Pressed while the information is hidden, so the button says what the
      // viewports are currently doing rather than what pressing it would do.
      name: 'evaluate.studyInformation',
      evaluate: () => {
        const hidden = isStudyInformationHidden();
        return {
          className: utils.getToggledClassName(hidden),
          isActive: hidden,
        };
      },
    },
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
