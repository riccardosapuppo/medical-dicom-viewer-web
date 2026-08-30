import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { AllInOneMenu } from '@ohif/ui';
import { useViewportGrid } from '@ohif/ui-next';
import { Colormap } from './Colormap';
import { Colorbar } from './Colorbar';
import { Preferiti } from '../Preferiti/Preferiti';
import { setViewportColorbar } from './Colorbar';
import { WindowLevelPreset } from '../../types/WindowLevel';
import { ColorbarProperties } from '../../types/Colorbar';
import { VolumeRenderingQualityRange } from '../../types/ViewportPresets';
import { WindowLevel } from './WindowLevel';
import { VolumeRenderingPresets } from './VolumeRenderingPresets';
import { VolumeRenderingOptions } from './VolumeRenderingOptions';
import { ViewportPreset } from '../../types/ViewportPresets';
import { Enums, metaData, VolumeViewport, VolumeViewport3D, utilities } from '@cornerstonejs/core';
import { CrosshairsTool } from '@cornerstonejs/tools';

export const nonWLModalities = ['SR', 'SEG', 'SM', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'];

export type WindowLevelActionMenuProps = {
  viewportId: string;
  element: HTMLElement;
  presets: Array<Record<string, Array<WindowLevelPreset>>>;
  colorbarProperties: ColorbarProperties;
  displaySets: Array<any>;
  volumeRenderingPresets: Array<ViewportPreset>;
  volumeRenderingQualityRange: VolumeRenderingQualityRange;
};

export function WindowLevelActionMenu({
  viewportId,
  element,
  presets,
  verticalDirection,
  horizontalDirection,
  commandsManager,
  servicesManager,
  colorbarProperties,
  displaySets,
  volumeRenderingPresets,
  volumeRenderingQualityRange,
}: withAppTypes<WindowLevelActionMenuProps>): ReactElement {
  const {
    colormaps,
    colorbarContainerPosition,
    colorbarInitialColormap,
    colorbarTickPosition,
    width: colorbarWidth,
  } = colorbarProperties;
  const { colorbarService, cornerstoneViewportService } = servicesManager.services;
  const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
  const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  const backgroundColor = viewportInfo?.getViewportOptions().background;
  const isLight = backgroundColor ? utilities.isEqual(backgroundColor, [1, 1, 1]) : false;

  const { t } = useTranslation('WindowLevelActionMenu');

  const [viewportGrid] = useViewportGrid();
  const { activeViewportId } = viewportGrid;

  const [vpHeight, setVpHeight] = useState(element?.clientHeight);
  const [menuKey, setMenuKey] = useState(0);
  const [isMPR, setIsMPR] = useState(false);
  const [is3DVolume, setIs3DVolume] = useState(false);
  const [rangeValue, setRangeValue] = useState(0);
  const [selectedRenderingMethod, setSelectedRenderingMethod] = useState('mip');
  const [isPreferito, setIsPreferito] = useState(false);

  let _selectedRenderingMethod;

  const ManageSpessore = event => {
    const value = Number(event.target.value);
    setRangeValue(value);
    setTimeout(() => {
      document.getElementById('rangeInput').value = value;
    }, 0);
    if (!_selectedRenderingMethod) {
      _selectedRenderingMethod = selectedRenderingMethod;
    }

    const slabThicknessBlendMode = _selectedRenderingMethod === 'mip' ? 1 : 2;

    const customToolProps = {
      configuration: {
        slabThicknessBlendMode: slabThicknessBlendMode, // Sovrascrive il valore predefinito
      },
    };
    // Crea un'istanza di CrosshairsTool
    const crosshairsTool = new CrosshairsTool({}, customToolProps);
    const { cornerstoneViewportService } = servicesManager.services;
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    crosshairsTool.setSlabThickness(viewport, value); // Utilizza il valore passato
    if (event.target.nextElementSibling) {
      event.target.nextElementSibling.style.width = `${value}%`;
    }
    if (event.target.parentElement.parentElement.querySelector('span')) {
      event.target.parentElement.parentElement.querySelector('span').textContent = value;
    }
    viewport.render();
  };

  const handleRadioChange = event => {
    window.setTimeout(() => {
      event.target.checked = true;
      _selectedRenderingMethod = event.target.value; //lo cambia in tempo reale
      setSelectedRenderingMethod(event.target.value); //memorizza lo stato quando passo da una viewport ad un'altra o dopo riattivazione
      //Passo live da mip/minip o viceversa
      const spessoreAttuale =
        event.target.parentElement.parentElement.parentElement.querySelector('.spessore-div span')
          .textContent || 0;
      const slabThicknessBlendMode = _selectedRenderingMethod === 'mip' ? 1 : 2;

      const customToolProps = {
        configuration: {
          slabThicknessBlendMode: slabThicknessBlendMode, // Sovrascrive il valore predefinito
        },
      };
      const crosshairsTool = new CrosshairsTool({}, customToolProps);
      const { cornerstoneViewportService } = servicesManager.services;
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      crosshairsTool.setSlabThickness(viewport, spessoreAttuale); // Utilizza il valore passato
      viewport.render();
    }, 0);
  };

  const onSetColorbar = useCallback(() => {
    setViewportColorbar(viewportId, displaySets, commandsManager, servicesManager, {
      colormaps,
      ticks: {
        position: colorbarTickPosition,
      },
      width: colorbarWidth,
      position: colorbarContainerPosition,
      activeColormapName: colorbarInitialColormap,
    });
  }, [commandsManager]);

  useEffect(() => {
    const newVpHeight = element?.clientHeight;
    if (vpHeight !== newVpHeight) {
      setVpHeight(newVpHeight);
    }
  }, [element, vpHeight]);

  useEffect(() => {
    if (!colorbarService.hasColorbar(viewportId)) {
      return;
    }
    window.setTimeout(() => {
      colorbarService.removeColorbar(viewportId);
      onSetColorbar();
    }, 0);
  }, [viewportId, displaySets, viewport]);

  useEffect(() => {
    setMenuKey(menuKey + 1);
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (viewport instanceof VolumeViewport3D) {
      setIs3DVolume(true);
    } else {
      setIs3DVolume(false);
    }
    if (viewport instanceof VolumeViewport) {
      setIsMPR(true);
    } else {
      setIsMPR(false);
    }
  }, [
    displaySets,
    viewportId,
    presets,
    volumeRenderingQualityRange,
    volumeRenderingPresets,
    colorbarProperties,
    activeViewportId,
    viewportGrid,
  ]);

  useEffect(() => {
    const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
    const element = viewportInfo?.getElement?.();
    if (!element) {
      return;
    }

    const seriesInstanceUID = displaySets?.[0]?.instance?.SeriesInstanceUID;
    if (!seriesInstanceUID) {
      setIsPreferito(false);
    }

    const getCurrentSopUID = () => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (viewport && typeof viewport.getImageIds === 'function') {
        try {
          const imageIds = viewport.getImageIds() || [];
          const index = viewport.getCurrentImageIdIndex?.() ?? 0;
          const imageId = imageIds[index];
          if (imageId) {
            const sop = metaData.get('sopCommonModule', imageId)?.sopInstanceUID;
            if (sop) {
              return sop;
            }
          }
        } catch (err) {
          // Volume viewport without actor yet: fall back to displaySets instances
        }
      }

      const instances = displaySets?.[0]?.instances || [];
      let currentIndex = 0;
      try {
        currentIndex = viewport?.getCurrentImageIdIndex?.() ?? 0;
      } catch (err) {
        currentIndex = 0;
      }
      const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(instances.length - 1, 0));
      return instances[safeIndex]?.SOPInstanceUID || displaySets?.[0]?.instance?.SOPInstanceUID;
    };

    const updatePreferitoState = () => {
      const sopUID = getCurrentSopUID();
      const isCurrentPreferito = !!(
        seriesInstanceUID &&
        sopUID &&
        window.preferiti?.some(
          preferito =>
            preferito.SeriesInstanceUID === seriesInstanceUID &&
            preferito.SOPInstanceUID === sopUID
        )
      );
      setIsPreferito(isCurrentPreferito);
    };

    const viewportType =
      viewportInfo.getViewportType?.() ||
      viewportInfo.getViewportData?.()?.viewportType ||
      Enums.ViewportType.STACK;

    const eventId =
      (viewportType === Enums.ViewportType.STACK && Enums.Events.STACK_VIEWPORT_SCROLL) ||
      (viewportType === Enums.ViewportType.ORTHOGRAPHIC && Enums.Events.VOLUME_NEW_IMAGE) ||
      Enums.Events.IMAGE_RENDERED;

    const onPreferitiUpdated = () => updatePreferitoState();

    element.addEventListener(eventId, updatePreferitoState);
    window.addEventListener('mdv-preferiti-updated', onPreferitiUpdated);
    updatePreferitoState();

    return () => {
      element.removeEventListener(eventId, updatePreferitoState);
      window.removeEventListener('mdv-preferiti-updated', onPreferitiUpdated);
    };
  }, [cornerstoneViewportService, viewportId, displaySets]);

  return (
    <>
      <AllInOneMenu.IconMenu
        icon={isMPR ? 'icon-settings' : 'viewport-window-level'}
        verticalDirection={verticalDirection}
        horizontalDirection={horizontalDirection}
        iconClassName={classNames(
          // Visible on hover and for the active viewport
          activeViewportId === viewportId ? 'visible' : 'invisible group-hover/pane:visible',
          'flex shrink-0 cursor-pointer rounded active:text-white text-primary-light',
          isLight ? ' hover:bg-secondary-dark' : 'hover:bg-secondary-light/60'
        )}
        menuStyle={{ maxHeight: vpHeight - 32, minWidth: 218 }}
        onVisibilityChange={() => {
          setVpHeight(element.clientHeight);
        }}
        menuKey={menuKey}
      >
        <AllInOneMenu.ItemPanel>
          {!is3DVolume && (
            <Colorbar
              viewportId={viewportId}
              displaySets={displaySets.filter(ds => !nonWLModalities.includes(ds.Modality))}
              commandsManager={commandsManager}
              servicesManager={servicesManager}
              colorbarProperties={colorbarProperties}
            />
          )}

          {colormaps && !is3DVolume && (
            <AllInOneMenu.SubMenu
              key="colorLUTPresets"
              itemLabel="Color LUT"
              itemIcon="icon-color-lut"
            >
              <Colormap
                colormaps={colormaps}
                viewportId={viewportId}
                displaySets={displaySets.filter(ds => !nonWLModalities.includes(ds.Modality))}
                commandsManager={commandsManager}
                servicesManager={servicesManager}
              />
            </AllInOneMenu.SubMenu>
          )}

          {((presets && presets.length > 0) || window.MdvDicomLuts) && !is3DVolume && (
            <AllInOneMenu.SubMenu
              key="windowLevelPresets"
              itemLabel={t('Modality Window Presets')}
              itemIcon="viewport-window-level"
            >
              <WindowLevel
                viewportId={viewportId}
                commandsManager={commandsManager}
                presets={presets}
              />
            </AllInOneMenu.SubMenu>
          )}

          {isMPR && (
            <div className="spessore-div">
              <label htmlFor="rangeInput">
                Spessore: <span>{rangeValue}</span>
              </label>
              <div className="range-container">
                <input
                  type="range"
                  id="rangeInput"
                  min="0"
                  max="100"
                  step="1"
                  value={rangeValue} // Uso il valore dallo stato
                  onChange={ManageSpessore}
                />
                <div
                  className="range-fill"
                  style={{ width: `${rangeValue}%` }}
                ></div>
              </div>
              <fieldset>
                <div>
                  <input
                    type="radio"
                    id="mip"
                    name="renderingMethod"
                    value="mip"
                    checked={selectedRenderingMethod === 'mip'} // Controllo se è selezionato
                    onClick={handleRadioChange}
                  />
                  <label htmlFor="mip">MIP</label>
                </div>

                <div>
                  <input
                    type="radio"
                    id="minip"
                    name="renderingMethod"
                    value="minip"
                    checked={selectedRenderingMethod === 'minip'} // Controllo se è selezionato
                    onClick={handleRadioChange}
                  />
                  <label htmlFor="minip">MinIP</label>
                </div>
              </fieldset>
            </div>
          )}

          {volumeRenderingPresets && is3DVolume && (
            <VolumeRenderingPresets
              servicesManager={servicesManager}
              viewportId={viewportId}
              commandsManager={commandsManager}
              volumeRenderingPresets={volumeRenderingPresets}
            />
          )}

          {volumeRenderingQualityRange && is3DVolume && (
            <AllInOneMenu.SubMenu itemLabel="Opzioni rendering">
              <VolumeRenderingOptions
                viewportId={viewportId}
                commandsManager={commandsManager}
                volumeRenderingQualityRange={volumeRenderingQualityRange}
                servicesManager={servicesManager}
              />
            </AllInOneMenu.SubMenu>
          )}
        </AllInOneMenu.ItemPanel>
      </AllInOneMenu.IconMenu>

      {/* Preferiti */}
      {!isMPR && (
        <AllInOneMenu.IconMenu
          icon={isPreferito ? 'preferitiActive' : 'preferiti'}
          verticalDirection={verticalDirection}
          horizontalDirection={horizontalDirection}
          iconClassName={classNames(
            // Visible on hover (sul pane del viewport) e per il viewport attivo.
            // Usiamo `group-hover/pane:visible` per coerenza con l'icona WW/WL
            // sopra: il viewport pane ha la classe `group/pane`, mentre
            // `group-hover:visible` (senza named group) non scatta mai →
            // l'icona compariva solo dopo il click sul viewport.
            activeViewportId === viewportId
              ? 'visible preferiti-btn'
              : 'preferiti-btn invisible group-hover/pane:visible',
            'flex shrink-0 cursor-pointer rounded active:text-white text-primary-light',
            isLight ? ' hover:bg-secondary-dark' : 'hover:bg-secondary-light/60'
          )}
          menuStyle={{ maxHeight: vpHeight - 32, minWidth: 218 }}
          onVisibilityChange={() => {
            setVpHeight(element.clientHeight);
          }}
          menuKey={menuKey}
        >
          <AllInOneMenu.ItemPanel>
            {
              <Preferiti
                viewportId={viewportId}
                displaySets={displaySets.filter(ds => !nonWLModalities.includes(ds.Modality))}
                commandsManager={commandsManager}
                servicesManager={servicesManager}
                colorbarProperties={colorbarProperties}
              />
            }
          </AllInOneMenu.ItemPanel>
        </AllInOneMenu.IconMenu>
      )}
    </>
  );
}
