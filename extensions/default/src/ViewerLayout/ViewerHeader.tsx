import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Header, useModal } from '@ohif/ui-next';
import { useSystem } from '@ohif/core';
import { Toolbar } from '../Toolbar/Toolbar';
import HeaderPatientInfo from './HeaderPatientInfo';
import { PatientInfoVisibility } from './HeaderPatientInfo/HeaderPatientInfo';
import { preserveQueryParameters, publicUrl } from '@ohif/app';

function ViewerHeader({ appConfig }: withAppTypes<{ appConfig: AppTypes.Config }>) {
  const { servicesManager, extensionManager } = useSystem();
  const { customizationService } = servicesManager.services;

  const navigate = useNavigate();
  const location = useLocation();

  const onClickReturnButton = () => {
    // Inside the desktop application there is no study list at `/`: the list is
    // the application's own window, and the way back to it is a bridge the
    // preload puts on `window`. It exposed that door from the beginning and
    // nothing ever knocked on it, so opening a study there was a one-way trip
    // too. In a browser the bridge is not there and the address below is.
    const desktop = (window as any).workstation;
    if (typeof desktop?.leaveViewer === 'function') {
      desktop.leaveViewer();
      return;
    }

    const { pathname } = location;
    const dataSourceIdx = pathname.indexOf('/', 1);

    const dataSourceName = pathname.substring(dataSourceIdx + 1);
    const existingDataSource = extensionManager.getDataSources(dataSourceName);

    const searchQuery = new URLSearchParams();
    if (dataSourceIdx !== -1 && existingDataSource) {
      searchQuery.append('datasources', pathname.substring(dataSourceIdx + 1));
    }
    preserveQueryParameters(searchQuery);

    navigate({
      pathname: publicUrl,
      search: decodeURIComponent(searchQuery.toString()),
    });
  };

  const { t } = useTranslation();
  const { show } = useModal();

  const AboutModal = customizationService.getCustomization('ohif.aboutModal');
  const UserPreferencesModal = customizationService.getCustomization('ohif.userPreferencesModal');

  const menuOptions = [
    {
      title: t('Header:Info'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: t('Header:Info'),
          containerClassName: 'max-w-md',
        }),
    },
    {
      title: t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          content: UserPreferencesModal,
          title: t('Header:Preferences'),
          containerClassName: 'flex max-w-4xl p-6 flex-col',
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      title: t('Header:Logout'),
      icon: 'power-off',
      onClick: async () => {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      },
    });
  }

  return (
    <Header
      menuOptions={menuOptions}
      isReturnEnabled={!!appConfig.showStudyList}
      onClickReturnButton={onClickReturnButton}
      WhiteLabeling={appConfig.whiteLabeling}
      Secondary={
        <Toolbar
          servicesManager={servicesManager}
          buttonSection="secondary"
        />
      }
      PatientInfo={
        appConfig.showPatientInfo !== PatientInfoVisibility.DISABLED && (
          <HeaderPatientInfo
            servicesManager={servicesManager}
            appConfig={appConfig}
          />
        )
      }
    >
      <div className="relative flex justify-center gap-[4px]">
        <Toolbar servicesManager={servicesManager} />
      </div>
    </Header>
  );
}

export default ViewerHeader;
