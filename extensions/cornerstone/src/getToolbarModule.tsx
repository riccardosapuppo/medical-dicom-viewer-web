import { Enums } from '@cornerstonejs/tools';
import { utils } from '@ohif/ui-next';

const getDisabledState = (disabledText?: string) => ({
  disabled: true,
  disabledText: disabledText ?? 'Non disponibile nella viewport attiva',
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

  // La Sottogriglia (Montage) è applicabile solo a serie 2D (stack) con più
  // immagini e modalità supportata (no volume/MPR/3D/video, no SEG/SR/...).
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
            document.body.classList.contains('storico-injected-iframe')) ||
          (toolName === 'TrackballRotate' &&
            document.body.classList.contains('storico-injected-iframe'))
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
      // Acceso o spento secondo la classe sul corpo della pagina.
      //
      // Il pulsante che nasconde i dati sovrimpressi era dichiarato toggle ma
      // valutato con evaluate.action, che risponde sempre e solo "non
      // disabilitato": premendolo le scritte sparivano e il pulsante restava
      // identico, quindi non c'era modo di sapere in che stato si fosse se non
      // guardando le immagini.
      //
      // Lo stato vero e' la classe che il comando mette e toglie, quindi la si
      // legge da li.
      name: 'evaluate.classeSulCorpo',
      evaluate: ({ button }) => {
        const classe = button?.commandOptions?.classe ?? 'hide-info-dicom';
        return {
          className: utils.getToggledClassName(document.body.classList.contains(classe)),
        };
      },
    },
    {
      // Disabilita un bottone quando la viewport attiva è in modalità Sottogriglia
      // (Montage). Usato per i tool non applicabili alla montage (es. Cine).
      name: 'evaluate.cornerstone.disabledInMontage',
      evaluate: ({ viewportId, disabledText }) => {
        const vp = viewportGridService.getState().viewports.get(viewportId);
        if (vp?.viewportOptions?.montage?.enabled === true) {
          return getDisabledState(disabledText ?? 'Non disponibile nella sottogriglia');
        }
        return undefined;
      },
    },
    {
      // Stato del bottone primario Sottogriglia: evidenziato quando attiva
      // (click → disattiva); abilitato solo se la serie attiva è idonea.
      name: 'evaluate.cornerstone.montage',
      evaluate: ({ viewportId, disabledText }) => {
        const vp = viewportGridService.getState().viewports.get(viewportId);
        const isActive = vp?.viewportOptions?.montage?.enabled === true;
        if (isActive) {
          return { isActive: true, className: utils.getToggledClassName(true) };
        }
        if (!isMontageSuitable(viewportId)) {
          return getDisabledState(disabledText ?? 'Sottogriglia non disponibile per questa serie');
        }
        return { isActive: false };
      },
    },
    {
      // Per le voci layout del menu Sottogriglia: abilitate se la montage è già
      // attiva (per cambiare layout) o se la serie attiva è idonea.
      name: 'evaluate.cornerstone.montageAvailable',
      evaluate: ({ viewportId, disabledText }) => {
        const vp = viewportGridService.getState().viewports.get(viewportId);
        if (vp?.viewportOptions?.montage?.enabled === true) {
          return undefined;
        }
        if (!isMontageSuitable(viewportId)) {
          return getDisabledState(disabledText ?? 'Sottogriglia non disponibile per questa serie');
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
            disabledText: disabledText ?? 'Non disponibile nella viewport attiva',
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
            disabledText: disabledText ?? 'Non disponibile nella viewport attiva',
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
        // Valutiamo la ricostruibilità dai displaySet della viewport attiva, NON
        // da getCornerstoneViewport: in Sottogriglia (Montage) non esiste una
        // cornerstone viewport registrata per viewportId, quindi sarebbe null e
        // il bottone MPR resterebbe sempre attivo. Così invece si disabilita
        // dinamicamente anche in montage, come nelle viewport normali.
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
          if (window.location.href.includes('storico=same-tab')) {
            window.parent.postMessage('disable-secondo-mpr', '*');
          }
          return {
            disabled: true,
            className: '!text-common-bright ohif-disabled',
            disabledText: disabledText ?? 'Non disponibile nella viewport attiva',
          };
        }

        const isMpr = protocol?.id === 'mpr';

        //Se sono un iframe dico al genitore di attivare il secondo mpr
        if (window.location.href.includes('storico=same-tab')) {
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
      disabledText: disabledText ?? 'Non disponibile nella viewport attiva',
    };
  }

  const isOff = offModes.includes(toolGroup.getToolOptions(toolName).mode);

  return {
    className: utils.getToggledClassName(!isOff),
  };
}
