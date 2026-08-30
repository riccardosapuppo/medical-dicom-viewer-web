import React, { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';

import { InvestigationalUseDialog } from '@ohif/ui';
import { HangingProtocolService, CommandsManager } from '@ohif/core';
import { useAppConfig } from '@state';
import ViewerHeader from './ViewerHeader';
import SidePanelWithServices from '../Components/SidePanelWithServices';
import { Onboarding, ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@ohif/ui-next';
import { ErrorBoundary } from '@ohif/ui-next';
import useResizablePanels from './ResizablePanelsHook';

const resizableHandleClassName = 'mt-[1px] bg-black';
const VIEWER_HEADER_HEIGHT_PX = 48;
const MDV_EXTENSION_BANNER_HEIGHT_PX = 28;
const MDV_EXTENSION_CHECK_TIMEOUT_MS = 1500;

function MdvExtensionBrowser({ appConfig, onVisibilityChange }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof onVisibilityChange === 'function') {
      onVisibilityChange(visible);
    }
  }, [visible, onVisibilityChange]);

  useEffect(() => {
    let extensionDetected = false;
    const handleMessage = event => {
      if (event.source !== window) {
        return;
      }

      if (event.data?.type === 'fromExtension' && event.data?.data?.versione) {
        extensionDetected = true;
        setVisible(false);
      }
    };

    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'fromPage', data: 'Info versione' }, '*');

    const timeoutId = setTimeout(() => {
      if (!extensionDetected) {
        setVisible(true);
      }
    }, MDV_EXTENSION_CHECK_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const handleHideBanner = event => {
      if (event.source !== window) {
        return;
      }
      if (event.data?.type === 'mdv-hide-extension-banner') {
        setVisible(false);
      }
    };
    window.addEventListener('message', handleHideBanner);
    return () => {
      window.removeEventListener('message', handleHideBanner);
    };
  }, []);

  const onClose = () => {
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  const installUrl = appConfig?.mdvExtensionBrowserUrl;

  return (
    <div className="mdv-extension-browser-container flex h-7 items-center justify-between gap-2 bg-amber-400 px-3 text-xs font-semibold text-black">
      <div className="flex items-center gap-2">
        <span>estensione del browser non installata. Installa l'estensione per abilitare multi-schermo, schermo intero e la migliore esperienza possibile.
        </span>
        {installUrl ? (
          <a
            className="underline underline-offset-2 hover:opacity-90"
            href={installUrl}
            rel="noreferrer"
            target="_blank"
          >
            Installa qui
          </a>
        ) : null}
      </div>
      <button
        className="rounded px-2 py-0.5 hover:bg-black/10"
        onClick={onClose}
        aria-label="Chiudi avviso estensione del browser"
        type="button"
      >
        X
      </button>
    </div>
  );
}

