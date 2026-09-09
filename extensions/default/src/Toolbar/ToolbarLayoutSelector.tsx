// Updated ToolbarLayoutSelector.tsx
import React, { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { CommandsManager } from '@ohif/core';

import { LayoutSelector } from '../../../../platform/ui-next/src/components/LayoutSelector';

let selectedHangingProtocol = 'mpr';
let selectedPriorsHangingProtocol = 'mpr';
let showLayoutPresetsForPriors = false;

function ToolbarLayoutSelectorWithServices({
  commandsManager,
  servicesManager,
  rows = 3,
  columns = 4,
  ...props
}) {
  const [isDisabled, setIsDisabled] = useState(false);
  const { customizationService } = servicesManager.services;
  showLayoutPresetsForPriors = document.getElementById('priors-iframe') ? true : false;

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
          disabled: !areValid || selectedHangingProtocol === hp.id,
        };
      })
      .filter(preset => preset !== null);
  };

  const generateAdvancedPriorsPresets = ({ servicesManager }: withAppTypes) => {
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
          disabled: selectedPriorsHangingProtocol === hp.id,
        };
      })
      .filter(preset => preset !== null);
  };

  const onSelectAdvancedPriorsPreset = preset => {
    document.getElementById('priors-iframe').contentWindow.postMessage(preset);
  };

  // Get the advanced presets generator from the customization service
  const advancedPresetsGenerator = customizationService?.getCustomization(
    'layoutSelector.advancedPresetGenerator'
  );

  const advancedPresetsPriors = generateAdvancedPriorsPresets({ servicesManager });

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
    // Turn the hanging protocol's MPR mode off on every change of layout

    document.body.classList.remove('hp-mpr-active');
    window.mprIsActive = false;
  }, []);


  const onSelectionPreset = preset => {
    try {
      const listaPresetAvanzati = ['fourUp', 'main3D', 'primaryAxial', 'only3D', 'primary3D'];
      document.body.classList.add('mpr-layout-loading');
      // Clear the classes remembered from the previous preset
      listaPresetAvanzati.forEach(preset => {
        if (document.body.classList.contains(preset)) {
          document.body.classList.remove(preset);
        }
      });
      document.body.classList.add(preset);

      selectedHangingProtocol = preset;
      const { hangingProtocolService, viewportGridService } = servicesManager.services;

      const { activeViewportId, viewports } = viewportGridService.getState();
      const activeViewport = viewports.get(activeViewportId);
      const activeDisplaySetInstanceUID = activeViewport.displaySetInstanceUIDs[0];

      const ActiveThumbnail = document.querySelector(
        `#thumbnail-${activeDisplaySetInstanceUID} img`
      );
      window.instanceUIDMPRToClick = activeDisplaySetInstanceUID;

      hangingProtocolService.setProtocol(selectedHangingProtocol);
      // Remember the chosen preset globally, so the same one can be reapplied if MPR comes back (mprDirectClick)
      window.mdvProtocolToApply = preset;

      setTimeout(() => {
        if (ActiveThumbnail) {
          ActiveThumbnail.click();
        }
        document.body.classList.remove('mpr-layout-loading');
      }, 500);
    } catch (err) {
      console.error('Could not switch to MPR: ', err);
    }
  };

  const onSelectPriorsStudy = layout => {
    document.getElementById('priors-iframe').contentWindow.postMessage(layout);
  };

  // Unified selection handler that dispatches to the appropriate command
  const handleSelectionChange = useCallback(
    (commandOptions, isPreset) => {
      if (commandOptions.priorsCommonPreset) {
        const { numCols, numRows } = commandOptions
        return onSelectPriorsStudy(`layout-common-${numRows}x${numCols}`,)
      }


      if (commandOptions.advancedPreset) {
        const { protocolId } = commandOptions
        return onSelectionPreset(protocolId)
      }

      if (commandOptions.priorsAdvancedPreset) {
        const { protocolId } = commandOptions
        return onSelectAdvancedPriorsPreset(protocolId)
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
        <LayoutSelector.Trigger tooltip="Change the layout" />
        <LayoutSelector.Content>
          {/* Left side - Presets */}
          {(commonPresets.length > 0 || advancedPresets.length > 0) && (
            <div className="bg-popover flex flex-col gap-2.5 rounded-lg p-2">
              {commonPresets.length > 0 && (
                <>
                  <LayoutSelector.PresetSection
                    className={`standard-layout`}
                    title={showLayoutPresetsForPriors ? 'Standard, main study' : 'Standard'}>
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

              {showLayoutPresetsForPriors && (
                <LayoutSelector.PresetSection
                  className={`standard-layout standard-layout-priors`}
                  title='Standard, prior study'>
                  {commonPresets.map((preset, index) => (
                    <LayoutSelector.Preset
                      key={`advanced-preset-${index}`}
                      title={preset.title}
                      icon={preset.icon}
                      commandOptions={{ ...preset.commandOptions, priorsCommonPreset: true }}
                      disabled={preset.disabled}
                      isPreset={true}
                    />
                  ))}
                </LayoutSelector.PresetSection>
              )}

              {advancedPresets.length > 0 && (
                <LayoutSelector.PresetSection className={`advanced-layout advanced-layout-main-study`}
                  title={showLayoutPresetsForPriors ? 'Advanced, main study' : 'Avanzato'}>
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
                <LayoutSelector.PresetSection className={`advanced-layout advanced-layout-priors`}
                  title='Advanced, prior study'>
                  {advancedPresets.map((preset, index) => (
                    <LayoutSelector.Preset
                      key={`advanced-preset-${index}`}
                      title={preset.title}
                      icon={preset.icon}
                      commandOptions={{ ...preset.commandOptions, priorsAdvancedPreset: true }}
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
              <div className="text-muted-foreground text-xs">{showLayoutPresetsForPriors ? 'Custom, main study' : 'Personalizzato'}</div>
              <LayoutSelector.GridSelector
                rows={rows}
                columns={columns}
              />

            </div>

            <div className="custom-layout custom-layout-priors">
              <div className="text-muted-foreground text-xs"> Custom, prior study</div>
              <LayoutSelector.GridSelector
                rows={rows}
                columns={columns}
              />

            </div>


            <LayoutSelector.HelpText>
              Choose a preset  <br />  of rows and columns.
              <br /> Click to apply
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
