import React, { useEffect, useCallback, useRef } from 'react';
import { useResizeDetector } from 'react-resize-detector';
import { Types, MeasurementService } from '@ohif/core';
import { ViewportGrid, ViewportPane } from '@ohif/ui-next';
import { useViewportGrid } from '@ohif/ui-next';
import EmptyViewport from './EmptyViewport';
import classNames from 'classnames';
import { useAppConfig } from '@state';

function ViewerViewportGrid(props: withAppTypes) {
  const { servicesManager, viewportComponents = [], dataSource } = props;
  const [viewportGrid, viewportGridService] = useViewportGrid();
  const [appConfig] = useAppConfig();

  const { layout, activeViewportId, viewports, isHangingProtocolLayout } = viewportGrid;
  const { numCols, numRows } = layout;
  const { ref: resizeRef } = useResizeDetector({
    refreshMode: 'debounce',
    refreshRate: 7,
    refreshOptions: { leading: true },
    onResize: () => {
      viewportGridService.setViewportGridSizeChanged();
    },
  });
  const layoutHash = useRef(null);

  const {
    displaySetService,
    measurementService,
    hangingProtocolService,
    uiNotificationService,
    customizationService,
  } = servicesManager.services;

  const generateLayoutHash = () => `${numCols}-${numRows}`;

  /**
   * This callback runs after the viewports structure has changed in any way.
   * On initial display, that means if it has changed by applying a HangingProtocol,
   * while subsequently it may mean by changing the stage or by manually adjusting
   * the layout.

   */
  const updateDisplaySetsFromProtocol = (
    protocol: Types.HangingProtocol.Protocol,
    stage,
    activeStudyUID,
    viewportMatchDetails
  ) => {
    const availableDisplaySets = displaySetService.getActiveDisplaySets();

    if (!availableDisplaySets.length) {
      console.log('No available display sets', availableDisplaySets);
      return;
    }

    // Match each viewport individually
    const { layoutType } = stage.viewportStructure;
    const stageProps = stage.viewportStructure.properties;
    const { columns: numCols, rows: numRows, layoutOptions = [] } = stageProps;

    /**
     * This find or create viewport uses the hanging protocol results to
     * specify the viewport match details, which specifies the size and
     * setup of the various viewports.
     */
    const findOrCreateViewport = pos => {
      const viewportId = Array.from(viewportMatchDetails.keys())[pos];
      const details = viewportMatchDetails.get(viewportId);
      if (!details) {
        console.log('No match details for viewport', viewportId);
        return;
      }

      const { displaySetsInfo, viewportOptions } = details;
      const displaySetUIDsToHang = [];
      const displaySetUIDsToHangOptions = [];

      displaySetsInfo.forEach(({ displaySetInstanceUID, displaySetOptions }) => {
        if (displaySetInstanceUID) {
          displaySetUIDsToHang.push(displaySetInstanceUID);
        }

        displaySetUIDsToHangOptions.push(displaySetOptions);
      });

      const computedViewportOptions = hangingProtocolService.getComputedOptions(
        viewportOptions,
        displaySetUIDsToHang
      );

      const computedDisplaySetOptions = hangingProtocolService.getComputedOptions(
        displaySetUIDsToHangOptions,
        displaySetUIDsToHang
      );

      return {
        displaySetInstanceUIDs: displaySetUIDsToHang,
        displaySetOptions: computedDisplaySetOptions,
        viewportOptions: computedViewportOptions,
      };
    };

    viewportGridService.setLayout({
      numRows,
      numCols,
      layoutType,
      layoutOptions,
      findOrCreateViewport,
      isHangingProtocolLayout: true,
    });
  };

  const _getUpdatedViewports = useCallback(
    (viewportId, displaySetInstanceUID) => {
      if (!displaySetInstanceUID) {
        return [];
      }

      let updatedViewports = [];
      try {
        // Use HP cascading (isHangingProtocolLayout = true) only when a
        // specialized hanging protocol is active — MPR, PT/CT fusion, etc.
        // These protocols display the same series in multiple orientations
        // (axial/coronal/sagittal) and updating one viewport must cascade
        // to all siblings that share the same displaySetSelector so the
        // multi-planar view stays consistent.
        // For the default layout (no special protocol), pass false to avoid
        // unwanted cascading across unrelated viewports.
        const useHpCascading =
          document.body.classList.contains('hp-mpr-active') ||
          document.body.classList.contains('hp-ptct-active');
        updatedViewports = hangingProtocolService.getViewportsRequireUpdate(
          viewportId,
          displaySetInstanceUID,
          useHpCascading
        );
      } catch (error) {
        console.warn(error);
        uiNotificationService.show({
          title: 'Drag and Drop',
          message:
            "Il display set selezionato non può essere aggiunto alla viewport a causa di un'incongruenza con le regole dell'Hanging Protocol.",
          type: 'info',
          duration: 3000,
        });
      }

      return updatedViewports;
    },
    [hangingProtocolService, uiNotificationService]
  );

  // Using Hanging protocol engine to match the displaySets
  useEffect(() => {
    const { unsubscribe } = hangingProtocolService.subscribe(
      hangingProtocolService.EVENTS.PROTOCOL_CHANGED,
      ({ protocol, stage, activeStudyUID, viewportMatchDetails }) => {
        updateDisplaySetsFromProtocol(protocol, stage, activeStudyUID, viewportMatchDetails);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Drag-and-drop compatibility: when a thumbnail drag starts (custom event
  // from Thumbnail.tsx), validate each viewport pane against the HP rules
  // and tag compatible ones with data-drop-compatible="true". CSS uses this
  // for green/red visual feedback. Runs only in PT/CT mode.
  useEffect(() => {
    const onDragStart = (e: any) => {
      if (!document.body.classList.contains('hp-ptct-active')) return;
      const dsUID = e?.detail?.displaySetInstanceUID;
      if (!dsUID) return;
      document.querySelectorAll<HTMLElement>('.viewport-parent-div[data-viewport-modalities]')
        .forEach(el => {
          // Find the viewport id from the pane's key structure. Each pane
          // wraps children with data-cy="viewport-pane". The pane itself
          // doesn't expose viewportId directly, but we can iterate our
          // viewports map and match by modalities + position.
          // Simpler approach: try getViewportsRequireUpdate for each viewport.
        });
      // Iterate all known viewport ids and validate.
      const state = viewportGridService.getState();
      const allViewports = state?.viewports ? Array.from((state.viewports as Map<string, any>).entries()) : [];
      const compatibleIds = new Set<string>();
      allViewports.forEach(([vpId]) => {
        try {
          const result = hangingProtocolService.getViewportsRequireUpdate(
            vpId, dsUID, true
          );
          if (result && result.length > 0) {
            compatibleIds.add(vpId);
          }
        } catch (_) {
          // HP rejected → not compatible
        }
      });
      // Tag DOM elements: find viewport-parent-div panes and mark them.
      // ViewportPane doesn't expose viewportId as data attribute, so we
      // add one now based on position in the grid.
      allViewports.forEach(([vpId], idx) => {
        const panes = document.querySelectorAll<HTMLElement>('.viewport-parent-div[data-viewport-modalities]');
        const el = panes[idx];
        if (!el) return;
        el.dataset.dropCompatible = compatibleIds.has(vpId) ? 'true' : 'false';
      });
    };
    const onDragEnd = () => {
      document.querySelectorAll<HTMLElement>('[data-drop-compatible]').forEach(el => {
        delete el.dataset.dropCompatible;
      });
    };
    document.addEventListener('mdv-drag-start', onDragStart);
    document.addEventListener('mdv-drag-end', onDragEnd);
    return () => {
      document.removeEventListener('mdv-drag-start', onDragStart);
      document.removeEventListener('mdv-drag-end', onDragEnd);
    };
  }, [hangingProtocolService, viewportGridService]);

  // Check viewport readiness in useEffect
  useEffect(() => {
    const allReady = viewportGridService.getGridViewportsReady();
    const sameLayoutHash = layoutHash.current === generateLayoutHash();
    if (allReady && !sameLayoutHash) {
      layoutHash.current = generateLayoutHash();
      viewportGridService.publishViewportsReady();
    }
  }, [viewportGridService, generateLayoutHash]);

  useEffect(() => {
    const { unsubscribe } = measurementService.subscribe(
      MeasurementService.EVENTS.JUMP_TO_MEASUREMENT_LAYOUT,
      ({ viewportId, measurement, isConsumed }) => {
        if (isConsumed) {
          return;
        }
        // This occurs when no viewport has elected to consume the event
        // so we need to change layouts into a layout which can consume
        // the event.
        const { displaySetInstanceUID: referencedDisplaySetInstanceUID } = measurement;

        const updatedViewports = _getUpdatedViewports(viewportId, referencedDisplaySetInstanceUID);
        if (!updatedViewports[0]) {
          console.warn(
            'ViewportGrid::Unable to navigate to viewport containing',
            referencedDisplaySetInstanceUID
          );
          return;
        }

        // Arbitrarily assign the viewport to element 0
        // TODO - this should perform a search to find the most suitable viewport.
        updatedViewports[0] = { ...updatedViewports[0] };
        const [viewport] = updatedViewports;

        // Copy the viewport options to prevent modifying the internal data
        viewport.viewportOptions = {
          ...viewport.viewportOptions,
          orientation: 'acquisition',
          // The preferred way to jump to the measurement view is to set the
          // view reference, as this can hold information such as the orientation
          // or zoom level required to display an annotation.  The metadata attribute
          // of the measurement is a viewReference, so use it to show the measurement.
          // Longer term this should clear the view reference data
          viewReference: measurement.metadata,
          viewportType: measurement.metadata.volumeId ? 'volume' : null,
        };

        viewportGridService.setDisplaySetsForViewports(updatedViewports);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [viewports]);

  const onDropHandler = (viewportId, { displaySetInstanceUID }) => {
    const customOnDropHandler = customizationService.getCustomization('customOnDropHandler');
    const dropHandlerPromise = customOnDropHandler({
      ...props,
      viewportId,
      displaySetInstanceUID,
      appConfig,
    });

    dropHandlerPromise.then(({ handled }) => {
      if (!handled) {
        const updatedViewports = _getUpdatedViewports(viewportId, displaySetInstanceUID);

        // Preserva la Sottogriglia (Montage) attiva sulla viewport di drop:
        // l'Hanging Protocol rigenera `viewportOptions` SENZA `montage`, quindi
        // a volte la sottogriglia spariva (comportamento incoerente). La
        // riapplichiamo SEMPRE alla viewport di destinazione → trascinare una
        // serie la carica dentro la sottogriglia (ripartendo dalla 1ª immagine).
        try {
          const current = viewportGridService.getState().viewports.get(viewportId);
          const montage = current?.viewportOptions?.montage;
          if (montage?.enabled) {
            updatedViewports.forEach(uv => {
              if (uv.viewportId === viewportId) {
                uv.viewportOptions = {
                  ...(uv.viewportOptions || {}),
                  montage: { ...montage, firstImageIndex: 0 },
                };
              }
            });
          }
        } catch (e) {
          /* best-effort: in caso di problemi lascia il comportamento di default */
        }

        viewportGridService.setDisplaySetsForViewports(updatedViewports);
      }
    });
  };

  const getViewportPanes = useCallback(() => {
    const viewportPanes = [];

    const numViewportPanes = viewportGridService.getNumViewportPanes();
    for (let i = 0; i < numViewportPanes; i++) {
      const paneMetadata = Array.from(viewports.values())[i] || {};
      const {
        displaySetInstanceUIDs,
        viewportOptions,
        displaySetOptions, // array of options for each display set in the viewport
        x: viewportX,
        y: viewportY,
        width: viewportWidth,
        height: viewportHeight,
        viewportLabel,
      } = paneMetadata;

      const viewportId = viewportOptions.viewportId;
      const isActive = activeViewportId === viewportId;

      const displaySetInstanceUIDsToUse = displaySetInstanceUIDs || [];

      // This is causing the viewport components re-render when the activeViewportId changes
      const displaySets = displaySetInstanceUIDsToUse
        .map(displaySetInstanceUID => {
          return displaySetService.getDisplaySetByUID(displaySetInstanceUID) || {};
        })
        .filter(displaySet => {
          return !displaySet?.unsupported;
        });

      const ViewportComponent = _getViewportComponent(
        displaySets,
        viewportComponents,
        uiNotificationService
      );

      // look inside displaySets to see if they need reRendering
      const displaySetsNeedsRerendering = displaySets.some(displaySet => {
        return displaySet.needsRerendering;
      });

      const onInteractionHandler = event => {
        if (isActive) {
          return;
        }

        if (event && (appConfig?.activateViewportBeforeInteraction ?? true)) {
          event.preventDefault();
          event.stopPropagation();
        }

        viewportGridService.setActiveViewportId(viewportId);
      };

      const getBorderStyle = viewportIndex => {
        const style = {} as any;
        const layoutOptions = viewportGridService.getLayoutOptionsFromState(
          viewportGridService.getState()
        );
        const vp = layoutOptions[viewportIndex];
        if (!vp) {
          return style;
        }
        const { x, y, width, height } = vp;
        const tolerance = 0.01;

        if (x + width < 1 - tolerance) {
          style.borderRight = '1px solid #3a3f99';
        }

        if (y + height < 1 - tolerance) {
          style.borderBottom = '1px solid #3a3f99';
        }

        return style;
      };

      // Collect the modalities of display sets currently shown in this
      // viewport so CSS can highlight/dim during drag-and-drop based on
      // compatibility (e.g. PT viewport accepts only PT series).
      const viewportModalitiesArr = displaySets
        .map(ds => ds?.Modality)
        .filter(Boolean);
      const viewportModalities = viewportModalitiesArr.join(',');
      // Fusion viewports show 2+ different modalities overlaid (CT+PT) —
      // dropping a single series there doesn't make sense. MIP viewport
      // is also read-only (shows the PT MIP projection). Mark these as
      // not droppable so CSS always dims them during drag.
      const uniqueModalities = new Set(viewportModalitiesArr);
      const toolGroupId = viewportOptions?.toolGroupId || '';
      const isNoDrop =
        uniqueModalities.size > 1 || toolGroupId === 'mipToolGroup';

      viewportPanes[i] = (
        <ViewportPane
          // Note: It is highly important that the key is the viewportId here,
          // since it is used to determine if the component should be re-rendered
          // by React, and also in the hanging protocol and stage changes if the
          // same viewportId is used, React, by default, will only move (not re-render)
          // those components. For instance, if we have a 2x3 layout, and we move
          // from 2x3 to 1x1 (second viewport), if the key is the viewportIndex,
          // React will RE-RENDER the resulting viewport as the key will be different.
          // however, if the key is the viewportId, React will only move the component
          // and not re-render it.
          key={viewportId}
          acceptDropsFor="displayset"
          onDrop={onDropHandler.bind(null, viewportId)}
          onInteraction={onInteractionHandler}
          data-viewport-modalities={viewportModalities}
          data-viewport-nodrop={isNoDrop ? 'true' : undefined}
          customStyle={{
            position: 'absolute',
            top: viewportY * 100 + '%',
            left: viewportX * 100 + '%',
            width: viewportWidth * 100 + '%',
            height: viewportHeight * 100 + '%',
            ...getBorderStyle(i),
          }}
          isActive={isActive}
        >
          <div
            data-cy="viewport-pane"
            className="flex h-full w-full min-w-[5px] flex-col"
          >
            <ViewportComponent
              displaySets={displaySets}
              viewportLabel={viewports.size > 1 ? viewportLabel : ''}
              viewportId={viewportId}
              dataSource={dataSource}
              viewportOptions={viewportOptions}
              displaySetOptions={displaySetOptions}
              needsRerendering={displaySetsNeedsRerendering}
              isHangingProtocolLayout={isHangingProtocolLayout}
              onElementEnabled={() => {
                viewportGridService.setViewportIsReady(viewportId, true);
              }}
            />
          </div>
        </ViewportPane>
      );
    }

    return viewportPanes;
  }, [viewports, activeViewportId, viewportComponents, dataSource]);

  /**
   * Loading indicator until numCols and numRows are gotten from the HangingProtocolService
   */
  if (!numRows || !numCols) {
    return null;
  }

  return (
    <div
      ref={resizeRef}
      className="border-secondary-light h-full w-full border"
    >
      <ViewportGrid
        numRows={numRows}
        numCols={numCols}
      >
        {getViewportPanes()}
      </ViewportGrid>
    </div>
  );
}

function _getViewportComponent(displaySets, viewportComponents, uiNotificationService) {
  if (!displaySets || !displaySets.length) {
    return EmptyViewport;
  }

  // Todo: Do we have a viewport that has two different SOPClassHandlerIds?
  const SOPClassHandlerId = displaySets[0].SOPClassHandlerId;

  for (let i = 0; i < viewportComponents.length; i++) {
    if (!viewportComponents[i]) {
      throw new Error('viewport components not defined');
    }
    if (!viewportComponents[i].displaySetsToDisplay) {
      throw new Error('displaySetsToDisplay is null');
    }
    if (viewportComponents[i].displaySetsToDisplay.includes(SOPClassHandlerId)) {
      const { component } = viewportComponents[i];
      return component;
    }
  }

  console.log("Can't show displaySet", SOPClassHandlerId, displaySets[0]);
  uiNotificationService.show({
    title: 'Viewport Not Supported Yet',
    message: `Cannot display SOPClassUID of ${displaySets[0].SOPClassUID} yet`,
    type: 'error',
  });

  return EmptyViewport;
}

export default ViewerViewportGrid;
