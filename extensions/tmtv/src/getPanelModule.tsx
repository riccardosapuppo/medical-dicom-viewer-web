import React from 'react';
import { PanelPetSUV, PanelROIThresholdExport } from './Panels';
import { Toolbox } from '@ohif/extension-default';
import PanelTMTV from './Panels/PanelTMTV';

function getPanelModule({ commandsManager, extensionManager, servicesManager }) {
  const wrappedPanelPetSuv = () => {
    return (
      <PanelPetSUV
        commandsManager={commandsManager}
        servicesManager={servicesManager}
        extensionManager={extensionManager}
      />
    );
  };

  const wrappedROIThresholdToolbox = () => {
    return (
      <Toolbox
        buttonSectionId="ROIThresholdToolbox"
        title="Threshold Tools"
      />
    );
  };

  const wrappedROIThresholdExport = () => {
    return (
      <PanelROIThresholdExport
        commandsManager={commandsManager}
        servicesManager={servicesManager}
      />
    );
  };

  const wrappedPanelTMTV = () => {
    return (
      <>
        <Toolbox
          buttonSectionId="ROIThresholdToolbox"
          title="Threshold Tools"
        />
        <PanelTMTV
          commandsManager={commandsManager}
          servicesManager={servicesManager}
        />
        <PanelROIThresholdExport
          commandsManager={commandsManager}
          servicesManager={servicesManager}
        />
      </>
    );
  };

  return [
    {
      name: 'petSUV',
      iconName: 'tab-patient-info',
      iconLabel: 'Patient Info',
      label: 'Info paziente',
      component: wrappedPanelPetSuv,
    },
    {
      name: 'tmtv',
      iconName: 'tab-roi-threshold',
      iconLabel: 'TMTV',
      label: 'Segmentazione TMTV',
      component: wrappedPanelTMTV,
    },
    {
      name: 'tmtvBox',
      iconName: 'tab-segmentation',
      iconLabel: 'Segmentation',
      label: 'Segmentation Toolbox',
      component: wrappedROIThresholdToolbox,
    },
    {
      name: 'tmtvExport',
      iconName: 'tab-segmentation',
      iconLabel: 'Segmentazione',
      label: 'Esporta segmentazione',
      component: wrappedROIThresholdExport,
    },
  ];
}

export default getPanelModule;