function ViewerLayout({
  // From Extension Module Params
  extensionManager,
  servicesManager,
  hotkeysManager,
  commandsManager,
  // From Modes
  viewports,
  ViewportGridComp,
  leftPanelClosed = false,
  rightPanelClosed = false,
  leftPanelResizable = false,
  rightPanelResizable = false,
}: withAppTypes): React.FunctionComponent {
  const [appConfig] = useAppConfig();

  const { panelService, hangingProtocolService, customizationService } = servicesManager.services;
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(appConfig.showLoadingIndicator);

  const hasPanels = useCallback(
    (side): boolean => !!panelService.getPanels(side).length,
    [panelService]
  );

  const [hasRightPanels, setHasRightPanels] = useState(hasPanels('right'));
  const [hasLeftPanels, setHasLeftPanels] = useState(hasPanels('left'));
  const [leftPanelClosedState, setLeftPanelClosed] = useState(leftPanelClosed);
  const [rightPanelClosedState, setRightPanelClosed] = useState(rightPanelClosed);
  const [showExtensionBanner, setShowExtensionBanner] = useState(false);
  const isTopWindow = window.self === window.top;

  const [
    leftPanelProps,
    rightPanelProps,
    resizablePanelGroupProps,
    resizableLeftPanelProps,
    resizableViewportGridPanelProps,
    resizableRightPanelProps,
    onHandleDragging,
  ] = useResizablePanels(
    leftPanelClosed,
    setLeftPanelClosed,
    rightPanelClosed,
    setRightPanelClosed
  );

  const LoadingIndicatorProgress = customizationService.getCustomization(
    'ui.loadingIndicatorProgress'
  );

  /**
   * Set body classes (tailwindcss) that don't allow vertical
   * or horizontal overflow (no scrolling). Also guarantee window
   * is sized to our viewport.
   */
  useEffect(() => {
    document.body.classList.add('bg-black');
    document.body.classList.add('overflow-hidden');
    return () => {
      document.body.classList.remove('bg-black');
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  const getComponent = id => {
    const entry = extensionManager.getModuleEntry(id);

    if (!entry || !entry.component) {
      throw new Error(
        `${id} is not valid for an extension module or no component found from extension ${id}. Please verify your configuration or ensure that the extension is properly registered. It's also possible that your mode is utilizing a module from an extension that hasn't been included in its dependencies (add the extension to the "extensionDependencies" array in your mode's index.js file). Check the reference string to the extension in your Mode configuration`
      );
    }

    return { entry, content: entry.component };
  };

  useEffect(() => {
    const { unsubscribe } = hangingProtocolService.subscribe(
      HangingProtocolService.EVENTS.PROTOCOL_CHANGED,

      // Todo: right now to set the loading indicator to false, we need to wait for the
      // hangingProtocolService to finish applying the viewport matching to each viewport,
      // however, this might not be the only approach to set the loading indicator to false. we need to explore this further.
      () => {
        setShowLoadingIndicator(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [hangingProtocolService]);

  const getViewportComponentData = viewportComponent => {
    const { entry } = getComponent(viewportComponent.namespace);

    return {
      component: entry.component,
      displaySetsToDisplay: viewportComponent.displaySetsToDisplay,
    };
  };

  useEffect(() => {
    const { unsubscribe } = panelService.subscribe(
      panelService.EVENTS.PANELS_CHANGED,
      ({ options }) => {
        setHasLeftPanels(hasPanels('left'));
        setHasRightPanels(hasPanels('right'));
        if (options?.leftPanelClosed !== undefined) {
          setLeftPanelClosed(options.leftPanelClosed);
        }
        if (options?.rightPanelClosed !== undefined) {
          setRightPanelClosed(options.rightPanelClosed);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [panelService, hasPanels]);

  const viewportComponents = viewports.map(getViewportComponentData);

  // Hide the top toolbar while the initial loading indicator is visible: the
  // user shouldn't interact with tools before the study is ready. The height
  // offset is zeroed out in that state so the loading splash takes the whole
  // viewport cleanly.
  const viewerHeightOffset =
    (showLoadingIndicator ? 0 : VIEWER_HEADER_HEIGHT_PX) +
    (isTopWindow && showExtensionBanner ? MDV_EXTENSION_BANNER_HEIGHT_PX : 0);

  return (
    <div>
      {isTopWindow && appConfig?.mostraavvisoEstensioneMdvBrowserNonInstallata !== false ? (
        <MdvExtensionBrowser
          appConfig={appConfig}
          onVisibilityChange={setShowExtensionBanner}
        />
      ) : null}
      {/* Keep ViewerHeader mounted at all times so its hooks (e.g.
          usePatientInfo that populates window.mdvPatientInfo /
          window.mdvStudyInfo) can run as soon as metadata is available.
          Hide it via CSS while the initial loading splash is visible. */}
      <div style={{ display: showLoadingIndicator ? 'none' : undefined }}>
        <ViewerHeader
          hotkeysManager={hotkeysManager}
          extensionManager={extensionManager}
          servicesManager={servicesManager}
          appConfig={appConfig}
        />
      </div>
      <div
        className="mdv-main-area relative flex w-full flex-row flex-nowrap items-stretch overflow-hidden bg-black"
        style={{ height: `calc(100vh - ${viewerHeightOffset}px)` }}
      >
        <React.Fragment>
          {showLoadingIndicator && <LoadingIndicatorProgress className="h-full w-full bg-black" />}
          <ResizablePanelGroup {...resizablePanelGroupProps}>
            {/* LEFT SIDEPANELS */}

            {hasLeftPanels && !window.sonoUnoStorico ? (
              <>
                <ResizablePanel {...resizableLeftPanelProps}>
                  <SidePanelWithServices
                    side="left"
                    isExpanded={!leftPanelClosedState}
                    servicesManager={servicesManager}
                    {...leftPanelProps}
                  />
                </ResizablePanel>
                <ResizableHandle
                  onDragging={onHandleDragging}
                  disabled={!leftPanelResizable}
                  className={resizableHandleClassName}
                />
              </>
            ) : null}
            {/* TOOLBAR + GRID */}
            <ResizablePanel {...resizableViewportGridPanelProps}>
              <div className="flex h-full flex-1 flex-col">
                <div className="mdv-viewport-grid-wrapper relative flex h-full flex-1 items-center justify-center overflow-hidden bg-black">
                  <ViewportGridComp
                    servicesManager={servicesManager}
                    viewportComponents={viewportComponents}
                    commandsManager={commandsManager}
                  />
                </div>
              </div>
            </ResizablePanel>

            {/* Pannello dx storico */}
            {hasRightPanels && window.sonoUnoStorico ? (
              <>
                <ResizablePanel {...resizableLeftPanelProps}>
                  <SidePanelWithServices
                    side="left"
                    isExpanded={!leftPanelClosedState}
                    servicesManager={servicesManager}
                    {...leftPanelProps}
                  />
                </ResizablePanel>
                <ResizableHandle
                  onDragging={onHandleDragging}
                  disabled={!leftPanelResizable}
                  className="!w-0"
                />
              </>
            ) : null}

            {hasRightPanels ? (
              <>
                <ResizableHandle
                  onDragging={onHandleDragging}
                  disabled={!rightPanelResizable}
                  className={resizableHandleClassName}
                />
                <ResizablePanel {...resizableRightPanelProps}>
                  <SidePanelWithServices
                    side="right"
                    isExpanded={!rightPanelClosedState}
                    servicesManager={servicesManager}
                    {...rightPanelProps}
                  />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </React.Fragment>
      </div>
      <Onboarding tours={customizationService.getCustomization('ohif.tours')} />
      <InvestigationalUseDialog dialogConfiguration={appConfig?.investigationalUseDialog} />
    </div>
  );
}

ViewerLayout.propTypes = {
  // From extension module params
  extensionManager: PropTypes.shape({
    getModuleEntry: PropTypes.func.isRequired,
  }).isRequired,
  commandsManager: PropTypes.instanceOf(CommandsManager),
  servicesManager: PropTypes.object.isRequired,
  // From modes
  leftPanels: PropTypes.array,
  rightPanels: PropTypes.array,
  leftPanelClosed: PropTypes.bool.isRequired,
  rightPanelClosed: PropTypes.bool.isRequired,
  /** Responsible for rendering our grid of viewports; provided by consuming application */
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  viewports: PropTypes.array,
};

export default ViewerLayout;
