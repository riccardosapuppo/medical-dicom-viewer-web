// Updated ToolbarLayoutSelector.tsx
import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { CommandsManager } from '@ohif/core';

import { LayoutSelector } from '../../../../platform/ui-next/src/components/LayoutSelector';

let hpSelezionato = 'mpr';
let hpSelezionatoStorico = 'mpr';
let showLayoutPresetsForStorico = false;

function ToolbarLayoutSelectorWithServices({
  commandsManager,
  servicesManager,
  rows = 3,
  columns = 4,
  ...props
}) {
  const [isDisabled, setIsDisabled] = useState(false);
  const { customizationService } = servicesManager.services;
  showLayoutPresetsForStorico = document.getElementById('iframe-storico') ? true : false;

  // Get the presets from the customization service
  const commonPresets = customizationService?.getCustomization('layoutSelector.commonPresets') || [
    {
      icon: 'layout-single',
      commandOptions: {
        numRows: 1,
        numCols: 1,
      },
    },
    {
      icon: 'layout-side-by-side',
      commandOptions: {
        numRows: 1,
        numCols: 2,
      },
    },
    {
      icon: 'layout-four-up',
      commandOptions: {
        numRows: 2,
        numCols: 2,
      },
    },
    {
      icon: 'layout-three-row',
      commandOptions: {
        numRows: 3,
        numCols: 1,
      },
    },
  ];

  const _areSelectorsValid = (hp, displaySets, hangingProtocolService) => {
    if (!hp.displaySetSelectors || Object.values(hp.displaySetSelectors).length === 0) {
      return true;
    }

    return hangingProtocolService.areRequiredSelectorsValid(
      Object.values(hp.displaySetSelectors),
      displaySets[0]
    );
  };

  const generateAdvancedPresets = ({ servicesManager }: withAppTypes) => {
    const { hangingProtocolService, viewportGridService, displaySetService } =
      servicesManager.services;

    const hangingProtocols = Array.from(hangingProtocolService.protocols.values());

    const viewportId = viewportGridService.getActiveViewportId();

    if (!viewportId) {
      return [];
    }
    const displaySetInsaneUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewportId);

    if (!displaySetInsaneUIDs) {
      return [];
    }

    const displaySets = displaySetInsaneUIDs.map(uid => displaySetService.getDisplaySetByUID(uid));

    return hangingProtocols
      .map(hp => {
        if (!hp.isPreset) {
          return null;
        }

        const areValid = _areSelectorsValid(hp, displaySets, hangingProtocolService);

        return {
          icon: hp.icon,
          title: hp.name,
          commandOptions: {
            protocolId: hp.id,
          },
          disabled: !areValid || hpSelezionato === hp.id,
        };
      })
      .filter(preset => preset !== null);
  };

  const generateAdvancedPresetsStorico = ({ servicesManager }: withAppTypes) => {
    const { hangingProtocolService, viewportGridService, displaySetService } =
      servicesManager.services;

    const hangingProtocols = Array.from(hangingProtocolService.protocols.values());

    const viewportId = viewportGridService.getActiveViewportId();

    if (!viewportId) {
      return [];
    }
    const displaySetInsaneUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewportId);

    if (!displaySetInsaneUIDs) {
      return [];
    }

    const displaySets = displaySetInsaneUIDs.map(uid => displaySetService.getDisplaySetByUID(uid));

    return hangingProtocols
      .map(hp => {
        if (!hp.isPreset) {
          return null;
        }

        const areValid = _areSelectorsValid(hp, displaySets, hangingProtocolService);

        return {
          icon: hp.icon,
          title: hp.name,
          commandOptions: {
            protocolId: hp.id,
          },
          disabled: hpSelezionatoStorico === hp.id,
        };
      })
      .filter(preset => preset !== null);
  };

  const onSelectionAdvancedPresetStorico = preset => {
    document.getElementById('iframe-storico').contentWindow.postMessage(preset);
  };

  // Get the advanced presets generator from the customization service
  const advancedPresetsGenerator = customizationService?.getCustomization(
    'layoutSelector.advancedPresetGenerator'
  );

  const advancedPresetsStorico = generateAdvancedPresetsStorico({ servicesManager });

  // Generate the advanced presets
  const advancedPresets = advancedPresetsGenerator
    ? advancedPresetsGenerator({ servicesManager })
    : [
      {
        title: 'MPR',
        icon: 'layout-three-col',
        commandOptions: {
          protocolId: 'mpr',
        },
      },
      {
        title: '3D four up',
        icon: 'layout-four-up',
        commandOptions: {
          protocolId: '3d-four-up',
        },
      },
      {
        title: '3D main',
        icon: 'layout-three-row',
        commandOptions: {
          protocolId: '3d-main',
        },
      },
      {
        title: 'Axial Primary',
        icon: 'layout-side-by-side',
        commandOptions: {
          protocolId: 'axial-primary',
        },
      },
      {
        title: '3D only',
        icon: 'layout-single',
        commandOptions: {
          protocolId: '3d-only',
        },
      },
      {
        title: '3D primary',
        icon: 'layout-side-by-side',
        commandOptions: {
          protocolId: '3d-primary',
        },
      },
      {
        title: 'Frame View',
        icon: 'icon-stack',
        commandOptions: {
          protocolId: 'frame-view',
        },
      },
    ];

  const onSelection = useCallback(props => {
    commandsManager.run({
      commandName: 'setViewportGridLayout',
      commandOptions: { ...props },
    });
    setIsDisabled(true);
    //Disabilito modalità MPR (quella dell'hanging protocol) ad ogni cambio di layout

    document.body.classList.remove('hp-mpr-active');
    window.mprIsActive = false;
  }, []);


  const onSelectionPreset = preset => {
    try {
      const listaPresetAvanzati = ['fourUp', 'main3D', 'primaryAxial', 'only3D', 'primary3D'];
      document.body.classList.add('caricamento-layout-mpr');
      //Ripulisco ad ogni scelta preset classi precedentemente memorizzate
      listaPresetAvanzati.forEach(preset => {
        if (document.body.classList.contains(preset)) {
          document.body.classList.remove(preset);
        }
      });
      document.body.classList.add(preset);

      hpSelezionato = preset;
      const { hangingProtocolService, viewportGridService } = servicesManager.services;

      const { activeViewportId, viewports } = viewportGridService.getState();
      const activeViewport = viewports.get(activeViewportId);
      const activeDisplaySetInstanceUID = activeViewport.displaySetInstanceUIDs[0];

      const ActiveThumbnail = document.querySelector(
        `#thumbnail-${activeDisplaySetInstanceUID} img`
      );
      window.instanceUIDMPRDaCliccare = activeDisplaySetInstanceUID;

      hangingProtocolService.setProtocol(hpSelezionato);
      //Memorizzo globalmente il preset selezionato così da riapplicare lo stesso eventualmente alla riattivazione dell'mpr (mprDirectClick)
      window.mdvProtocolToApply = preset;

      setTimeout(() => {
        if (ActiveThumbnail) {
          ActiveThumbnail.click();
        }
        document.body.classList.remove('caricamento-layout-mpr');
      }, 500);
    } catch (err) {
      console.error('Errore attivazione MPR: ', err);
    }
  };

  const onSelectionStudioStorico = layout => {
    document.getElementById('iframe-storico').contentWindow.postMessage(layout);
  };

  // Unified selection handler that dispatches to the appropriate command
  const handleSelectionChange = useCallback(
    (commandOptions, isPreset) => {
      if (commandOptions.storicoCommonPreset) {
        const { numCols, numRows } = commandOptions
        return onSelectionStudioStorico(`layout-common-${numRows}x${numCols}`,)
      }


      if (commandOptions.advancedPreset) {
        const { protocolId } = commandOptions
        return onSelectionPreset(protocolId)
      }

      if (commandOptions.storicoAdvancedPreset) {
        const { protocolId } = commandOptions
        return onSelectionAdvancedPresetStorico(protocolId)
      }


      if (isPreset) {
        // Advanced preset selection
        commandsManager.run({
          commandName: 'setHangingProtocol',
          commandOptions,
        });
      } else {
        // Common preset or custom grid selection
        commandsManager.run({
          commandName: 'setViewportGridLayout',
          commandOptions,
        });
      }
    },
    [commandsManager]
  );

  return (
    <div
      id="Layout"
      data-cy="Layout"
    >
      <LayoutSelector
        onSelectionChange={handleSelectionChange}
        {...props}
      >
        <LayoutSelector.Trigger tooltip="Cambia layout" />
        <LayoutSelector.Content>
          {/* Left side - Presets */}
          {(commonPresets.length > 0 || advancedPresets.length > 0) && (
            <div className="bg-popover flex flex-col gap-2.5 rounded-lg p-2">
              {commonPresets.length > 0 && (
                <>
                  <LayoutSelector.PresetSection
                    className={`standard-layout`}
                    title={showLayoutPresetsForStorico ? 'Standard - Studio principale' : 'Standard'}>
                    {commonPresets.map((preset, index) => (
                      <LayoutSelector.Preset
                        key={`common-preset-${index}`}
                        icon={preset.icon}
                        commandOptions={preset.commandOptions}
                        isPreset={false}
                      />
                    ))}
                  </LayoutSelector.PresetSection>
                  <LayoutSelector.Divider />
                </>
              )}

              {showLayoutPresetsForStorico && (
                <LayoutSelector.PresetSection
                  className={`standard-layout standard-layout-storico`}
                  title='Standard - Studio precedente'>
                  {commonPresets.map((preset, index) => (
                    <LayoutSelector.Preset
                      key={`advanced-preset-${index}`}
                      title={preset.title}
                      icon={preset.icon}
                      commandOptions={{ ...preset.commandOptions, storicoCommonPreset: true }}
                      disabled={preset.disabled}
                      isPreset={true}
                    />
                  ))}
                </LayoutSelector.PresetSection>
              )}

              {advancedPresets.length > 0 && (
                <LayoutSelector.PresetSection className={`advanced-layout advanced-layout-studio-principale`}
                  title={showLayoutPresetsForStorico ? 'Avanzato - Studio principale' : 'Avanzato'}>
                  {advancedPresets.map((preset, index) => (
                    <LayoutSelector.Preset
                      key={`advanced-preset-${index}`}
                      title={preset.title}
                      icon={preset.icon}
                      commandOptions={{ ...preset.commandOptions, advancedPreset: true }}
                      disabled={preset.disabled}
                      isPreset={true}
                    />
                  ))}
                </LayoutSelector.PresetSection>
              )}

              {advancedPresets.length > 0 && (
                <LayoutSelector.PresetSection className={`advanced-layout advanced-layout-storico`}
                  title='Avanzato - Studio precedente'>
                  {advancedPresets.map((preset, index) => (
                    <LayoutSelector.Preset
                      key={`advanced-preset-${index}`}
                      title={preset.title}
                      icon={preset.icon}
                      commandOptions={{ ...preset.commandOptions, storicoAdvancedPreset: true }}
                      disabled={preset.disabled}
                      isPreset={true}
                    />
                  ))}
                </LayoutSelector.PresetSection>
              )}



            </div>
          )}

          {/* Right Side - Grid Layout */}
          <div className="bg-muted flex flex-col gap-2.5 border-l-2 border-solid border-black p-2">
            <div className="custom-layout">
              <div className="text-muted-foreground text-xs">{showLayoutPresetsForStorico ? 'Personalizzato - Studio principale' : 'Personalizzato'}</div>
              <LayoutSelector.GridSelector
                rows={rows}
                columns={columns}
              />

            </div>

            <div className="custom-layout custom-layout-storico">
              <div className="text-muted-foreground text-xs"> Personalizzato - Studio precedente</div>
              <LayoutSelector.GridSelector
                rows={rows}
                columns={columns}
              />

            </div>


            <LayoutSelector.HelpText>
              Seleziona un preset  <br />  di righe e colonne.
              <br /> Clicca per applicare
            </LayoutSelector.HelpText>
          </div>


        </LayoutSelector.Content>
      </LayoutSelector>
    </div>
  );
}

ToolbarLayoutSelectorWithServices.propTypes = {
  commandsManager: PropTypes.instanceOf(CommandsManager),
  servicesManager: PropTypes.object,
  rows: PropTypes.number,
  columns: PropTypes.number,
};

export default ToolbarLayoutSelectorWithServices;
