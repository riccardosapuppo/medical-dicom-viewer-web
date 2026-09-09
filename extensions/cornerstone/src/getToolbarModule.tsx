import { Enums } from '@cornerstonejs/tools';
import { utils } from '@ohif/ui-next';

const getDisabledState = (disabledText?: string) => ({
  disabled: true,
  disabledText: disabledText ?? 'Not available in the active viewport',
});

export default function getToolbarModule({ commandsManager, servicesManager }: withAppTypes) {
  const {
    toolGroupService,
    toolbarService,
    syncGroupService,
    cornerstoneViewportService,
    hangingProtocolService,
    displaySetService,
    viewportGridService,
  } = servicesManager.services;

  // The subgrid (montage) only applies to 2D stack series with more than one image and a
  // supported modality: no volume, MPR, 3D or video, and no SEG, SR and the rest.
  const isMontageSuitable = (viewportId: string): boolean => {
    const csVp = cornerstoneViewportService?.getCornerstoneViewport(viewportId);
    if (csVp && csVp.type !== 'stack') {
      return false;
    }
    const dsUIDs = viewportGridService?.getDisplaySetsUIDsForViewport(viewportId);
    const ds: any = dsUIDs?.length ? displaySetService?.getDisplaySetByUID(dsUIDs[0]) : null;
    const imageCount = ds?.numImageFrames || ds?.instances?.length || ds?.images?.length || 0;
    const UNSUPPORTED = ['SEG', 'RTSTRUCT', 'RTPLAN', 'PR', 'SR', 'KO', 'SM'];
    return !!ds && imageCount >= 2 && !UNSUPPORTED.includes(ds.Modality);
  };

  return [
    // functions/helpers to be used by the toolbar buttons to decide if they should
    // enabled or not
    {
      name: 'evaluate.viewport.supported',
      evaluate: ({ viewportId, unsupportedViewportTypes, disabledText }) => {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

        if (viewport && unsupportedViewportTypes?.includes(viewport.type)) {
          return getDisabledState(disabledText);
        }

        return undefined;
      },
    },
    {
      // Returns `{ className: 'hidden' }` when the loaded study does not contain
      // at least one PT and one CT display set. Used to fully hide controls that
      // only make sense for PET/CT fusion workflows. When both modalities are
      // present, also reports `isActive` based on whether the PT/CT layout is
      // currently applied (body class `hp-ptct-active`).
      name: 'evaluate.hasPTAndCT',
      evaluate: () => {
        const displaySets = displaySetService!.getActiveDisplaySets() || [];
        const modalities = new Set(displaySets.map((ds: any) => ds?.Modality));
        if (modalities.has('PT') && modalities.has('CT')) {
          return { isActive: document.body.classList.contains('hp-ptct-active') };
        }
        return { className: 'hidden', disabled: true };
      },
    },
    {
      name: 'evaluate.modality.supported',
      evaluate: ({ viewportId, unsupportedModalities, supportedModalities, disabledText }) => {
        const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewportId);

        if (!displaySetUIDs?.length) {
          return;
        }

        const displaySets = displaySetUIDs.map(displaySetService.getDisplaySetByUID);

        // Check for unsupported modalities (exclusion)
        if (unsupportedModalities?.length) {
          const hasUnsupportedModality = displaySets.some(displaySet =>
            unsupportedModalities.includes(displaySet?.Modality)
          );

          if (hasUnsupportedModality) {
            return getDisabledState(disabledText);
          }
        }

        // Check for supported modalities (inclusion)
        if (supportedModalities?.length) {
          const hasAnySupportedModality = displaySets.some(displaySet =>
            supportedModalities.includes(displaySet?.Modality)
          );

          if (!hasAnySupportedModality) {
            return getDisabledState(disabledText || 'Tool not available for this modality');
          }
        }
      },
    },
    {
      name: 'evaluate.cornerstoneTool',
      evaluate: ({ viewportId, button, toolNames, disabledText }) => {
        const toolGroup = toolGroupService.getToolGroupForViewport(viewportId);

        if (!toolGroup) {
          return;
        }

        const toolName = toolbarService.getToolNameForButton(button);

        if (
          (toolName === 'Crosshairs' &&
            document.body.classList.contains('priors-injected-iframe')) ||
          (toolName === 'TrackballRotate' &&
            document.body.classList.contains('priors-injected-iframe'))
        ) {
          return {
            disabled: false,
            className:
              '!text-common-bright hover:!bg-primary-dark hover:!text-primary-light rounded',
          };
        }

        if (!toolGroup || (!toolGroup.hasTool(toolName) && !toolNames)) {
          return getDisabledState(disabledText);
        }

        const isPrimaryActive = toolNames
          ? toolNames.includes(toolGroup.getActivePrimaryMouseButtonTool())
          : toolGroup.getActivePrimaryMouseButtonTool() === toolName;

        return {
          disabled: false,
          isActive: isPrimaryActive,
        };
      },
    },
    {
      name: 'evaluate.action',
      evaluate: () => {
        return {
          disabled: false,
        };
      },
    },
    {
      // On or off according to the class on the page's body.
      //
      // The button that hides the data drawn over the images was declared a toggle but
      // evaluated with evaluate.action, which only ever answers "not disabled": pressing
      // it made the text vanish while the button stayed identical, so there was no way
      // to know which state you were in except by looking at the images.
      //
      // The real state is the class the command adds and removes, so that is what is read.
      name: 'evaluate.classeSulCorpo',
      evaluate: ({ button }) => {
        const classe = button?.commandOptions?.classe ?? 'hide-info-dicom';
        return {
          className: utils.getToggledClassName(document.body.classList.contains(classe)),
        };
      },
    },
    {
      // Disables a button when the active viewport is in subgrid (montage) mode. Used for
      // the tools a montage cannot take, cine among them.
      name: 'evaluate.cornerstone.disabledInMontage',
      evaluate: ({ viewportId, disabledText }) => {
        const vp = viewportGridService.getState().viewports.get(viewportId);
        if (vp?.viewportOptions?.montage?.enabled === true) {
          return getDisabledState(disabledText ?? 'Not available inside the subgrid');
        }
        return undefined;
      },
    },
    {
      // The subgrid's primary button: highlighted when it is on, where a click turns it
      // off, and enabled only when the active series is suitable.
      name: 'evaluate.cornerstone.montage',
      evaluate: ({ viewportId, disabledText }) => {
        const vp = viewportGridService.getState().viewports.get(viewportId);
        const isActive = vp?.viewportOptions?.montage?.enabled === true;
        if (isActive) {
          return { isActive: true, className: utils.getToggledClassName(true) };
        }
        if (!isMontageSuitable(viewportId)) {
          return getDisabledState(disabledText ?? 'The subgrid is not available for this series');
        }
        return { isActive: false };
      },
    },
    {
      // For the layout entries in the subgrid menu: enabled when the montage is already
      // on, so the layout can be changed, or when the active series is suitable.
      name: 'evaluate.cornerstone.montageAvailable',
      evaluate: ({ viewportId, disabledText }) => {
        const vp = viewportGridService.getState().viewports.get(viewportId);
        if (vp?.viewportOptions?.montage?.enabled === true) {
          return undefined;
        }
        if (!isMontageSuitable(viewportId)) {
          return getDisabledState(disabledText ?? 'The subgrid is not available for this series');
        }
        return undefined;
      },
    },
    {
      name: 'evaluate.cornerstoneTool.toggle.ifStrictlyDisabled',
      evaluate: ({ viewportId, button, disabledText }) =>
        _evaluateToggle({
          viewportId,
          button,
          toolbarService,
          disabledText,
          offModes: [Enums.ToolModes.Disabled],
          toolGroupService,
        }),
    },
    {
      name: 'evaluate.cornerstoneTool.toggle',
      evaluate: ({ viewportId, button, disabledText }) =>
        _evaluateToggle({
          viewportId,
          button,
          toolbarService,
          disabledText,
          offModes: [Enums.ToolModes.Disabled, Enums.ToolModes.Passive],
          toolGroupService,
        }),
    },
    {
      name: 'evaluate.cornerstone.synchronizer',
      evaluate: ({ viewportId, button }) => {
        const buttonCommands = button.commands ?? button.props?.commands;
        const isArray = Array.isArray(buttonCommands);

        const synchronizerType = isArray
          ? buttonCommands?.[0]?.commandOptions?.type
          : buttonCommands?.commandOptions?.type;

        const synchronizersByType = syncGroupService.getSynchronizersOfType(synchronizerType);

        if (!synchronizersByType?.length) {
          return {
            isActive: false,
            className: utils.getToggledClassName(false),
          };
        }

        const synchronizersForViewport = syncGroupService.getSynchronizersForViewport(viewportId);
        const synchronizersForViewportByType = synchronizersForViewport?.filter(sync =>
          synchronizersByType.includes(sync)
        );

        const hasEnabledSync = (syncList = []) =>
          syncList.some(sync => sync?._enabled !== false);

        const isEnabled =
          synchronizersForViewportByType?.length > 0
            ? hasEnabledSync(synchronizersForViewportByType)
            : hasEnabledSync(synchronizersByType);

        return {
          isActive: isEnabled,
          className: utils.getToggledClassName(isEnabled),
        };
      },
    },
    {
      name: 'evaluate.not3D',
      evaluate: ({ viewportId, disabledText }) => {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

        if (viewport?.type === 'volume3d') {
          return {
            disabled: true,
            className: '!text-common-bright ohif-disabled',
            disabledText: disabledText ?? 'Not available in the active viewport',
          };
        }
      },
    },
    {
      name: 'evaluate.isUS',
      evaluate: ({ viewportId, disabledText }) => {
        const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewportId);

        if (!displaySetUIDs?.length) {
          return;
        }

        const displaySets = displaySetUIDs.map(displaySetService.getDisplaySetByUID);
        const isUS = displaySets.some(displaySet => displaySet?.Modality === 'US');
        if (!isUS) {
          return {
            disabled: true,
            className: '!text-common-bright ohif-disabled',
            disabledText: disabledText ?? 'Not available in the active viewport',
          };
        }
      },
    },
    {
      name: 'evaluate.viewportProperties.toggle',
      evaluate: ({ viewportId, button }) => {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

        if (!viewport || viewport.isDisabled) {
          return;
        }

        const propId = button.id;

        const properties = viewport.getProperties();
        const camera = viewport.getCamera();

        const prop = camera?.[propId] || properties?.[propId];

        if (!prop) {
          return {
            disabled: false,
          };
        }

        const isToggled = prop;

        return {
          className: utils.getToggledClassName(isToggled),
        };
      },
    },
    {
      name: 'evaluate.displaySetIsReconstructable',
      evaluate: ({ viewportId, disabledText = 'Selected viewport is not reconstructable' }) => {
        // Whether it can be reconstructed is judged from the active viewport's display
        // sets, NOT from getCornerstoneViewport: in a subgrid there is no cornerstone
        // viewport registered under the viewportId, so that would be null and the MPR
        // button would stay enabled for ever. This way it disables itself inside a
        // montage too, exactly as in the ordinary viewports.
        const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewportId);

        if (!displaySetUIDs?.length) {
          return;
        }

        const { protocol } = hangingProtocolService.getActiveProtocol();

        const displaySets = displaySetUIDs.map(displaySetService.getDisplaySetByUID);

        const areReconstructable = displaySets.every(displaySet => {
          return displaySet?.isReconstructable;
        });

        if (!areReconstructable) {
          if (window.location.href.includes('priors=same-tab')) {
            window.parent.postMessage('disable-secondo-mpr', '*');
          }
          return {
            disabled: true,
            className: '!text-common-bright ohif-disabled',
            disabledText: disabledText ?? 'Not available in the active viewport',
          };
        }

        const isMpr = protocol?.id === 'mpr';

        // Inside a frame, tell the parent to turn the second MPR on
        if (window.location.href.includes('priors=same-tab')) {
          window.parent.postMessage('secondo-mpr', '*');
        }

        return {
          disabled: false,
          className: utils.getToggledClassName(isMpr),
        };
      },
    },
  ];
}

function _evaluateToggle({
  viewportId,
  toolbarService,
  button,
  disabledText,
  offModes,
  toolGroupService,
}) {
  const toolGroup = toolGroupService.getToolGroupForViewport(viewportId);

  if (!toolGroup) {
    return;
  }
  const toolName = toolbarService.getToolNameForButton(button);

  if (!toolGroup.hasTool(toolName)) {
    return {
      disabled: true,
      className: '!text-common-bright ohif-disabled',
      disabledText: disabledText ?? 'Not available in the active viewport',
    };
  }

  const isOff = offModes.includes(toolGroup.getToolOptions(toolName).mode);

  return {
    className: utils.getToggledClassName(!isOff),
  };
}
