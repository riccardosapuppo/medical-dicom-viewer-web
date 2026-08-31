/* eslint-disable prettier/prettier */
import {
  getEnabledElement,
  getRenderingEngine,
  StackViewport,
  VolumeViewport,
  utilities as csUtils,
  Types as CoreTypes,
  cache,
  BaseVolumeViewport,
  eventTarget as csEventTarget,
  Enums as CoreEnums,
  metaData,
} from '@cornerstonejs/core';
import {
  ToolGroupManager,
  Enums,
  utilities as cstUtils,
  ReferenceLinesTool,
  annotation,
} from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';
import * as labelmapInterpolation from '@cornerstonejs/labelmap-interpolation';
import { useToggleOneUpViewportGridStore } from '@ohif/extension-default';
import { Types as OhifTypes, utils } from '@ohif/core';
import i18n from '@ohif/i18n';
import {
  callInputDialogAutoComplete,
  createReportAsync,
  colorPickerDialog,
  callInputDialog,
} from '@ohif/extension-default';
import { vec3, mat4 } from 'gl-matrix';
import toggleImageSliceSync from './utils/imageSliceSync/toggleImageSliceSync';
import { getFirstAnnotationSelected } from './utils/measurementServiceMappings/utils/selection';
import getActiveViewportEnabledElement from './utils/getActiveViewportEnabledElement';
import toggleVOISliceSync from './utils/toggleVOISliceSync';
import { usePositionPresentationStore, useSegmentationPresentationStore } from './stores';
import HangingProtocolManagerModal from './components/HangingProtocolManager/HangingProtocolManagerModal';
import { toolNames } from './initCornerstoneTools';
import CornerstoneViewportDownloadForm from './utils/CornerstoneViewportDownloadForm';
import { updateSegmentBidirectionalStats } from './utils/updateSegmentationStats';
import { generateSegmentationCSVReport } from './utils/generateSegmentationCSVReport';
const { DefaultHistoryMemo } = csUtils.HistoryMemo;

// Fix inversione mammografia: cornerstone resetProperties() ricalcola l'invert dal solo
// PhotometricInterpretation e IGNORA PresentationLUTShape=INVERSE. Sulle MONOCHROME1 (tipico
// della mammografia "For Presentation") questo riportava a video la polarita' INVERTITA
// (sfondo bianco) dopo il Reset, pur essendo il display corretto a sfondo nero. Per QUESTE
// immagini preserviamo la polarita' corretta che c'era prima del reset; sulle altre
// (MONOCHROME2 = quasi tutto) NON cambiamo nulla -> nessuna regressione.
const _isMonochrome1Viewport = viewport => {
  try {
    const imageId =
      typeof viewport?.getCurrentImageId === 'function' ? viewport.getCurrentImageId() : null;
    if (!imageId) {
      return false;
    }
    const pm = metaData.get('imagePixelModule', imageId);
    return String(pm?.photometricInterpretation || '').toUpperCase() === 'MONOCHROME1';
  } catch (err) {
    return false;
  }
};

const _resetViewportKeepingMono1Invert = viewport => {
  const isMono1 = _isMonochrome1Viewport(viewport);
  viewport.resetProperties?.();
  viewport.resetCamera?.();
  // Fix inversione MONOCHROME1 (mammografia). resetProperties() ripristina i nodi
  // NON-invertiti della transfer function (initialTransferFunctionNodes, catturati prima
  // dell'invert iniziale) e il suo setInvertColor(true) e' un no-op (flag gia' true),
  // quindi il display tornava invertito (sfondo bianco) pur restando invert===true.
  // Forzando la ricostruzione della LUT, cornerstone ri-applica l'invert corrente
  // (flag true) rigenerando la TF invertita = display corretto. Solo per MONOCHROME1
  // (verificato sui DICOM del cliente) → nessun impatto sulle altre immagini.
  if (isMono1 && typeof viewport.setVOI === 'function') {
    try {
      const voiRange = viewport.getProperties?.()?.voiRange;
      viewport.setVOI(voiRange, { forceRecreateLUTFunction: true });
    } catch (err) {
      /* best-effort: se l'API cornerstone cambia, il reset resta comunque funzionante */
    }
  }
};

const toggleSyncFunctions = {
  imageSlice: toggleImageSliceSync,
  voi: toggleVOISliceSync,
};

const debounceTime = 200;
let debounceTimeout;

/**
 * Modalita' "storico affiancato": lo studio precedente vive in un iframe
 * (#iframe-storico) con la propria toolbar nascosta via CSS. Ogni comando
 * lanciato dallo studio principale (toolbar o scorciatoia) viene inoltrato
 * all'iframe, che lo esegue sulla propria viewport attiva.
 * Il messaggio e' l'id del bottone di toolbar (o un nome comando storico);
 * per i comandi con parametri si usa {type: 'mdv-storico-command', ...}.
 * Lato iframe la gestione sta in public/estensioni/aperturaStorico.
 */
function _postToStorico(message: unknown) {
  const iframeStorico = document.getElementById('iframe-storico') as HTMLIFrameElement | null;
  if (!iframeStorico?.contentWindow) {
    return;
  }
  try {
    iframeStorico.contentWindow.postMessage(message, window.location.origin);
  } catch (err) {
    console.warn('Storico: inoltro comando fallito', err);
  }
}

function commandsModule({
  servicesManager,
  commandsManager,
}: OhifTypes.Extensions.ExtensionParams): OhifTypes.Extensions.CommandsModule {
  const {
    viewportGridService,
    toolGroupService,
    cineService,
    uiDialogService,
    cornerstoneViewportService,
    uiNotificationService,
    measurementService,
    customizationService,
    colorbarService,
    hangingProtocolService,
    displaySetService,
    syncGroupService,
    segmentationService,
  } = servicesManager.services as AppTypes.Services;

  const { measurementServiceSource } = this;

  function _getActiveViewportEnabledElement() {
    return getActiveViewportEnabledElement(viewportGridService);
  }

  /**
   * Se la viewport attiva è in modalità Sottogriglia (Montage), restituisce le
   * cornerstone-viewport di TUTTE le celle (più la "primary" = cella 0, che ha
   * l'id della viewport OHIF). Serve per applicare invert/rotate/flip/reset a
   * tutte le celle insieme (coerenza visiva della sottogriglia). Altrimenti null.
   */
  function _getMontageCells() {
    const activeViewportId = viewportGridService.getActiveViewportId();
    const vp = viewportGridService.getState().viewports.get(activeViewportId);
    if (vp?.viewportOptions?.montage?.enabled !== true) {
      return null;
    }
    // Le celle vivono nell'engine DEDICATO della sottogriglia (non nel principale).
    const re = getRenderingEngine(`ohif-montage-${activeViewportId}`);
    if (!re) {
      return null;
    }
    const prefix = `${activeViewportId}::montage::`;
    const cells = re
      .getViewports()
      .filter(v => v.id === activeViewportId || v.id.startsWith(prefix));
    if (!cells.length) {
      return null;
    }
    const primary = re.getViewport(activeViewportId) || cells[0];
    return { cells, primary };
  }

  function _getActiveViewportToolGroupId() {
    const viewport = _getActiveViewportEnabledElement();
    return toolGroupService.getToolGroupForViewport(viewport.id);
  }

  function _getActiveSegmentationInfo() {
    const viewportId = viewportGridService.getActiveViewportId();
    const activeSegmentation = segmentationService.getActiveSegmentation(viewportId);
    const segmentationId = activeSegmentation?.segmentationId;
    const activeSegmentIndex = segmentationService.getActiveSegment(viewportId).segmentIndex;

    return {
      segmentationId,
      segmentIndex: activeSegmentIndex,
    };
  }

  let isMprClicked = false;

  //Salvo lo stato attuale
  const storeState = () => {
    if (
      document.body.classList.contains('hp-mpr-active') ||
      document.body.classList.contains('loading-spinner-into-grid')
    ) {
      return;
    } //Salvo lo stato solo in modalità NON MPR
    window.storedState = true;
    const viewportGridState = viewportGridService.getState();
    const { setToggleOneUpViewportGridStore } = useToggleOneUpViewportGridStore.getState();
    setToggleOneUpViewportGridStore(viewportGridState);
  };

  // Injects a non-invasive rotation bar on the MIP viewport of the PT/CT
  // hanging protocol. Rotation via mouse wheel / left-drag isn't discoverable,
  // so we show small ◀ / ▶ buttons with the current angle in degrees.
  // Idempotent and safe to call multiple times.
  const injectMipRotationOverlay = () => {
    try {
      const tgSvc = toolGroupService!;
      const csSvc = cornerstoneViewportService!;
      const mipToolGroup = tgSvc.getToolGroup('mipToolGroup') as any;
      if (!mipToolGroup) {
        return;
      }
      const viewportsInfo = mipToolGroup.viewportsInfo || [];
      viewportsInfo.forEach(({ viewportId }: { viewportId: string }) => {
        const viewport: any = csSvc.getCornerstoneViewport(viewportId);
        const element: HTMLElement | undefined = viewport?.element;
        if (!element) {
          return;
        }
        if (element.querySelector('.mdv-mip-rotate-overlay')) {
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'mdv-mip-rotate-overlay';
        overlay.innerHTML = `
          <button class="mdv-mip-rotate-btn" data-dir="-1" type="button" title="Ruota a sinistra">◀</button>
          <span class="mdv-mip-rotate-angle">0°</span>
          <button class="mdv-mip-rotate-btn" data-dir="1" type="button" title="Ruota a destra">▶</button>
        `;
        overlay.style.cssText = [
          'position:absolute',
          'bottom:10px',
          'left:50%',
          'transform:translateX(-50%)',
          'display:flex',
          'align-items:center',
          'gap:6px',
          'background:rgba(20,20,20,0.65)',
          'color:#fff',
          'padding:4px 10px',
          'border-radius:14px',
          'font-size:12px',
          'z-index:20',
          'pointer-events:auto',
          'user-select:none',
          'backdrop-filter:blur(2px)',
          'border:1px solid rgba(255,255,255,0.15)',
        ].join(';');

        const btnStyle = [
          'background:transparent',
          'border:0',
          'color:#fff',
          'cursor:pointer',
          'font-size:14px',
          'line-height:1',
          'padding:2px 6px',
          'border-radius:4px',
        ].join(';');
        overlay
          .querySelectorAll<HTMLButtonElement>('.mdv-mip-rotate-btn')
          .forEach(btn => {
            btn.setAttribute('style', btnStyle);
            btn.addEventListener('mouseenter', () => {
              btn.style.background = 'rgba(255,255,255,0.15)';
            });
            btn.addEventListener('mouseleave', () => {
              btn.style.background = 'transparent';
            });
          });

        const angleLabel = overlay.querySelector(
          '.mdv-mip-rotate-angle'
        ) as HTMLSpanElement;

        // Rotation around Z axis leaves viewUp unchanged (when viewUp itself is
        // along Z), so viewport.getRotation() stays at 0. Compute the azimuth
        // of the camera position projected onto the XY plane instead, and show
        // it as delta from the first observed state.
        let initialAzimuthDeg: number | null = null;
        const computeAzimuthDeg = (vp: any): number | null => {
          if (!vp || typeof vp.getCamera !== 'function') {
            return null;
          }
          const { position, focalPoint } = vp.getCamera();
          if (!position || !focalPoint) {
            return null;
          }
          const dx = position[0] - focalPoint[0];
          const dy = position[1] - focalPoint[1];
          return (Math.atan2(dy, dx) * 180) / Math.PI;
        };
        const refreshAngleLabel = () => {
          const vp: any = csSvc.getCornerstoneViewport(viewportId);
          const az = computeAzimuthDeg(vp);
          if (az === null) {
            return;
          }
          if (initialAzimuthDeg === null) {
            initialAzimuthDeg = az;
          }
          let delta = az - initialAzimuthDeg;
          delta = ((delta % 360) + 360) % 360;
          if (angleLabel) {
            angleLabel.textContent = `${Math.round(delta)}°`;
          }
        };
        // Keep the label in sync whenever the camera changes (wheel rotation,
        // left-drag rotation, protocol reapply, etc.).
        const onCameraModified = () => refreshAngleLabel();
        element.addEventListener('CORNERSTONE_CAMERA_MODIFIED', onCameraModified);
        refreshAngleLabel();

        const rotateBy = (deltaDeg: number) => {
          const vp: any = csSvc.getCornerstoneViewport(viewportId);
          if (!vp || typeof vp.getCamera !== 'function') {
            return;
          }
          const camera = vp.getCamera();
          const { viewUp, position, focalPoint } = camera;
          const angle = (deltaDeg * Math.PI) / 180;
          const [cx, cy, cz] = focalPoint;
          // Rotate around the Z axis (same default axis used by VolumeRotateTool).
          const axis = [0, 0, 1] as [number, number, number];
          const transform = mat4.identity(new Float32Array(16));
          mat4.translate(transform, transform, [cx, cy, cz]);
          mat4.rotate(transform, transform, angle, axis);
          mat4.translate(transform, transform, [-cx, -cy, -cz]);
          const newPosition = vec3.transformMat4(vec3.create(), position, transform);
          const newFocalPoint = vec3.transformMat4(vec3.create(), focalPoint, transform);
          mat4.identity(transform);
          mat4.rotate(transform, transform, angle, axis);
          const newViewUp = vec3.transformMat4(vec3.create(), viewUp, transform);
          vp.setCamera({
            position: newPosition,
            viewUp: newViewUp,
            focalPoint: newFocalPoint,
          });
          vp.render();
          // setCamera fires CAMERA_MODIFIED which refreshes the label.
        };

        overlay.addEventListener('click', (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          if (!target.classList.contains('mdv-mip-rotate-btn')) {
            return;
          }
          e.stopPropagation();
          const dir = Number(target.getAttribute('data-dir')) || 0;
          if (dir !== 0) {
            rotateBy(dir * 15);
          }
        });

        // Prevent the viewport from receiving any of these events when they
        // happen on the overlay. Without this, a fast double-click on the
        // arrows is interpreted as a viewport double-click (toggleOneUp /
        // maximize) and the layout change destroys the overlay.
        const swallow = (e: Event) => {
          e.stopPropagation();
          if (typeof (e as MouseEvent).preventDefault === 'function') {
            (e as MouseEvent).preventDefault();
          }
        };
        ['pointerdown', 'mousedown', 'mouseup', 'dblclick'].forEach(evtName => {
          overlay.addEventListener(evtName, swallow);
        });

        element.appendChild(overlay);

        // Enable left-click drag to rotate the MIP horizontally. Similar
        // to TrackballRotate in the 3D volume viewport, but locked to the
        // horizontal axis (Z-axis rotation). VolumeRotateTool only handles
        // mouseWheel, not mouseDrag, so we wire this manually.
        if (!(element as any).__mdvMipDragRotate) {
          let isDragging = false;
          let lastX = 0;
          const sensitivity = 0.4; // degrees per pixel of horizontal movement

          // Default cursor for MIP viewport: grab hand to hint "you can
          // drag to rotate". Switches to grabbing while dragging, then
          // back to grab on release.
          element.style.cursor = 'grab';

          const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement)?.closest?.('.mdv-mip-rotate-overlay')) return;
            isDragging = true;
            lastX = e.clientX;
            element.style.cursor = 'grabbing';
          };
          const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const deltaX = e.clientX - lastX;
            if (Math.abs(deltaX) < 1) return;
            lastX = e.clientX;
            rotateBy(deltaX * sensitivity);
          };
          const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            element.style.cursor = 'grab';
          };

          element.addEventListener('mousedown', onMouseDown);
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
          (element as any).__mdvMipDragRotate = true;
        }
      });
    } catch (err) {
      console.warn('MIP rotation overlay injection failed:', err);
    }
  };

  const restoreState = () => {
    if (!window.storedState) {
      return;
    }
    const viewportGridState = viewportGridService.getState();
    const { activeViewportId, viewports, layout, isHangingProtocolLayout } = viewportGridState;
    const { displaySetInstanceUIDs, displaySetOptions, viewportOptions } =
      viewports.get(activeViewportId);
    //Permetto di ripristinare lo stato una volta sola, per ripristinarlo una seconda volta occorre fare un nuovo storeState

    const { toggleOneUpViewportGridStore } = useToggleOneUpViewportGridStore.getState();

    if (!toggleOneUpViewportGridStore) {
      return;
    }
    // There is a state to toggle back to. The viewport that was
    // originally toggled to one up was the former active viewport.
    const viewportIdToUpdate = toggleOneUpViewportGridStore.activeViewportId;

    // We are restoring the previous layout but taking into the account that
    // the current one up viewport might have a new displaySet dragged and dropped on it.
    // updatedViewportsViaHP below contains the viewports applicable to the HP that existed
    // prior to the toggle to one-up - including the updated viewports if a display
    // set swap were to have occurred.
    const layoutOptions = viewportGridService.getLayoutOptionsFromState(
      toggleOneUpViewportGridStore
    );

    const findOrCreateViewport = (position: number, positionId: string) => {
      // Find the viewport for the given position prior to the toggle to one-up.
      const preOneUpViewport = Array.from(toggleOneUpViewportGridStore.viewports.values()).find(
        viewport => viewport.positionId === positionId
      );

      return preOneUpViewport;
    };

    viewportGridService.setLayout({
      numRows: toggleOneUpViewportGridStore.layout.numRows,
      numCols: toggleOneUpViewportGridStore.layout.numCols,
      activeViewportId: viewportIdToUpdate,
      layoutOptions,
      findOrCreateViewport,
      isHangingProtocolLayout: false,
    });
  }

  const _restoreState = () => {
    if (!window.storedState) {
      return;
    }
    //Permetto di ripristinare lo stato una volta sola, per ripristinarlo una seconda volta occorre fare un nuovo storeState

    // window.storedState = false;

    const { toggleOneUpViewportGridStore } = stateSyncService.getState();

    //Se è zero vuol dire che sto provando a ripristinare uno stato in cui era stato fatto doppio click sulla viewport e quindi
    //per ripristinarlo il metodo è differente
    if (Object.entries(toggleOneUpViewportGridStore).length === 0) {
      const viewportGridState = viewportGridService.getState();
      const { activeViewportId, viewports } = viewportGridState;
      const { displaySetInstanceUIDs, displaySetOptions, viewportOptions } =
        viewports.get(activeViewportId);

      const findOrCreateViewport = () => {
        return {
          displaySetInstanceUIDs,
          displaySetOptions,
          viewportOptions,
        };
      };

      // Set the layout to be 1x1/one-up.
      viewportGridService.setLayout({
        numRows: 1,
        numCols: 1,
        findOrCreateViewport,
        isHangingProtocolLayout: true,
      });
    } else {
      const viewportIdToUpdate = toggleOneUpViewportGridStore.activeViewportId;
      const layoutOptions = viewportGridService.getLayoutOptionsFromState(
        toggleOneUpViewportGridStore
      );

      const findOrCreateViewport = (position: number, positionId: string) => {
        // Find the viewport for the given position prior to the toggle to one-up.
        const preOneUpViewport = Array.from(toggleOneUpViewportGridStore.viewports.values()).find(
          viewport => viewport.positionId === positionId
        );

        return preOneUpViewport;
      };

      viewportGridService.setLayout({
        numRows: toggleOneUpViewportGridStore.layout.numRows,
        numCols: toggleOneUpViewportGridStore.layout.numCols,
        activeViewportId: viewportIdToUpdate,
        layoutOptions,
        findOrCreateViewport,
        isHangingProtocolLayout: false,
      });
    }
  };

  const actions = {
    /**
     * Sceglie il layout della sottogriglia in base al numero di immagini della
     * serie, con un massimo di 8 celle (grid il più possibile "quadrata" ma in
     * orizzontale: rows <= cols).
     */
    _computeMontageLayout: (total: number) => {
      const cells = Math.min(Math.max(total || 1, 1), 8);
      if (cells <= 1) {
        return { rows: 1, cols: 1 };
      }
      if (cells === 2) {
        return { rows: 1, cols: 2 };
      }
      if (cells === 3) {
        return { rows: 1, cols: 3 };
      }
      if (cells === 4) {
        return { rows: 2, cols: 2 };
      }
      if (cells <= 6) {
        return { rows: 2, cols: 3 };
      }
      return { rows: 2, cols: 4 }; // 7-8 celle
    },

    /** Numero di immagini della serie mostrata nella viewport attiva. */
    _getActiveSeriesImageCount: vp => {
      const dsUID = vp?.displaySetInstanceUIDs?.[0];
      if (!dsUID) {
        return 0;
      }
      const ds = displaySetService.getDisplaySetByUID(dsUID);
      return ds?.numImageFrames || ds?.instances?.length || ds?.images?.length || 0;
    },

    /**
     * Attiva/disattiva la Sottogriglia (Montage) sulla viewport attiva.
     * Senza rows/cols espliciti sceglie il layout in automatico in base al
     * numero di istanze della serie (max 8 celle). Non crea viewport OHIF
     * aggiuntive: imposta solo viewportOptions.montage.
     */
    toggleMontage: ({ rows, cols } = {}) => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('MontageAuto');

      const activeViewportId = viewportGridService.getActiveViewportId();
      const { viewports } = viewportGridService.getState();
      const vp = viewports.get(activeViewportId);
      if (!vp) {
        return;
      }

      const isOn = vp.viewportOptions?.montage?.enabled === true;

      if (isOn) {
        actions.disableMontage();
        return;
      }

      let layout = rows && cols ? { rows, cols } : null;
      if (!layout) {
        const total = actions._getActiveSeriesImageCount(vp);
        layout = actions._computeMontageLayout(total);
      }

      viewportGridService.setDisplaySetsForViewports([
        {
          viewportId: activeViewportId,
          displaySetInstanceUIDs: vp.displaySetInstanceUIDs,
          viewportOptions: {
            ...vp.viewportOptions,
            montage: { enabled: true, ...layout, firstImageIndex: 0 },
          },
          displaySetOptions: vp.displaySetOptions,
        },
      ]);
      servicesManager.services.toolbarService?.refreshToolbarState?.({
        viewportId: activeViewportId,
      });
    },

    /** Disattiva la sottogriglia sulla viewport attiva (torna allo stack). */
    disableMontage: () => {
      const activeViewportId = viewportGridService.getActiveViewportId();
      const { viewports } = viewportGridService.getState();
      const vp = viewports.get(activeViewportId);
      if (!vp) {
        return;
      }
      viewportGridService.setDisplaySetsForViewports([
        {
          viewportId: activeViewportId,
          displaySetInstanceUIDs: vp.displaySetInstanceUIDs,
          viewportOptions: {
            ...vp.viewportOptions,
            montage: { enabled: false },
          },
          displaySetOptions: vp.displaySetOptions,
        },
      ]);
      servicesManager.services.toolbarService?.refreshToolbarState?.({
        viewportId: activeViewportId,
      });
    },

    /**
     * Imposta il layout della sottogriglia (righe×colonne) sulla viewport attiva,
     * attivando la montage se non già attiva.
     */
    setMontageLayout: ({ rows, cols }) => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico({
        type: 'mdv-storico-command',
        commandName: 'setMontageLayout',
        commandOptions: { rows, cols },
      });

      const activeViewportId = viewportGridService.getActiveViewportId();
      const { viewports } = viewportGridService.getState();
      const vp = viewports.get(activeViewportId);
      if (!vp || !rows || !cols) {
        return;
      }

      const prevMontage = vp.viewportOptions?.montage || {};

      viewportGridService.setDisplaySetsForViewports([
        {
          viewportId: activeViewportId,
          displaySetInstanceUIDs: vp.displaySetInstanceUIDs,
          viewportOptions: {
            ...vp.viewportOptions,
            montage: {
              ...prevMontage,
              enabled: true,
              rows,
              cols,
              firstImageIndex: prevMontage.firstImageIndex || 0,
            },
          },
          displaySetOptions: vp.displaySetOptions,
        },
      ]);
    },

    runSegmentBidirectional: async ({ segmentationId, segmentIndex } = {}) => {
      // Get active segmentation if not specified
      const targetSegmentation =
        segmentationId && segmentIndex
          ? { segmentationId, segmentIndex }
          : _getActiveSegmentationInfo();

      const { segmentationId: targetId, segmentIndex: targetIndex } = targetSegmentation;

      // Get bidirectional measurement data
      const bidirectionalData = await cstUtils.segmentation.getSegmentLargestBidirectional({
        segmentationId: targetId,
        segmentIndices: [targetIndex],
      });

      const activeViewportId = viewportGridService.getActiveViewportId();

      // Process each bidirectional measurement
      bidirectionalData.forEach(measurement => {
        const { segmentIndex, majorAxis, minorAxis } = measurement;

        // Create annotation
        const annotation = cornerstoneTools.SegmentBidirectionalTool.hydrate(
          activeViewportId,
          [majorAxis, minorAxis],
          {
            segmentIndex,
            segmentationId: targetId,
          }
        );

        // Update segmentation stats
        const updatedSegmentation = updateSegmentBidirectionalStats({
          segmentationId: targetId,
          segmentIndex: targetIndex,
          bidirectionalData: measurement,
          segmentationService,
          annotation,
        });

        // Save changes if needed
        if (updatedSegmentation) {
          segmentationService.addOrUpdateSegmentation({
            segmentationId: targetId,
            segments: updatedSegmentation.segments,
          });
        }
      });
    },
    interpolateLabelmap: () => {
      const { segmentationId, segmentIndex } = _getActiveSegmentationInfo();
      labelmapInterpolation.interpolate({
        segmentationId,
        segmentIndex,
      });
    },
    /**
     * Generates the selector props for the context menu, specific to
     * the cornerstone viewport, and then runs the context menu.
     */
    showCornerstoneContextMenu: options => {
      const element = _getActiveViewportEnabledElement()?.viewport?.element;

      const optionsToUse = { ...options, element };
      const { useSelectedAnnotation, nearbyToolData, event } = optionsToUse;

      // This code is used to invoke the context menu via keyboard shortcuts
      if (useSelectedAnnotation && !nearbyToolData) {
        const firstAnnotationSelected = getFirstAnnotationSelected(element);
        // filter by allowed selected tools from config property (if there is any)
        const isToolAllowed =
          !optionsToUse.allowedSelectedTools ||
          optionsToUse.allowedSelectedTools.includes(firstAnnotationSelected?.metadata?.toolName);
        if (isToolAllowed) {
          optionsToUse.nearbyToolData = firstAnnotationSelected;
        } else {
          return;
        }
      }

      optionsToUse.defaultPointsPosition = [];
      // if (optionsToUse.nearbyToolData) {
      //   optionsToUse.defaultPointsPosition = commandsManager.runCommand(
      //     'getToolDataActiveCanvasPoints',
      //     { toolData: optionsToUse.nearbyToolData }
      //   );
      // }

      // TODO - make the selectorProps richer by including the study metadata and display set.
      optionsToUse.selectorProps = {
        toolName: optionsToUse.nearbyToolData?.metadata?.toolName,
        value: optionsToUse.nearbyToolData,
        uid: optionsToUse.nearbyToolData?.annotationUID,
        nearbyToolData: optionsToUse.nearbyToolData,
        event,
        ...optionsToUse.selectorProps,
      };

      commandsManager.run(options, optionsToUse);
    },
    updateStoredSegmentationPresentation: ({ displaySet, type }) => {
      const { addSegmentationPresentationItem } = useSegmentationPresentationStore.getState();

      const referencedDisplaySetInstanceUID = displaySet.referencedDisplaySetInstanceUID;
      addSegmentationPresentationItem(referencedDisplaySetInstanceUID, {
        segmentationId: displaySet.displaySetInstanceUID,
        hydrated: true,
        type,
      });
    },
    updateStoredPositionPresentation: ({
      viewportId,
      displaySetInstanceUID,
      referencedImageId,
    }) => {
      const presentations = cornerstoneViewportService.getPresentations(viewportId);
      const { positionPresentationStore, setPositionPresentation, getPositionPresentationId } =
        usePositionPresentationStore.getState();

      // Look inside positionPresentationStore and find the key that includes the displaySetInstanceUID
      // and the value has viewportId as activeViewportId.
      const previousReferencedDisplaySetStoreKey = Object.entries(positionPresentationStore).find(
        ([key, value]) => key.includes(displaySetInstanceUID) && value.viewportId === viewportId
      )?.[0];

      if (previousReferencedDisplaySetStoreKey) {
        const presentationData = referencedImageId
          ? {
            ...presentations.positionPresentation,
            viewReference: {
              referencedImageId,
            },
          }
          : presentations.positionPresentation;

        setPositionPresentation(previousReferencedDisplaySetStoreKey, presentationData);
        return;
      }

      // if not found means we have not visited that referencedDisplaySetInstanceUID before
      // so we need to grab the positionPresentationId directly from the store,
      // Todo: this is really hacky, we should have a better way for this

      const positionPresentationId = getPositionPresentationId({
        displaySetInstanceUIDs: [displaySetInstanceUID],
        viewportId,
      });

      setPositionPresentation(positionPresentationId, presentations.positionPresentation);
    },
    getNearbyToolData({ nearbyToolData, element, canvasCoordinates }) {
      return nearbyToolData ?? cstUtils.getAnnotationNearPoint(element, canvasCoordinates);
    },
    getNearbyAnnotation({ element, canvasCoordinates }) {
      const nearbyToolData = actions.getNearbyToolData({
        nearbyToolData: null,
        element,
        canvasCoordinates,
      });

      const isAnnotation = toolName => {
        const enabledElement = getEnabledElement(element);

        if (!enabledElement) {
          return;
        }

        const { renderingEngineId, viewportId } = enabledElement;
        const toolGroup = ToolGroupManager.getToolGroupForViewport(viewportId, renderingEngineId);

        const toolInstance = toolGroup.getToolInstance(toolName);

        return toolInstance?.constructor?.isAnnotation ?? true;
      };

      return nearbyToolData?.metadata?.toolName && isAnnotation(nearbyToolData.metadata.toolName)
        ? nearbyToolData
        : null;
    },
    /** Delete the given measurement */
    deleteMeasurement: ({ uid }) => {
      if (uid) {
        measurementServiceSource.remove(uid);
      }
    },
    /**
     * Common logic for handling measurement label updates through dialog
     * @param uid - measurement uid
     * @returns Promise that resolves when the label is updated
     */
    _handleMeasurementLabelDialog: async uid => {
      const labelConfig = customizationService.getCustomization('measurementLabels');
      const renderContent = customizationService.getCustomization('ui.labellingComponent');
      const measurement = measurementService.getMeasurement(uid);

      if (!measurement) {
        console.debug('No measurement found for label editing');
        return;
      }

      if (!labelConfig) {
        const label = await callInputDialog({
          uiDialogService,
          title: 'Edit Measurement Label',
          placeholder: measurement.label || 'Enter new label',
          defaultValue: measurement.label,
        });

        if (label !== undefined && label !== null) {
          measurementService.update(uid, { ...measurement, label }, true);
        }
        return;
      }

      const val = await callInputDialogAutoComplete({
        measurement,
        uiDialogService,
        labelConfig,
        renderContent,
      });

      if (val !== undefined && val !== null) {
        measurementService.update(uid, { ...val }, true);
      }
    },
    /**
     * Show the measurement labelling input dialog and update the label
     * on the measurement with a response if not cancelled.
     */
    setMeasurementLabel: async ({ uid }) => {
      await actions._handleMeasurementLabelDialog(uid);
    },
    renameMeasurement: async ({ uid }) => {
      await actions._handleMeasurementLabelDialog(uid);
    },
    /**
     *
     * @param props - containing the updates to apply
     * @param props.measurementKey - chooses the measurement key to apply the
     *        code to.  This will typically be finding or site to apply a
     *        finding code or a findingSites code.
     * @param props.code - A coding scheme value from DICOM, including:
     *       * CodeValue - the language independent code, for example '1234'
     *       * CodingSchemeDesignator - the issue of the code value
     *       * CodeMeaning - the text value shown to the user
     *       * ref - a string reference in the form `<designator>:<codeValue>`
     *       * type - defaulting to 'finding'.  Will replace other codes of same type
     *       * style - a styling object to use
     *       * Other fields
     *     Note it is a valid option to remove the finding or site values by
     *     supplying null for the code.
     * @param props.uid - the measurement UID to find it with
     * @param props.label - the text value for the code.  Has NOTHING to do with
     *        the measurement label, which can be set with textLabel
     * @param props.textLabel is the measurement label to apply.  Set to null to
     *            delete.
     *
     * If the measurementKey is `site`, then the code will also be added/replace
     * the 0 element of findingSites.  This behaviour is expected to be enhanced
     * in the future with ability to set other site information.
     */
    updateMeasurement: props => {
      const { code, uid, textLabel, label } = props;
      let { style } = props;
      const measurement = measurementService.getMeasurement(uid);
      if (!measurement) {
        console.warn('No measurement found to update', uid);
        return;
      }
      const updatedMeasurement = {
        ...measurement,
      };
      // Call it textLabel as the label value
      // TODO - remove the label setting when direct rendering of findingSites is enabled
      if (textLabel !== undefined) {
        updatedMeasurement.label = textLabel;
      }
      if (code !== undefined) {
        const measurementKey = code.type || 'finding';

        if (code.ref && !code.CodeValue) {
          const split = code.ref.indexOf(':');
          code.CodeValue = code.ref.substring(split + 1);
          code.CodeMeaning = code.text || label;
          code.CodingSchemeDesignator = code.ref.substring(0, split);
        }
        updatedMeasurement[measurementKey] = code;
        if (measurementKey !== 'finding') {
          if (updatedMeasurement.findingSites) {
            updatedMeasurement.findingSites = updatedMeasurement.findingSites.filter(
              it => it.type !== measurementKey
            );
            updatedMeasurement.findingSites.push(code);
          } else {
            updatedMeasurement.findingSites = [code];
          }
        }
      }

      style ||= updatedMeasurement.finding?.style;
      style ||= updatedMeasurement.findingSites?.find(site => site?.style)?.style;

      if (style) {
        // Reset the selected values to preserve appearance on selection
        style.lineDashSelected ||= style.lineDash;
        annotation.config.style.setAnnotationStyles(measurement.uid, style);

        // this is a bit ugly, but given the underlying behavior, this is how it needs to work.
        switch (measurement.toolName) {
          case toolNames.PlanarFreehandROI: {
            const targetAnnotation = annotation.state.getAnnotation(measurement.uid);
            targetAnnotation.data.isOpenUShapeContour = !!style.isOpenUShapeContour;
            break;
          }
          default:
            break;
        }
      }
      measurementService.update(updatedMeasurement.uid, updatedMeasurement, true);
    },

    /**
     * Jumps to the specified (by uid) measurement in the active viewport.
     * Also marks any provided display measurements isActive value
     */
    jumpToMeasurement: ({ uid, displayMeasurements = [] }) => {
      measurementService.jumpToMeasurement(viewportGridService.getActiveViewportId(), uid);
      for (const measurement of displayMeasurements) {
        measurement.isActive = measurement.uid === uid;
      }
    },

    removeMeasurement: ({ uid }) => {
      measurementService.remove(uid);
    },

    toggleLockMeasurement: ({ uid }) => {
      measurementService.toggleLockMeasurement(uid);
    },

    toggleVisibilityMeasurement: ({ uid }) => {
      measurementService.toggleVisibilityMeasurement(uid);
    },

    /**
     * Clear the measurements
     */
    clearMeasurements: options => {
      const { measurementFilter } = options;
      measurementService.clearMeasurements(
        measurementFilter ? measurementFilter.bind(options) : null
      );
    },

    /**
     * Download the CSV report for the measurements.
     */
    downloadCSVMeasurementsReport: ({ measurementFilter }) => {
      utils.downloadCSVReport(measurementService.getMeasurements(measurementFilter));
    },

    downloadCSVSegmentationReport: ({ segmentationId }) => {
      const segmentation = segmentationService.getSegmentation(segmentationId);
      const cachedStats = segmentation.cachedStats;

      const { representationData } = segmentation;
      const { Labelmap } = representationData;
      const { referencedImageIds } = Labelmap;

      const firstImageId = referencedImageIds[0];

      // find displaySet for firstImageId
      const displaySet = displaySetService
        .getActiveDisplaySets()
        .find(ds => ds.imageIds?.some(i => i === firstImageId));

      const {
        SeriesNumber,
        SeriesInstanceUID,
        StudyInstanceUID,
        SeriesDate,
        SeriesTime,
        SeriesDescription,
      } = displaySet;

      const additionalInfo = {
        reference: {
          SeriesNumber,
          SeriesInstanceUID,
          StudyInstanceUID,
          SeriesDate,
          SeriesTime,
          SeriesDescription,
        },
      };

      generateSegmentationCSVReport(segmentation, additionalInfo);
    },

    // Retrieve value commands
    getActiveViewportEnabledElement: _getActiveViewportEnabledElement,

    setViewportActive: ({ viewportId }) => {
      const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
      if (!viewportInfo) {
        console.warn('No viewport found for viewportId:', viewportId);
        return;
      }

      viewportGridService.setActiveViewportId(viewportId);
    },
    arrowTextCallback: ({ callback }) => {
      const labelConfig = customizationService.getCustomization('measurementLabels');
      const renderContent = customizationService.getCustomization('ui.labellingComponent');

      callInputDialogAutoComplete({
        uiDialogService,
        labelConfig,
        renderContent,
      });
    },
    toggleCine: () => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('cine');

      const { viewports } = viewportGridService.getState();
      const { isCineEnabled } = cineService.getState();
      cineService.setIsCineEnabled(!isCineEnabled);
      viewports.forEach((vp: any, index: any) => {
        // Skip the MIP viewport of the PT/CT fusion HP — it's a static volume
        // and cine doesn't apply.
        if (vp?.viewportOptions?.viewportId === 'mipSagittal') {
          return;
        }
        cineService.setCine({ id: index, isPlaying: false });
      });
    },

    setViewportWindowLevel({ viewportId, window, level }) {
      // convert to numbers
      const windowWidthNum = Number(window);
      const windowCenterNum = Number(level);

      // get actor from the viewport
      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      const viewport = renderingEngine.getViewport(viewportId);

      const { lower, upper } = csUtils.windowLevel.toLowHighRange(windowWidthNum, windowCenterNum);

      viewport.setProperties({
        voiRange: {
          upper,
          lower,
        },
      });
      viewport.render();
    },

    toggleViewportColorbar: ({ viewportId, displaySetInstanceUIDs, options = {} }) => {
      const hasColorbar = colorbarService.hasColorbar(viewportId);
      if (hasColorbar) {
        colorbarService.removeColorbar(viewportId);
        return;
      }
      colorbarService.addColorbar(viewportId, displaySetInstanceUIDs, options);
    },

    setWindowLevel(props) {
      const { toolGroupId } = props;
      const { viewportId } = _getActiveViewportEnabledElement();
      const viewportToolGroupId = toolGroupService.getToolGroupForViewport(viewportId);

      if (toolGroupId && toolGroupId !== viewportToolGroupId) {
        return;
      }

      actions.setViewportWindowLevel({ ...props, viewportId });
    },
    setWindowLevelPreset: ({ presetName, presetIndex }) => {
      const windowLevelPresets = customizationService.getCustomization(
        'cornerstone.windowLevelPresets'
      );

      const activeViewport = viewportGridService.getActiveViewportId();
      const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewport);
      const metadata = viewport.getImageData().metadata;

      const modality = metadata.Modality;

      if (!modality) {
        return;
      }

      const windowLevelPresetForModality = windowLevelPresets[modality];

      if (!windowLevelPresetForModality) {
        return;
      }

      const windowLevelPreset =
        windowLevelPresetForModality[presetName] ??
        Object.values(windowLevelPresetForModality)[presetIndex];

      actions.setViewportWindowLevel({
        viewportId: activeViewport,
        window: windowLevelPreset.window,
        level: windowLevelPreset.level,
      });
    },
    /**
     * Applica il preset W/L all'indice `index` (0-based), dando PRIORITÀ ai preset
     * DICOM della serie attiva (WindowCenter/WindowWidth dell'immagine) e poi, a
     * seguire, ai preset di configurazione per la modalità. Così il tasto 1 attiva
     * il 1° preset DICOM, il 2 il 2° preset DICOM, ecc., poi si passa agli altri.
     */
    setWindowLevelPresetByIndex: ({ index = 0 }) => {
      const activeViewportId = viewportGridService.getActiveViewportId();
      if (!activeViewportId) {
        return;
      }

      const dsUIDs = viewportGridService.getDisplaySetsUIDsForViewport(activeViewportId);
      const ds = dsUIDs?.length ? displaySetService.getDisplaySetByUID(dsUIDs[0]) : null;
      const SeriesInstanceUID = ds?.SeriesInstanceUID;
      const modality = ds?.Modality;

      const combined = [];

      // 1) Preset DICOM (priorità): coppie WindowCenter/WindowWidth della serie,
      // deduplicate. Sorgente: window.MdvDicomLuts[SeriesInstanceUID].
      try {
        const luts = (window as any).MdvDicomLuts;
        const entry = SeriesInstanceUID && luts ? luts[SeriesInstanceUID] : null;
        if (entry) {
          const wc = Array.isArray(entry.WindowCenter) ? entry.WindowCenter : [entry.WindowCenter];
          const ww = Array.isArray(entry.WindowWidth) ? entry.WindowWidth : [entry.WindowWidth];
          const seen = new Set();
          for (let i = 0; i < wc.length; i++) {
            const level = Number(wc[i]);
            const windowW = Number(ww[i]);
            if (!Number.isFinite(level) || !Number.isFinite(windowW)) {
              continue;
            }
            const key = `${level}|${windowW}`;
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            combined.push({ window: windowW, level });
          }
        }
      } catch (e) {
        /* noop */
      }

      // 2) Preset di configurazione per la modalità (dopo i DICOM).
      try {
        const presets = customizationService.getCustomization('cornerstone.windowLevelPresets');
        const forModality = modality && presets ? presets[modality] : null;
        if (forModality) {
          Object.values(forModality).forEach((p: any) => {
            const level = Number(p.level);
            const windowW = Number(p.window);
            if (Number.isFinite(level) && Number.isFinite(windowW)) {
              combined.push({ window: windowW, level });
            }
          });
        }
      } catch (e) {
        /* noop */
      }

      const preset = combined[index];
      if (!preset) {
        return;
      }

      actions.setViewportWindowLevel({
        viewportId: activeViewportId,
        window: preset.window,
        level: preset.level,
      });
    },
    setToolEnabled: ({ toolName, toggle, toolGroupId }) => {
      const { viewports } = viewportGridService.getState();

      if (!viewports.size) {
        return;
      }

      const toolGroup = toolGroupService.getToolGroup(toolGroupId ?? null);

      if (!toolGroup || !toolGroup.hasTool(toolName)) {
        return;
      }

      const toolIsEnabled = toolGroup.getToolOptions(toolName).mode === Enums.ToolModes.Enabled;

      // Toggle the tool's state only if the toggle is true
      if (toggle) {
        toolIsEnabled ? toolGroup.setToolDisabled(toolName) : toolGroup.setToolEnabled(toolName);
      } else {
        toolGroup.setToolEnabled(toolName);
      }

      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      renderingEngine.render();
    },
    toggleEnabledDisabledToolbar({ value, itemId, toolGroupId }) {
      const toolName = itemId || value;

      _postToStorico(toolName);

      // Modo canonico OHIF: getToolGroup(undefined) risolve internamente il
      // toolGroup della viewport ATTIVA (gestisce anche le celle della
      // sottogriglia). Ne ricaviamo l'id stringa.
      const activeToolGroup = toolGroupService.getToolGroup(toolGroupId);
      const activeId = activeToolGroup?.id;
      if (!activeToolGroup) {
        return;
      }

      // In contesto viewport normale/sottogriglia sincronizziamo lo stato del
      // tool tra i toolGroup 'default' e 'montage' (la Scala di riferimento si
      // attiva/disattiva INSIEME su viewport normali e celle). Altrove (es. MPR)
      // agiamo solo sull'attivo. I tool presenti solo in 'default'
      // (ReferenceLines, ecc.) non vengono toccati nella montage (`hasTool`=false).
      const ids =
        activeId === 'default' || activeId === 'montage'
          ? Array.from(new Set([activeId, 'default', 'montage']))
          : [activeId];

      // Determina il nuovo stato dal primo toolGroup (tra i target) col tool.
      let referenceToolGroup = null;
      for (const id of ids) {
        const tg = toolGroupService.getToolGroup(id);
        if (tg?.hasTool(toolName)) {
          referenceToolGroup = tg;
          break;
        }
      }
      if (!referenceToolGroup) {
        return;
      }

      const nextEnabled =
        referenceToolGroup.getToolOptions(toolName).mode !== Enums.ToolModes.Enabled;

      ids.forEach(id => {
        const tg = toolGroupService.getToolGroup(id);
        if (!tg || !tg.hasTool(toolName)) {
          return;
        }
        nextEnabled ? tg.setToolEnabled(toolName) : tg.setToolDisabled(toolName);
      });

      // Notifica la Sottogriglia per ri-allineare lo stato della Scala (padding).
      try {
        window.dispatchEvent(new Event('mdv-tool-toggled'));
      } catch (e) {
        /* noop */
      }
    },
    togglePassiveDisabledToolbar({ value, itemId, toolGroupId }) {
      const toolName = itemId || value;
      toolGroupId = toolGroupId ?? _getActiveViewportToolGroupId();

      _postToStorico(toolName);

      const toolGroup = toolGroupService.getToolGroup(toolGroupId);
      if (!toolGroup || !toolGroup.hasTool(toolName)) {
        return;
      }

      const toolMode = toolGroup.getToolOptions(toolName).mode;
      const isDisabled = toolMode === Enums.ToolModes.Disabled;

      isDisabled
        ? toolGroup.setToolPassive(toolName, { removeAllBindings: true })
        : toolGroup.setToolDisabled(toolName);
    },
    toggleActiveDisabledToolbar({ value, itemId, toolGroupId }) {
      const toolName = itemId || value;
      toolGroupId = toolGroupId ?? _getActiveViewportToolGroupId();
      const toolGroup = toolGroupService.getToolGroup(toolGroupId);
      if (!toolGroup || !toolGroup.hasTool(toolName)) {
        return;
      }

      //Passo il comando anche all'eventuale iframe storico
      _postToStorico(toolName);

      const toolIsActive = [
        Enums.ToolModes.Active,
        Enums.ToolModes.Enabled,
        Enums.ToolModes.Passive,
      ].includes(toolGroup.getToolOptions(toolName).mode);

      toolIsActive
        ? toolGroup.setToolDisabled(toolName)
        : actions.setToolActive({ toolName, toolGroupId });

      // we should set the previously active tool to active after we set the
      // current tool disabled
      if (toolIsActive) {
        const prevToolName = toolGroup.getPrevActivePrimaryToolName();
        if (prevToolName !== toolName) {
          actions.setToolActive({ toolName: prevToolName, toolGroupId });
        }
      }
    },
    setToolActiveToolbar: ({ value, itemId, toolName, toolGroupIds = [] }) => {
      // Sometimes it is passed as value (tools with options), sometimes as itemId (toolbar buttons)
      toolName = toolName || itemId || value;

      //Passo il comando anche all'eventuale iframe storico
      _postToStorico(toolName);

      toolGroupIds = toolGroupIds.length ? toolGroupIds : toolGroupService.getToolGroupIds();

      toolGroupIds.forEach(toolGroupId => {
        actions.setToolActive({ toolName, toolGroupId });
      });
    },
    setToolActive: ({ toolName, toolGroupId = null }) => {
      const { viewports } = viewportGridService.getState();

      if (!viewports.size) {
        return;
      }

      const toolGroup = toolGroupService.getToolGroup(toolGroupId);

      if (!toolGroup) {
        return;
      }

      if (!toolGroup.hasTool(toolName)) {
        return;
      }

      const activeToolName = toolGroup.getActivePrimaryMouseButtonTool();

      if (activeToolName) {
        const activeToolOptions = toolGroup.getToolConfiguration(activeToolName);
        activeToolOptions?.disableOnPassive
          ? toolGroup.setToolDisabled(activeToolName)
          : toolGroup.setToolPassive(activeToolName);
      }

      // Set the new toolName to be active
      toolGroup.setToolActive(toolName, {
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Primary,
          },
        ],
      });

      // Workaround: SplineROI / LivewireContour do not call hideElementCursor
      // themselves, but cornerstone's internal cursor WeakMap may still hold a
      // `none` cursor (or broken state) from a previous tool (e.g. Length /
      // Angle hide the cursor while drawing). When we re-activate one of these
      // contour tools, on the next draw resetElementCursor may read the stale
      // `none` backup and blank the cursor mid-measurement. Force a visible
      // crosshair on the viewport elements as a safety net, also on the next
      // tick to override any late cornerstone cursor update.
      const CONTOUR_TOOLS = new Set(['SplineROI', 'LivewireContour']);
      if (CONTOUR_TOOLS.has(toolName)) {
        const forceCrosshair = () => {
          try {
            const viewportsInfo = (toolGroup as any).viewportsInfo || [];
            viewportsInfo.forEach(({ viewportId: vpId }: { viewportId: string }) => {
              const cornerstoneViewport =
                cornerstoneViewportService!.getCornerstoneViewport(vpId);
              const element: HTMLElement | undefined = (cornerstoneViewport as any)?.element;
              if (element) {
                element.style.cursor = 'crosshair';
              }
            });
          } catch (_) {
            // non-fatal
          }
        };
        forceCrosshair();
        setTimeout(forceCrosshair, 0);
      }
    },
    // capture viewport
    showDownloadViewportModal: () => {
      const { activeViewportId } = viewportGridService.getState();

      if (!cornerstoneViewportService.getCornerstoneViewport(activeViewportId)) {
        // Cannot download a non-cornerstone viewport (image).
        uiNotificationService.show({
          title: 'Download Image',
          message: 'Image cannot be downloaded',
          type: 'error',
        });
        return;
      }

      const { uiModalService } = servicesManager.services;

      if (uiModalService) {
        uiModalService.show({
          content: CornerstoneViewportDownloadForm,
          title: "Scarica l'immagine ad alta qualità",
          contentProps: {
            activeViewportId,
            cornerstoneViewportService,
          },
          containerClassName: 'max-w-4xl p-4',
        });
      }
    },
    storeState: () => {
      //memorizzo tutte le impostazioni attuali della griglia con le relative serie

      storeState();
    },
    restoreState: () => {
      //ripristino  tutte le impostazioni precedentemente salvate
      restoreState();
    },
    setHPPreferiti: () => {
      window.saveHP();
    },
    gestioneHP: () => {
      const { uiModalService } = servicesManager.services;
      if (uiModalService) {
        uiModalService.show({
          content: HangingProtocolManagerModal,
          title: 'Gestione Hanging Protocol',
          containerClassName: 'max-w-3xl p-2',
        });
      }
    },
    hideInfoDicom: () => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('hideInfoDicom');

      document.body.classList.toggle('hide-info-dicom');
    },
    mprDirectClick: () => {
      try {
        //Se lo premo troppo velocemente avrò degli errori sulla camera ecc. per cui imposto un timeout
        if (isMprClicked) {
          return;
        }

        // Hide the viewport grid ONLY on mode-to-mode transitions (MPR ↔
        // PET/CT). Simple on/off of a single mode is fast and doesn't need
        // hiding. The two cases to cover here:
        //   1) entering MPR while PT/CT is active  (PT/CT → MPR)
        //   2) leaving MPR while PT/CT will be restored  (MPR → PT/CT)
        const ptctActive = document.body.classList.contains('hp-ptct-active');
        const inMpr = document.body.classList.contains('hp-mpr-active');
        const willTransitionAcrossModes =
          ptctActive || (inMpr && (window as any).ptctWasActiveBeforeMpr);
        if (willTransitionAcrossModes) {
          document.body.classList.add('mdv-layout-transitioning');
          if ((window as any).__mdv_transitionTimer) {
            clearTimeout((window as any).__mdv_transitionTimer);
          }
          (window as any).__mdv_transitionTimer = setTimeout(() => {
            document.body.classList.remove('mdv-layout-transitioning');
          }, 600);
        }

        // Mutually exclusive with PT/CT. If that layout is currently active,
        // tear it down first so this single click can switch directly from
        // PT/CT to MPR instead of requiring two clicks. Remember it was on so
        // we can re-flag it when the user toggles MPR back off (restoreState
        // brings the PT/CT layout back visually).
        if (document.body.classList.contains('hp-ptct-active')) {
          document.body.classList.remove('hp-ptct-active');
          (window as any).ptctIsActive = false;
          (window as any).ptctWasActiveBeforeMpr = true;
          document
            .querySelectorAll('.mdv-mip-rotate-overlay')
            .forEach(el => el.remove());
          try {
            hangingProtocolService!.setProtocol('default');
          } catch (_) {
            // non-fatal
          }
        }

        const { activeViewportId, viewports } = viewportGridService.getState();
        const activeViewport = viewports.get(activeViewportId);
        const activeDisplaySetInstanceUID = activeViewport.displaySetInstanceUIDs[0];

        // const enabledElement = _getActiveViewportEnabledElement();
        // if (!enabledElement) {
        //   return;
        // }
        // const viewport = enabledElement.viewport;

        //Verifico di non essere già in modalità MPR, se lo sono già torno alla visualizzazione default
        if (document.body.classList.contains('hp-mpr-active')) {
          // hangingProtocolService.setProtocol('default');
          //Ripulisco classi body
          document.body.classList.remove('hp-mpr-active');
          // const listaPresetAvanzati = [
          //   'mpr',
          //   'fourUp',
          //   'main3D',
          //   'primaryAxial',
          //   'only3D',
          //   'primary3D',
          // ];
          // listaPresetAvanzati.forEach(preset => {
          //   if (document.body.classList.contains(preset)) {
          //     document.body.classList.remove(preset);
          //   }
          // });
          restoreState();
          window.mprIsActive = false;

          // Ritorno alla visualizzazione normale: se i Cursori di riferimento
          // erano attivi prima di entrare in MPR, li riattiviamo (deferito per
          // dare tempo a restoreState di ricostruire le viewport/toolgroup).
          try {
            if ((window as any).refCursorsWasActiveBeforeMpr) {
              (window as any).refCursorsWasActiveBeforeMpr = false;
              setTimeout(() => {
                try {
                  actions.setToolActive({
                    toolName: 'ReferenceCursors',
                    toolGroupId: 'default',
                  });
                } catch (_) {
                  // non-fatal
                }
              }, 100);
            }
          } catch (_) {
            // non-fatal
          }

          //Se sono nell'iframe dello storico mando un messaggio al genitore dicendo che l'mpr è stato appena disabilitato
          if (window.location.href.includes('storico=same-tab')) {
            window.parent.postMessage('uscita-da-secondo-mpr', '*');
          }

          // If MPR was entered from PT/CT, restoreState brings the PT/CT
          // layout back visually — re-flag the body class so the LayoutPTCT
          // toolbar button reports as active and re-inject the MIP rotation
          // overlay (the layout rebuild discards it). Also remember that the
          // stored grid state has been overwritten by MPR's storeState, so
          // the next PT/CT toggle-off must fall back to setProtocol('default')
          // instead of restoreState (which would just re-apply the same
          // state and do nothing visually).
          if ((window as any).ptctWasActiveBeforeMpr) {
            document.body.classList.add('hp-ptct-active');
            (window as any).ptctIsActive = true;
            (window as any).ptctWasActiveBeforeMpr = false;
            (window as any).ptctStoredStateIsStale = true;
            const tries = [200, 600, 1500];
            tries.forEach(d => setTimeout(injectMipRotationOverlay, d));
            try {
              const vpId = viewportGridService.getActiveViewportId?.();
              const tbSvc = (servicesManager as any).services.toolbarService;
              tbSvc?.refreshToolbarState?.({ viewportId: vpId });
            } catch (_) {
              // non-fatal
            }
          }

          // setTimeout(() => {
          //   if (ActiveThumbnail) {
          //     ActiveThumbnail.click();
          //   }
          // }, 0);
          return;
        }

        //Attivazione MPR

        // Entrando in MPR si usa il Crosshair: se i Cursori di riferimento
        // erano attivi nella visualizzazione normale li disattiviamo (e
        // ripristiniamo il tool primario precedente, es. Window/Level).
        // Ricordiamo lo stato per riattivarli al ritorno in modalità normale.
        try {
          const defaultTg: any = toolGroupService.getToolGroup('default');
          const refCursorsActive =
            defaultTg?.getActivePrimaryMouseButtonTool?.() === 'ReferenceCursors';
          (window as any).refCursorsWasActiveBeforeMpr = !!refCursorsActive;
          if (refCursorsActive) {
            defaultTg.setToolDisabled('ReferenceCursors');
            const prevTool = defaultTg.getPrevActivePrimaryToolName?.();
            if (prevTool && prevTool !== 'ReferenceCursors') {
              actions.setToolActive({ toolName: prevTool, toolGroupId: 'default' });
            }
          }
        } catch (_) {
          // non-fatal
        }

        const _areSelectorsValid = (hp, displaySets, hangingProtocolService) => {
          if (!hp.displaySetSelectors || Object.values(hp.displaySetSelectors).length === 0) {
            return true;
          }

          return hangingProtocolService.areRequiredSelectorsValid(
            Object.values(hp.displaySetSelectors),
            displaySets[0]
          );
        };

        const hangingProtocols = Array.from(hangingProtocolService.protocols.values());

        const viewportId = viewportGridService.getActiveViewportId();

        if (!viewportId) {
          return [];
        }
        const displaySetInsaneUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewportId);

        if (!displaySetInsaneUIDs) {
          return [];
        }

        const displaySets = displaySetInsaneUIDs.map(uid =>
          displaySetService.getDisplaySetByUID(uid)
        );

        return hangingProtocols
          .map(hp => {
            if (hp.id !== 'mpr') {
              return;
            }

            const areValid = _areSelectorsValid(hp, displaySets, hangingProtocolService);
            if (!areValid) {
              uiNotificationService.show({
                title: 'Attivazione MPR',
                message: "L'MPR non è disponibile per la serie selezionata",
                type: 'warning',
              });
              return;
            }
            //Salva stato attuale
            storeState();
            //Verifico che la serie selezionata su cui attivare l'mpr sia dello studio attuale o magari dello storico così la clicco subito dopo l'attivazione
            if (!document.body.classList.contains('storico-same-tab')) {
              // Le linguette di studio ci sono solo quando c e uno storico.
              //
              // Servono a scegliere in quale elenco cercare la miniatura della
              // serie. Se il paziente non ha esami precedenti non vengono
              // disegnate affatto, e qui si chiamava click() su undefined:
              // l attivazione dell MPR si fermava con un TypeError, e il
              // pulsante sembrava non fare niente.
              const linguetteStudio = document.querySelectorAll('.qualestudio-btn');
              if (linguetteStudio.length > 1) {
                const quale =
                  displaySets[0].studyInstanceUid !== window.mdvStudyInstanceUIDs ? 1 : 0;
                linguetteStudio[quale].click();
              }
            }
            //Dopo il click della tab corretta applico un timeout
            setTimeout(() => {
              let ActiveThumbnail = document.querySelector(
                `#thumbnail-${activeDisplaySetInstanceUID} img`
              ); //Attivo l'mpr sulla serie attualmente attiva

              //Se da qualche altra parte specifico window.instanceUIDMPRDaCliccare (es. attivazione storico da iframe, do priorità a questo)
              if (window.instanceUIDMPRDaCliccare) {
                ActiveThumbnail = document.querySelector(
                  `#thumbnail-${window.instanceUIDMPRDaCliccare} img`
                );
                if (!ActiveThumbnail) {
                  //Se non trovo ActiveThumbnail, è probabile che non mi trovo nella tab corrispondente
                  //(o sono in storico sul cloud o studio attuale) e ActiveThumbnail si potrebbe trovare in una delle due (tab inattiva)
                  //
                  // La linguetta inattiva esiste solo se ce ne sono due. Senza
                  // storico non c e, e qui si chiamava click() su null.
                  document.querySelector('.inactive-tab-study')?.click();
                  setTimeout(() => {
                    ActiveThumbnail = document.querySelector(
                      `#thumbnail-${window.instanceUIDMPRDaCliccare} img`
                    );
                  }, 0);
                }
              }
              window.instanceUIDMPRDaCliccare = null;
              isMprClicked = true;
              let protocolToApply = 'mpr';
              //Se trovo in memoria un altro protocol da applicare lo applico
              if (window.mdvProtocolToApply) {
                protocolToApply = window.mdvProtocolToApply;
              }
              hangingProtocolService.setProtocol(protocolToApply);
              window.mprIsActive = true;
              document.body.classList.add('hp-mpr-active');

              // Volume3D first-render fix. Root cause: CornerstoneViewportService
              // calls setProperties({preset:'CT-Bone'}) right after setVolumes();
              // at that moment the volume actor is scaffolded but the voxels
              // aren't mapped yet, so setPreset() silently returns and the
              // transfer function is never bound — the 3D renders as degenerate
              // stripes. We wait for IMAGE_VOLUME_LOADING_COMPLETED (fires when
              // voxels are fully in memory) and re-apply the preset at that
              // point. A single listener + single safety timeout → very light
              // (earlier versions piled up multiple polls and multiple listeners
              // per MPR click, which is what was making things heavy).
              try {
                // Cancel any pending init from a previous MPR click so we
                // don't leak listeners when the user toggles MPR rapidly.
                if ((window as any).__mdv_volume3dCancel) {
                  (window as any).__mdv_volume3dCancel();
                }
                let cancelled = false;
                const cleanup = () => {
                  cancelled = true;
                  try {
                    csEventTarget.removeEventListener(
                      CoreEnums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
                      onVolumeLoaded
                    );
                  } catch (_) {}
                  if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
                };
                (window as any).__mdv_volume3dCancel = cleanup;

                const reapply3D = (source: string) => {
                  if (cancelled) return;
                  try {
                    const vp3dTg: any = toolGroupService.getToolGroup('volume3d');
                    const infos = vp3dTg?.viewportsInfo || [];
                    console.log('[mdv][volume3d] reapply start', {
                      source,
                      viewportCount: infos.length,
                    });
                    if (!infos.length) return;
                    let allApplied = true;
                    infos.forEach(({ viewportId }: { viewportId: string }) => {
                      const vp: any =
                        cornerstoneViewportService!.getCornerstoneViewport(viewportId);
                      const actors = typeof vp?.getActors === 'function' ? vp.getActors() : [];
                      const hasActors = (actors || []).length > 0;
                      if (!vp || !hasActors) {
                        allApplied = false;
                        return;
                      }
                      const presetName =
                        vp?.viewportProperties?.preset?.name ||
                        vp?.viewportProperties?.preset ||
                        'CT-Bone';
                      try {
                        // Light reapply: only rebind the preset on the existing
                        // actor and reset the camera. Do NOT call
                        // setVolumesForViewport — that recreates the entire VTK
                        // mapper + shader pipeline, which can overflow GPU
                        // resources and crash the WebGL context (all viewports
                        // go black with a GLSL shader dump in console).
                        const volumeId = vp?.getVolumeId?.();
                        if (typeof vp.setPreset === 'function') {
                          vp.setPreset(presetName, volumeId);
                        }
                        vp.resetCamera?.({
                          resetPan: true,
                          resetZoom: true,
                          resetToCenter: true,
                        });
                        vp.render?.();
                      } catch (e) {
                        console.warn('[mdv][volume3d] reapply failed', e);
                        allApplied = false;
                      }
                    });
                    if (allApplied) {
                      console.log('[mdv][volume3d] preset + camera reapplied', { source });
                      cleanup();
                    }
                  } catch (_) {}
                };

                const onVolumeLoaded = () => reapply3D('volume-loaded');
                csEventTarget.addEventListener(
                  CoreEnums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
                  onVolumeLoaded
                );

                // On the very first MPR activation, the 'volume3d' tool group
                // has no viewports bound yet at the time the volume-loaded
                // event fires — cornerstone binds the viewport later in the
                // protocol application cycle. Subscribe to VIEWPORT_ADDED so
                // the reapply runs as soon as a viewport joins the group.
                let tgSubscription: any = null;
                try {
                  tgSubscription = toolGroupService.subscribe(
                    toolGroupService.EVENTS.VIEWPORT_ADDED,
                    () => {
                      const tg: any = toolGroupService.getToolGroup('volume3d');
                      if ((tg?.viewportsInfo || []).length > 0) {
                        // Wait one tick for cornerstone to finish binding and
                        // for the actor to be attached, then reapply.
                        setTimeout(() => reapply3D('viewport-added'), 100);
                      }
                    }
                  );
                } catch (_) {}

                const origCleanup = cleanup;
                (window as any).__mdv_volume3dCancel = () => {
                  try {
                    tgSubscription?.unsubscribe?.();
                  } catch (_) {}
                  origCleanup();
                };
                // Single safety timeout: if VIEWPORT_ADDED fires before
                // actors are ready, reapply polls retry reasonably.
                const safetyTimeoutId = setTimeout(() => reapply3D('safety'), 2500);
              } catch (_) {
                // non-fatal
              }
              setTimeout(() => {
                if (ActiveThumbnail) {
                  ActiveThumbnail.click();
                }
                isMprClicked = false;
                // Auto-activate the Crosshairs tool once the MPR viewports
                // are bound to the 'mpr' tool group. On the FIRST activation
                // the viewports take longer than 150ms to be created, so a
                // plain timeout misses the window — subscribe to
                // VIEWPORT_ADDED and activate as soon as >=3 viewports are
                // bound. A safety timeout is kept as fallback. Respects the
                // user preference on window.mprCrosshairsDisabled.
                console.log('[mdv][mpr][crosshair] activation flow start', {
                  mprCrosshairsDisabled: (window as any).mprCrosshairsDisabled,
                });
                const tryActivateMprCrosshairs = (source: string) => {
                  if ((window as any).mprCrosshairsDisabled) {
                    console.log('[mdv][mpr][crosshair] skipped (user disabled)', { source });
                    return;
                  }
                  try {
                    const tg: any = toolGroupService.getToolGroup('mpr');
                    console.log('[mdv][mpr][crosshair] attempting setToolActive', {
                      source,
                      hasToolGroup: !!tg,
                      viewportsBound: tg?.viewportsInfo?.length,
                      hasTool: tg?.hasTool?.('Crosshairs'),
                      currentPrimary: tg?.getActivePrimaryMouseButtonTool?.(),
                    });
                    (actions.setToolActiveToolbar as any)({
                      toolName: 'Crosshairs',
                      toolGroupIds: ['mpr'],
                    });
                    console.log('[mdv][mpr][crosshair] after setToolActive', {
                      newPrimary: tg?.getActivePrimaryMouseButtonTool?.(),
                    });
                    // The CrosshairsTool's initializeViewport uses the canvas
                    // clientWidth/Height to project the tool center into world
                    // coordinates. On the FIRST MPR activation the canvas is
                    // still 0x0 when cornerstone fires onSetToolActive, so the
                    // annotation is created with bogus points and the lines
                    // never become visible. Wait until the viewports have
                    // actually rendered (IMAGE_RENDERED), then recompute.
                    try {
                      const tg2: any = toolGroupService.getToolGroup('mpr');
                      const mprViewportIds = new Set(
                        (tg2?.viewportsInfo || []).map((v: any) => v.viewportId)
                      );

                      // On PT/CT studies the MPR hanging protocol's per-
                      // viewport orientation sometimes doesn't apply on first
                      // activation — the three viewports all keep the default
                      // [0,0,-1] normal and the crosshair center computation
                      // stays NaN. Force the orientations explicitly by
                      // viewport id (idempotent on subsequent activations).
                      const forceDistinctOrientations = () => {
                        const map: Record<string, string> = {
                          'mpr-axial': 'axial',
                          'mpr-sagittal': 'sagittal',
                          'mpr-coronal': 'coronal',
                        };
                        Object.entries(map).forEach(([vpId, orient]) => {
                          try {
                            const vp: any =
                              cornerstoneViewportService!.getCornerstoneViewport(vpId);
                            if (vp && typeof vp.setOrientation === 'function') {
                              const cam = vp.getCamera?.();
                              // Apply only if current normal is the default
                              // [0,0,-1] or missing (avoid disturbing a view
                              // the user may have rotated).
                              const n = cam?.viewPlaneNormal;
                              const isDefault =
                                !n ||
                                (Math.abs(n[0]) < 1e-3 &&
                                  Math.abs(n[1]) < 1e-3 &&
                                  Math.abs(Math.abs(n[2]) - 1) < 1e-3);
                              if (isDefault) {
                                console.log(
                                  '[mdv][mpr][crosshair] forcing orientation',
                                  vpId,
                                  orient
                                );
                                vp.setOrientation(orient);
                              }
                            }
                          } catch (e) {
                            console.warn(
                              '[mdv][mpr][crosshair] setOrientation failed',
                              vpId,
                              e
                            );
                          }
                        });
                      };
                      // Run a couple of times so we catch both the case where
                      // actors aren't ready yet and the normal case.
                      setTimeout(forceDistinctOrientations, 120);
                      setTimeout(forceDistinctOrientations, 600);
                      let done = false;
                      const recompute = (source: string) => {
                        if (done) return;
                        if ((window as any).mprCrosshairsDisabled) return;
                        try {
                          const tg3: any = toolGroupService.getToolGroup('mpr');
                          if (!tg3) return;
                          if (tg3.getActivePrimaryMouseButtonTool?.() !== 'Crosshairs') {
                            return;
                          }
                          // Guard 1: canvas must be sized. Guard 2: viewport
                          // must already know its FrameOfReferenceUID (volume
                          // actor attached). Guard 3: the three MPR viewports
                          // must each have their own distinct orientation
                          // (axial / sagittal / coronal) — on PT/CT studies
                          // the MPR protocol's orientation setup is slightly
                          // delayed and initially every viewport keeps the
                          // default camera normal [0,0,-1]. Computing the
                          // tool center with three parallel planes produces
                          // NaN and no crosshair is drawn.
                          const notReadyReason: string[] = [];
                          const viewports = tg3.viewportsInfo || [];
                          const normals: number[][] = [];
                          for (const { viewportId } of viewports) {
                            const vp: any =
                              cornerstoneViewportService!.getCornerstoneViewport(viewportId);
                            const w = vp?.canvas?.clientWidth || 0;
                            const for_ =
                              vp?.getFrameOfReferenceUID?.() ||
                              vp?.FrameOfReferenceUID ||
                              null;
                            const hasActors =
                              typeof vp?.getActors === 'function'
                                ? (vp.getActors() || []).length > 0
                                : false;
                            if (!w) notReadyReason.push(`${viewportId}:canvas0`);
                            if (!for_) notReadyReason.push(`${viewportId}:noFoR`);
                            if (!hasActors) notReadyReason.push(`${viewportId}:noActors`);
                            const cam = vp?.getCamera?.();
                            if (cam?.viewPlaneNormal) {
                              normals.push(cam.viewPlaneNormal as number[]);
                            }
                          }
                          const areAllNormalsDistinct =
                            normals.length >= 3 &&
                            (() => {
                              const eq = (a: number[], b: number[]) =>
                                Math.abs(a[0] - b[0]) < 1e-3 &&
                                Math.abs(a[1] - b[1]) < 1e-3 &&
                                Math.abs(a[2] - b[2]) < 1e-3;
                              // Also treat opposite normals (a == -b) as
                              // parallel, since the planes overlap.
                              const neg = (a: number[]) => [-a[0], -a[1], -a[2]];
                              const par = (a: number[], b: number[]) =>
                                eq(a, b) || eq(a, neg(b));
                              return (
                                !par(normals[0], normals[1]) &&
                                !par(normals[0], normals[2]) &&
                                !par(normals[1], normals[2])
                              );
                            })();
                          if (!areAllNormalsDistinct) {
                            notReadyReason.push('orientations-parallel');
                          }
                          if (notReadyReason.length) {
                            console.log('[mdv][mpr][crosshair] not ready', {
                              source,
                              notReadyReason,
                            });
                            return;
                          }
                          const crosshairs: any = tg3.getToolInstance?.('Crosshairs');
                          if (crosshairs?.computeToolCenter) {
                            // Log camera state for each MPR viewport to see
                            // what cornerstone has to work with — PT/CT MPR
                            // shows a "View plane normal is not parallel..."
                            // warning indicating unusual orientation on these
                            // studies. If viewUp / viewPlaneNormal are not
                            // set properly yet, _computeToolCenter produces a
                            // degenerate toolCenter.
                            const cameras = viewports.map(
                              ({ viewportId }: { viewportId: string }) => {
                                const vp: any =
                                  cornerstoneViewportService!.getCornerstoneViewport(viewportId);
                                try {
                                  return {
                                    viewportId,
                                    canvas: [
                                      vp?.canvas?.clientWidth,
                                      vp?.canvas?.clientHeight,
                                    ],
                                    camera: vp?.getCamera?.(),
                                  };
                                } catch (e) {
                                  return { viewportId, error: String(e) };
                                }
                              }
                            );
                            console.log('[mdv][mpr][crosshair] cameras before compute', cameras);
                            crosshairs.computeToolCenter();
                            console.log('[mdv][mpr][crosshair] computeToolCenter', {
                              source,
                              toolCenter: crosshairs.toolCenter,
                              toolCenterValid:
                                Array.isArray(crosshairs.toolCenter) &&
                                crosshairs.toolCenter.every(
                                  (n: any) => Number.isFinite(n)
                                ),
                            });
                            done = true;
                            viewports.forEach(
                              ({ viewportId }: { viewportId: string }) => {
                                try {
                                  cornerstoneViewportService!
                                    .getCornerstoneViewport(viewportId)
                                    ?.render?.();
                                } catch (_) {}
                              }
                            );
                            // Ask cornerstone to redraw the annotation SVG
                            // layer for all MPR viewports — vp.render() only
                            // repaints the image plane, annotations live on a
                            // separate layer and need this explicit trigger.
                            try {
                              const ids = viewports.map(
                                (v: any) => v.viewportId
                              );
                              (cstUtils as any).triggerAnnotationRenderForViewportIds?.(ids);
                            } catch (e) {
                              console.warn(
                                '[mdv][mpr][crosshair] triggerAnnotationRender failed',
                                e
                              );
                            }
                          }
                        } catch (e) {
                          console.warn('[mdv][mpr][crosshair] recompute err', e);
                        }
                      };
                      const onImageRendered = (evt: any) => {
                        const vpId = evt?.detail?.viewportId;
                        if (mprViewportIds.has(vpId)) {
                          recompute('image-rendered');
                        }
                      };
                      const onCameraModified = (evt: any) => {
                        const vpId = evt?.detail?.viewportId;
                        if (mprViewportIds.has(vpId)) {
                          recompute('camera-modified');
                        }
                      };
                      csEventTarget.addEventListener(
                        CoreEnums.Events.IMAGE_RENDERED,
                        onImageRendered
                      );
                      csEventTarget.addEventListener(
                        CoreEnums.Events.CAMERA_MODIFIED,
                        onCameraModified
                      );
                      const cleanupListeners = () => {
                        csEventTarget.removeEventListener(
                          CoreEnums.Events.IMAGE_RENDERED,
                          onImageRendered
                        );
                        csEventTarget.removeEventListener(
                          CoreEnums.Events.CAMERA_MODIFIED,
                          onCameraModified
                        );
                      };
                      setTimeout(cleanupListeners, 15000);
                      // Also try a few delayed polls as safety nets.
                      [300, 800, 1600, 3000, 5000, 8000, 12000].forEach(d =>
                        setTimeout(() => recompute('poll-' + d), d)
                      );
                    } catch (e) {
                      console.warn('[mdv][mpr][crosshair] event wiring failed', e);
                    }
                  } catch (e) {
                    console.warn('[mdv][mpr][crosshair] activation failed:', e);
                  }
                };
                try {
                  const mprTg: any = toolGroupService.getToolGroup('mpr');
                  const initialCount = mprTg?.viewportsInfo?.length || 0;
                  console.log('[mdv][mpr][crosshair] initial state', {
                    hasToolGroup: !!mprTg,
                    viewportsBound: initialCount,
                  });
                  const alreadyHasViewports = initialCount >= 3;
                  if (alreadyHasViewports) {
                    setTimeout(() => tryActivateMprCrosshairs('already-ready'), 150);
                  } else {
                    let done = false;
                    const sub = toolGroupService.subscribe(
                      toolGroupService.EVENTS.VIEWPORT_ADDED,
                      () => {
                        if (done) return;
                        const tg: any = toolGroupService.getToolGroup('mpr');
                        const count = tg?.viewportsInfo?.length || 0;
                        console.log('[mdv][mpr][crosshair] VIEWPORT_ADDED fired', { count });
                        if (count >= 3) {
                          done = true;
                          setTimeout(() => tryActivateMprCrosshairs('viewport-added'), 100);
                          try { sub.unsubscribe?.(); } catch (_) {}
                        }
                      }
                    );
                    // Safety fallback in case the event timing misses.
                    setTimeout(() => {
                      if (done) return;
                      done = true;
                      console.log('[mdv][mpr][crosshair] safety fallback fired');
                      tryActivateMprCrosshairs('fallback');
                      try { sub.unsubscribe?.(); } catch (_) {}
                    }, 1500);
                  }
                } catch (e) {
                  console.warn('[mdv][mpr][crosshair] setup error, using default timeout', e);
                  setTimeout(() => tryActivateMprCrosshairs('error-fallback'), 150);
                }
              }, 100);
            }, 0);
          })
          .filter(preset => preset !== null);
      } catch (err) {
        console.error('Errore attivazione MPR: ', err);
      }
    },
    toggleCrosshairs: ({ toolGroupIds = ['mpr'] }: { toolGroupIds?: string[] } = {}) => {
      // Toggle Crosshairs on the given tool groups. If currently active as the
      // primary tool, switch back to WindowLevel (the default); otherwise
      // activate Crosshairs. The user's explicit choice is persisted on
      // window.mprCrosshairsDisabled so subsequent MPR entries respect it.
      const groupIds = toolGroupIds?.length
        ? toolGroupIds
        : toolGroupService!.getToolGroupIds();

      const isAnyActive = groupIds.some((id: string) => {
        const tg = toolGroupService!.getToolGroup(id);
        return tg?.getActivePrimaryMouseButtonTool?.() === 'Crosshairs';
      });

      const nextTool = isAnyActive ? 'WindowLevel' : 'Crosshairs';
      (window as any).mprCrosshairsDisabled = isAnyActive;

      (actions.setToolActiveToolbar as any)({
        toolName: nextTool,
        toolGroupIds: groupIds,
      });
    },
    mprDirectClickForStorico: () => {
      if (!document.getElementById('iframe-storico')) {
        return;
      }
      document.body.classList.add('secondo-mpr-attivo');
      _postToStorico('attiva-mpr');
    },
    ptctDirectClick: () => {
      // Helper: restore a specific viewport grid state snapshot (captured
      // earlier with viewportGridService.getState()). Mirrors restoreState
      // but uses the passed snapshot instead of the shared zustand store —
      // lets us keep the "original layout before PT/CT" intact even when
      // MPR's storeState has since overwritten the zustand state.
      const applyGridSnapshot = (snapshot: any): boolean => {
        try {
          if (!snapshot || !snapshot.layout) {
            return false;
          }
          const viewportIdToUpdate = snapshot.activeViewportId;
          const layoutOptions = viewportGridService.getLayoutOptionsFromState(snapshot);
          const findOrCreateViewport = (_pos: number, positionId: string) => {
            return Array.from(snapshot.viewports.values()).find(
              (vp: any) => vp.positionId === positionId
            );
          };
          viewportGridService.setLayout({
            numRows: snapshot.layout.numRows,
            numCols: snapshot.layout.numCols,
            activeViewportId: viewportIdToUpdate,
            layoutOptions,
            findOrCreateViewport,
            isHangingProtocolLayout: false,
          });
          return true;
        } catch (e) {
          console.warn('[mdv][ptct] applyGridSnapshot failed', e);
          return false;
        }
      };

      try {
        const hpSvc = hangingProtocolService!;
        const dssSvc = displaySetService!;
        const uiNotif = uiNotificationService!;

        // Hide the viewport grid ONLY on mode-to-mode transitions. Simple
        // on/off of PT/CT (from normal layout) doesn't need hiding.
        // The single case here is: entering PT/CT while MPR is active
        // (MPR → PT/CT), where the brief restoreState + setProtocol chain
        // flashes the previous layout.
        const inMpr = document.body.classList.contains('hp-mpr-active');
        if (inMpr) {
          document.body.classList.add('mdv-layout-transitioning');
          if ((window as any).__mdv_transitionTimer) {
            clearTimeout((window as any).__mdv_transitionTimer);
          }
          (window as any).__mdv_transitionTimer = setTimeout(() => {
            document.body.classList.remove('mdv-layout-transitioning');
          }, 600);
        }

        // Toggle off: try to restore the grid state that was active before
        // entering PT/CT (mirrors MPR behavior). Falls back to the default
        // hanging protocol if no stored state is available or if MPR's
        // storeState has since overwritten our snapshot (the flag
        // ptctStoredStateIsStale is set by the MPR toggle-off branch).
        if (document.body.classList.contains('hp-ptct-active')) {
          // Save the PT/CT grid WITH user modifications (series swaps etc)
          // so re-activating PT/CT later can restore them instead of
          // re-applying the hanging protocol from scratch.
          try {
            (window as any).ptctModifiedGridState =
              viewportGridService.getState?.();
          } catch (_) {}

          document.body.classList.remove('hp-ptct-active');
          (window as any).ptctIsActive = false;
          // Clean up any MIP rotation overlay we injected previously.
          document
            .querySelectorAll('.mdv-mip-rotate-overlay')
            .forEach(el => el.remove());
          let restored = false;
          const preEnter = (window as any).ptctPreEnterLayoutSnapshot;
          if (preEnter) {
            restored = applyGridSnapshot(preEnter);
            (window as any).ptctPreEnterLayoutSnapshot = null;
          }
          if (!restored) {
            hpSvc.setProtocol('default');
          }
          (window as any).ptctStoredStateIsStale = false;
          return;
        }

        // Require both PT and CT series in the current study to activate PT/CT.
        const displaySets = dssSvc.getActiveDisplaySets();
        const modalities = new Set((displaySets || []).map((ds: any) => ds.Modality));
        if (!modalities.has('PT') || !modalities.has('CT')) {
          uiNotif.show({
            title: 'PET/CT non disponibile',
            message: 'Lo studio deve contenere serie PT e CT per attivare questa vista.',
            type: 'warning',
            duration: 4000,
          });
          return;
        }

        // Mutually exclusive with MPR. If MPR is active, restore the pre-MPR
        // grid state first so the PT/CT hanging protocol can be applied cleanly
        // in a single click (otherwise the MPR layout lingers and the protocol
        // switch only takes effect on the second click).
        const wasMprActive = document.body.classList.contains('hp-mpr-active');
        if (wasMprActive) {
          document.body.classList.remove('hp-mpr-active');
          (window as any).mprIsActive = false;
          try {
            restoreState();
          } catch (_) {
            // non-fatal
          }
        }

        // Capture a dedicated snapshot of the user's layout before PT/CT so
        // we can return to it at toggle-off even if the user goes on a
        // PT/CT ↔ MPR round trip. The capture source depends on context:
        //  - From a normal layout: use viewportGridService.getState() (the
        //    current grid IS the pre-PT/CT grid).
        //  - From MPR: the current grid is the MPR layout itself, which we
        //    don't want to return to. MPR's own storeState (already ran in
        //    mprDirectClick) saved the pre-MPR grid into the toggleOneUp-
        //    ViewportGridStore. Read it back from there — it holds the real
        //    "before everything" grid the user started from (e.g. 2x2).
        // Only capture on the FIRST entry; subsequent re-entries via MPR
        // keep the original snapshot intact.
        if (!(window as any).ptctPreEnterLayoutSnapshot) {
          try {
            if (wasMprActive) {
              const { toggleOneUpViewportGridStore } =
                useToggleOneUpViewportGridStore.getState();
              if (toggleOneUpViewportGridStore) {
                (window as any).ptctPreEnterLayoutSnapshot =
                  toggleOneUpViewportGridStore;
                console.log(
                  '[mdv][ptct] ptctPreEnterLayoutSnapshot captured from MPR snapshot (zustand)'
                );
              }
            } else {
              (window as any).ptctPreEnterLayoutSnapshot =
                viewportGridService.getState?.();
              console.log(
                '[mdv][ptct] ptctPreEnterLayoutSnapshot captured from current grid'
              );
            }
          } catch (e) {
            console.warn('[mdv][ptct] snapshot capture failed', e);
          }
        }

        // Keep the legacy storeState() path working (other flows may rely on
        // the shared zustand slot). Skip when coming out of MPR so the fresh
        // storeState doesn't capture the transient default layout.
        if (!wasMprActive) {
          try {
            storeState();
          } catch (e) {
            console.warn('[mdv][ptct] storeState error', e);
          }
        }

        const applyPtct = () => {
          // If the user previously modified the PT/CT layout (swapped
          // series etc.) and then toggled off, re-apply their modified
          // state instead of re-running the hanging protocol from scratch.
          const modifiedState = (window as any).ptctModifiedGridState;
          if (modifiedState) {
            const applied = applyGridSnapshot(modifiedState);
            if (applied) {
              document.body.classList.add('hp-ptct-active');
              (window as any).ptctIsActive = true;
              const tries = [200, 600, 1500, 3000];
              tries.forEach(delay => setTimeout(injectMipRotationOverlay, delay));
              return;
            }
          }
          // First activation or snapshot unavailable: apply fresh HP.
          hpSvc.setProtocol('@ohif/extension-tmtv.hangingProtocolModule.ptCT');
          document.body.classList.add('hp-ptct-active');
          (window as any).ptctIsActive = true;
          const tries = [200, 600, 1500, 3000];
          tries.forEach(delay => setTimeout(injectMipRotationOverlay, delay));
        };

        // Give restoreState a tick to flush its layout changes before applying
        // the ptCT protocol, otherwise the two layout updates race.
        if (wasMprActive) {
          setTimeout(applyPtct, 0);
        } else {
          applyPtct();
        }
      } catch (err) {
        console.error('Errore attivazione PET/CT: ', err);
      }
    },
    rotateViewport: ({ rotation }) => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico(`rotateViewport-${rotation.toString()}`);

      // Montage: ruota TUTTE le celle dello stesso angolo (rimangono allineate).
      const montage = _getMontageCells();
      if (montage) {
        const basePres = montage.primary.getViewPresentation?.();
        const newRotation = (((basePres?.rotation || 0) + rotation + 360) % 360);
        montage.cells.forEach(v => {
          if (v.setViewPresentation) {
            v.setViewPresentation({ rotation: newRotation });
            v.render();
          }
        });
        return;
      }

      const enabledElement = _getActiveViewportEnabledElement();
      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (viewport instanceof BaseVolumeViewport) {
        const camera = viewport.getCamera();
        const rotAngle = (rotation * Math.PI) / 180;
        const rotMat = mat4.identity(new Float32Array(16));
        mat4.rotate(rotMat, rotMat, rotAngle, camera.viewPlaneNormal);
        const rotatedViewUp = vec3.transformMat4(vec3.create(), camera.viewUp, rotMat);
        viewport.setCamera({ viewUp: rotatedViewUp as CoreTypes.Point3 });
        viewport.render();
      } else if (viewport.getRotation !== undefined) {
        const presentation = viewport.getViewPresentation();
        const { rotation: currentRotation } = presentation;
        const newRotation = (currentRotation + rotation + 360) % 360;
        viewport.setViewPresentation({ rotation: newRotation });
        viewport.render();
      }
    },
    flipViewportHorizontal: () => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('flipViewportHorizontal');

      // Montage: applica lo stesso flip a tutte le celle.
      const montageH = _getMontageCells();
      if (montageH) {
        const target = !montageH.primary.getCamera().flipHorizontal;
        montageH.cells.forEach(v => {
          v.setCamera({ flipHorizontal: target });
          v.render();
        });
        return;
      }

      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      const { flipHorizontal } = viewport.getCamera();
      viewport.setCamera({ flipHorizontal: !flipHorizontal });
      viewport.render();
    },
    flipViewportVertical: () => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('flipViewportVertical');

      // Montage: applica lo stesso flip a tutte le celle.
      const montageV = _getMontageCells();
      if (montageV) {
        const target = !montageV.primary.getCamera().flipVertical;
        montageV.cells.forEach(v => {
          v.setCamera({ flipVertical: target });
          v.render();
        });
        return;
      }

      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      const { flipVertical } = viewport.getCamera();
      viewport.setCamera({ flipVertical: !flipVertical });
      viewport.render();
    },
    invertViewport: ({ element }) => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('invertViewport');

      // Montage: inverte TUTTE le celle insieme (stesso stato finale).
      if (element === undefined) {
        const montageInv = _getMontageCells();
        if (montageInv) {
          const target = !montageInv.primary.getProperties().invert;
          montageInv.cells.forEach(v => {
            v.setProperties({ invert: target });
            v.render();
          });
          return;
        }
      }

      let enabledElement;

      if (element === undefined) {
        enabledElement = _getActiveViewportEnabledElement();
      } else {
        enabledElement = element;
      }

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      const { invert } = viewport.getProperties();
      viewport.setProperties({ invert: !invert });
      viewport.render();
    },
    setCamera: () => {
      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      const { viewports } = viewportGridService.getState();

      const parallelscale = 191.14258844937564;
      const focalpoint = [-188.23641967773438, 204.3086395263672, -15.805070877075195];
      const position = [79.57884216308594, 204.3086395263672, -15.805070877075195];

      viewports.forEach(_viewport => {
        const { viewportId } = _viewport;
        const viewport = renderingEngine.getViewport(viewportId);
        const camera = viewport.getCamera();
        viewport.setCamera({
          parallelScale: parallelscale,
          focalPoint: focalpoint,
          position: position,
        });
        viewport.render();
      });
    },
    resetViewport: () => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('resetViewport');

      // Montage: reset di tutte le celle (proprietà + fit camera).
      const montageReset = _getMontageCells();
      if (montageReset) {
        montageReset.cells.forEach(v => {
          _resetViewportKeepingMono1Invert(v);
          v.render();
        });
        return;
      }

      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      _resetViewportKeepingMono1Invert(viewport);

      viewport.render();
    },
    zoomOneToOne: () => {
      //Passo il comando anche all'eventuale iframe storico
      _postToStorico('zoomOneToOne');

      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (viewport.setViewPresentation) {
        viewport.setViewPresentation({ zoom: 1 });
      } else if (viewport.setCamera) {
        viewport.resetCamera?.();
      }

      viewport.render();
    },
    Reset3DRotate: () => { },
    scaleViewport: ({ direction }) => {
      const enabledElement = _getActiveViewportEnabledElement();
      const scaleFactor = direction > 0 ? 0.9 : 1.1;

      if (!enabledElement) {
        return;
      }
      const { viewport } = enabledElement;

      if (viewport instanceof StackViewport) {
        if (direction) {
          const { parallelScale } = viewport.getCamera();
          viewport.setCamera({ parallelScale: parallelScale * scaleFactor });
          viewport.render();
        } else {
          viewport.resetCamera();
          viewport.render();
        }
      }
    },

    /** Jumps the active viewport or the specified one to the given slice index */
    jumpToImage: ({ imageIndex, viewport: gridViewport }): void => {
      // Get current active viewport (return if none active)
      let viewport;
      if (!gridViewport) {
        const enabledElement = _getActiveViewportEnabledElement();
        if (!enabledElement) {
          return;
        }
        viewport = enabledElement.viewport;
      } else {
        viewport = cornerstoneViewportService.getCornerstoneViewport(gridViewport.id);
      }

      // Get number of slices
      // -> Copied from cornerstone3D jumpToSlice\_getImageSliceData()
      let numberOfSlices = 0;

      if (viewport instanceof StackViewport) {
        numberOfSlices = viewport.getImageIds().length;
      } else if (viewport instanceof VolumeViewport) {
        numberOfSlices = csUtils.getImageSliceDataForVolumeViewport(viewport).numberOfSlices;
      } else {
        throw new Error('Unsupported viewport type');
      }

      const jumpIndex = imageIndex < 0 ? numberOfSlices + imageIndex : imageIndex;
      if (jumpIndex >= numberOfSlices || jumpIndex < 0) {
        return;
        throw new Error(`Can't jump to ${imageIndex}`);
      }

      // Set slice to last slice
      const options = { imageIndex: jumpIndex };
      csUtils.jumpToSlice(viewport.element, options);
    },
    scroll: ({ direction }) => {
      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;
      const options = { delta: direction };

      csUtils.scroll(viewport, options);
    },
    setViewportColormap: ({
      viewportId,
      displaySetInstanceUID,
      colormap,
      opacity = 1,
      immediate = false,
    }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

      let hpOpacity;
      // Retrieve active protocol's viewport match details
      const { viewportMatchDetails } = hangingProtocolService.getActiveProtocol();
      // Get display set options for the specified viewport ID
      const displaySetsInfo = viewportMatchDetails.get(viewportId)?.displaySetsInfo;

      if (displaySetsInfo) {
        // Find the display set that matches the given UID
        const matchingDisplaySet = displaySetsInfo.find(
          displaySet => displaySet.displaySetInstanceUID === displaySetInstanceUID
        );
        // If a matching display set is found, update the opacity with its value
        hpOpacity = matchingDisplaySet?.displaySetOptions?.options?.colormap?.opacity;
      }

      // HP takes priority over the default opacity
      colormap = { ...colormap, opacity: hpOpacity || opacity };

      if (viewport instanceof StackViewport) {
        viewport.setProperties({ colormap });
      }

      if (viewport instanceof VolumeViewport) {
        if (!displaySetInstanceUID) {
          const { viewports } = viewportGridService.getState();
          displaySetInstanceUID = viewports.get(viewportId)?.displaySetInstanceUIDs[0];
        }

        // ToDo: Find a better way of obtaining the volumeId that corresponds to the displaySetInstanceUID
        const volumeId =
          viewport
            .getAllVolumeIds()
            .find((_volumeId: string) => _volumeId.includes(displaySetInstanceUID)) ??
          viewport.getVolumeId();
        viewport.setProperties({ colormap }, volumeId);
      }

      if (immediate) {
        viewport.render();
      }
    },
    changeActiveViewport: ({ direction = 1 }) => {
      const { activeViewportId, viewports } = viewportGridService.getState();
      const viewportIds = Array.from(viewports.keys());
      const currentIndex = viewportIds.indexOf(activeViewportId);
      const nextViewportIndex =
        (currentIndex + direction + viewportIds.length) % viewportIds.length;
      viewportGridService.setActiveViewportId(viewportIds[nextViewportIndex] as string);
    },
    /**
     * If the syncId is given and a synchronizer with that ID already exists, it will
     * toggle it on/off for the provided viewports. If not, it will attempt to create
     * a new synchronizer using the given syncId and type for the specified viewports.
     * If no viewports are provided, you may notice some default behavior.
     * - 'voi' type, we will aim to synchronize all viewports with the same modality
     * -'imageSlice' type, we will aim to synchronize all viewports with the same orientation.
     *
     * @param options
     * @param options.viewports - The viewports to synchronize
     * @param options.syncId - The synchronization group ID
     * @param options.type - The type of synchronization to perform
     */
    toggleSynchronizer: ({ type, viewports, syncId, toggledState, itemId }) => {
      //Passo il comando anche all'eventuale iframe storico, ma solo per il
      //toggle voluto dall'utente (toolbar -> itemId, scorciatoia -> solo type).
      //Le riattivazioni automatiche arrivano con toggledState e non vanno
      //propagate, altrimenti spegnerebbero il sync dello storico.
      const storicoSyncItemId = itemId || (type === 'imageSlice' ? 'ImageSliceSync' : null);
      if (toggledState === undefined && storicoSyncItemId) {
        _postToStorico(storicoSyncItemId);
      }

      const fn = toggleSyncFunctions[type];

      // Track the user's explicit preference per sync type. Keyed on `type`
      // (not syncId) because the toolbar button click passes only `type`
      // while programmatic re-enable calls pass `syncId` — both must share
      // the same preference slot.
      const userPrefKey = `mdvSyncPref_${type}`;
      const defaultSyncIdByType: Record<string, string> = {
        imageSlice: 'IMAGE_SLICE_SYNC',
        voi: 'VOI_SYNC',
      };
      const effectiveSyncId = syncId || defaultSyncIdByType[type];

      if (toggledState !== undefined) {
        // Programmatic call. If the user has already opted out, ignore
        // attempts to re-enable the synchronizer automatically.
        if (toggledState === true && (window as any)[userPrefKey] === 'off') {
          return;
        }
        if (fn) {
          fn({
            servicesManager,
            viewports,
            syncId,
            toggledState,
          });
          (window as any)[userPrefKey] = toggledState ? 'on' : 'off';
        }
        return;
      }

      // Interactive call (no toggledState): the user is flipping the state.
      // Record the post-toggle state as their preference, using the real
      // syncId so we inspect the correct synchronizer.
      const synchronizer = syncGroupService.getSynchronizer(effectiveSyncId);

      if (synchronizer) {
        const isEnabled = synchronizer?._enabled !== false;
        const nextEnabled = !isEnabled;
        synchronizer.setEnabled(nextEnabled);
        (window as any)[userPrefKey] = nextEnabled ? 'on' : 'off';
        // setEnabled on the cornerstone Synchronizer does not bubble through
        // SyncGroupService, so UI subscribers (e.g. the linked-series badge
        // overlay) would not hear about the flip. Broadcast the change here
        // so viewport overlays can refresh immediately.
        (syncGroupService as any)._broadcastEvent?.(
          syncGroupService.EVENTS?.SYNC_GROUP_CHANGED,
          { syncId: effectiveSyncId, enabled: nextEnabled }
        );
        return;
      }

      if (fn) {
        fn({
          servicesManager,
          viewports,
          syncId,
        });
        // After fn runs, inspect the actual state: toggleImageSliceSync /
        // toggleVOISliceSync flip enabled ↔ disabled based on the current
        // state of the sync group. Read it back and persist as user pref.
        const after = syncGroupService.getSynchronizer(effectiveSyncId);
        const afterEnabled = after ? after._enabled !== false : false;
        // If no sync exists after fn, the user just disabled it (removed
        // viewports) → mark 'off'. Otherwise mark 'on'.
        (window as any)[userPrefKey] = after && afterEnabled ? 'on' : 'off';
      }
    },
    setSourceViewportForReferenceLinesTool: ({ viewportId }) => {
      //Viene richiamato ripetute volte esponenzialmente ad ogni trigger, imposto un timeout così da avere sempre una sola chiamata
      if (debounceTimeout) {
        return;
      }
      // Imposta il timeout per ritardare la prossima chiamata
      debounceTimeout = setTimeout(() => {
        debounceTimeout = null; // Resetta il timeout dopo l'intervallo di debounce
      }, debounceTime);

      if (!viewportId) {
        const { activeViewportId } = viewportGridService.getState();
        viewportId = activeViewportId ?? 'default';
      }

      const toolGroup = toolGroupService.getToolGroupForViewport(viewportId);

      toolGroup?.setToolConfiguration(
        ReferenceLinesTool.toolName,
        {
          sourceViewportId: viewportId,
        },
        true // overwrite
      );
    },
    storePresentation: ({ viewportId }) => {
      cornerstoneViewportService.storePresentation({ viewportId });
    },
    updateVolumeData: ({ volume }) => {
      // update vtkOpenGLTexture and imageData of computed volume
      const { imageData, vtkOpenGLTexture } = volume;
      const numSlices = imageData.getDimensions()[2];
      const slicesToUpdate = [...Array(numSlices).keys()];
      slicesToUpdate.forEach(i => {
        vtkOpenGLTexture.setUpdatedFrame(i);
      });
      imageData.modified();
    },

    attachProtocolViewportDataListener: ({ protocol, stageIndex }) => {
      const EVENT = cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED;
      const command = protocol.callbacks.onViewportDataInitialized;
      const numPanes = protocol.stages?.[stageIndex]?.viewports.length ?? 1;
      let numPanesWithData = 0;
      const { unsubscribe } = cornerstoneViewportService.subscribe(EVENT, evt => {
        numPanesWithData++;

        if (numPanesWithData === numPanes) {
          commandsManager.run(...command);

          // Unsubscribe from the event
          unsubscribe(EVENT);
        }
      });
    },

    setViewportPreset: ({ viewportId, preset }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        return;
      }
      viewport.setProperties({
        preset,
      });
      viewport.render();
    },

    /**
     * Sets the volume quality for a given viewport.
     * @param {string} viewportId - The ID of the viewport to set the volume quality.
     * @param {number} volumeQuality - The desired quality level of the volume rendering.
     */

    setVolumeRenderingQulaity: ({ viewportId, volumeQuality }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      const { actor } = viewport.getActors()[0];
      const mapper = actor.getMapper();
      const image = mapper.getInputData();
      const dims = image.getDimensions();
      const spacing = image.getSpacing();
      const spatialDiagonal = vec3.length(
        vec3.fromValues(dims[0] * spacing[0], dims[1] * spacing[1], dims[2] * spacing[2])
      );

      let sampleDistance = spacing.reduce((a, b) => a + b) / 3.0;
      sampleDistance /= volumeQuality > 1 ? 0.5 * volumeQuality ** 2 : 1.0;
      const samplesPerRay = spatialDiagonal / sampleDistance + 1;
      mapper.setMaximumSamplesPerRay(samplesPerRay);
      mapper.setSampleDistance(sampleDistance);
      viewport.render();
    },

    /**
     * Shifts opacity points for a given viewport id.
     * @param {string} viewportId - The ID of the viewport to set the mapping range.
     * @param {number} shift - The shift value to shift the points by.
     */
    shiftVolumeOpacityPoints: ({ viewportId, shift }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      const { actor } = viewport.getActors()[0];
      const ofun = actor.getProperty().getScalarOpacity(0);

      const opacityPointValues = []; // Array to hold values
      // Gather Existing Values
      const size = ofun.getSize();
      for (let pointIdx = 0; pointIdx < size; pointIdx++) {
        const opacityPointValue = [0, 0, 0, 0];
        ofun.getNodeValue(pointIdx, opacityPointValue);
        // opacityPointValue now holds [xLocation, opacity, midpoint, sharpness]
        opacityPointValues.push(opacityPointValue);
      }
      // Add offset
      opacityPointValues.forEach(opacityPointValue => {
        opacityPointValue[0] += shift; // Change the location value
      });
      // Set new values
      ofun.removeAllPoints();
      opacityPointValues.forEach(opacityPointValue => {
        ofun.addPoint(...opacityPointValue);
      });
      viewport.render();
    },

    /**
     * Sets the volume lighting settings for a given viewport.
     * @param {string} viewportId - The ID of the viewport to set the lighting settings.
     * @param {Object} options - The lighting settings to be set.
     * @param {boolean} options.shade - The shade setting for the lighting.
     * @param {number} options.ambient - The ambient setting for the lighting.
     * @param {number} options.diffuse - The diffuse setting for the lighting.
     * @param {number} options.specular - The specular setting for the lighting.
     **/

    setVolumeLighting: ({ viewportId, options }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      const { actor } = viewport.getActors()[0];
      const property = actor.getProperty();

      if (options.shade !== undefined) {
        property.setShade(options.shade);
      }

      if (options.ambient !== undefined) {
        property.setAmbient(options.ambient);
      }

      if (options.diffuse !== undefined) {
        property.setDiffuse(options.diffuse);
      }

      if (options.specular !== undefined) {
        property.setSpecular(options.specular);
      }

      viewport.render();
    },
    resetCrosshairs: ({ viewportId }) => {
      const crosshairInstances = [];

      const getCrosshairInstances = toolGroupId => {
        const toolGroup = toolGroupService.getToolGroup(toolGroupId);
        crosshairInstances.push(toolGroup.getToolInstance('Crosshairs'));
      };

      if (!viewportId) {
        const toolGroupIds = toolGroupService.getToolGroupIds();
        toolGroupIds.forEach(getCrosshairInstances);
      } else {
        const toolGroup = toolGroupService.getToolGroupForViewport(viewportId);
        getCrosshairInstances(toolGroup.id);
      }

      crosshairInstances.forEach(ins => {
        ins?.computeToolCenter();
      });
    },
    /**
     * Creates a labelmap for the active viewport
     */
    createLabelmapForViewport: async ({ viewportId, options = {} }) => {
      const { viewportGridService, displaySetService, segmentationService } =
        servicesManager.services;
      const { viewports } = viewportGridService.getState();
      const targetViewportId = viewportId;

      const viewport = viewports.get(targetViewportId);

      // Todo: add support for multiple display sets
      const displaySetInstanceUID =
        options.displaySetInstanceUID || viewport.displaySetInstanceUIDs[0];

      const segs = segmentationService.getSegmentations();

      const label = options.label || `Segmentation ${segs.length + 1}`;
      const segmentationId = options.segmentationId || `${csUtils.uuidv4()}`;

      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

      const generatedSegmentationId = await segmentationService.createLabelmapForDisplaySet(
        displaySet,
        {
          label,
          segmentationId,
          segments: options.createInitialSegment
            ? {
              1: {
                label: `${i18n.t('Segment')} 1`,
                active: true,
              },
            }
            : {},
        }
      );

      await segmentationService.addSegmentationRepresentation(viewportId, {
        segmentationId,
        type: Enums.SegmentationRepresentations.Labelmap,
      });

      return generatedSegmentationId;
    },

    /**
     * Sets the active segmentation for a viewport
     * @param props.segmentationId - The ID of the segmentation to set as active
     */
    setActiveSegmentation: ({ segmentationId }) => {
      const { viewportGridService, segmentationService } = servicesManager.services;
      segmentationService.setActiveSegmentation(
        viewportGridService.getActiveViewportId(),
        segmentationId
      );
    },

    /**
     * Adds a new segment to a segmentation
     * @param props.segmentationId - The ID of the segmentation to add the segment to
     */
    addSegmentCommand: ({ segmentationId }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.addSegment(segmentationId);
    },

    /**
     * Sets the active segment and jumps to its center
     * @param props.segmentationId - The ID of the segmentation
     * @param props.segmentIndex - The index of the segment to activate
     */
    setActiveSegmentAndCenterCommand: ({ segmentationId, segmentIndex }) => {
      const { segmentationService, viewportGridService } = servicesManager.services;
      // set both active segmentation and active segment
      segmentationService.setActiveSegmentation(
        viewportGridService.getActiveViewportId(),
        segmentationId
      );
      segmentationService.setActiveSegment(segmentationId, segmentIndex);
      segmentationService.jumpToSegmentCenter(segmentationId, segmentIndex);
    },

    /**
     * Toggles the visibility of a segment
     * @param props.segmentationId - The ID of the segmentation
     * @param props.segmentIndex - The index of the segment
     * @param props.type - The type of visibility to toggle
     */
    toggleSegmentVisibilityCommand: ({ segmentationId, segmentIndex, type }) => {
      const { segmentationService, viewportGridService } = servicesManager.services;
      segmentationService.toggleSegmentVisibility(
        viewportGridService.getActiveViewportId(),
        segmentationId,
        segmentIndex,
        type
      );
    },

    /**
     * Toggles the lock state of a segment
     * @param props.segmentationId - The ID of the segmentation
     * @param props.segmentIndex - The index of the segment
     */
    toggleSegmentLockCommand: ({ segmentationId, segmentIndex }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.toggleSegmentLocked(segmentationId, segmentIndex);
    },

    /**
     * Toggles the visibility of a segmentation representation
     * @param props.segmentationId - The ID of the segmentation
     * @param props.type - The type of representation
     */
    toggleSegmentationVisibilityCommand: ({ segmentationId, type }) => {
      const { segmentationService, viewportGridService } = servicesManager.services;
      segmentationService.toggleSegmentationRepresentationVisibility(
        viewportGridService.getActiveViewportId(),
        { segmentationId, type }
      );
    },

    /**
     * Downloads a segmentation
     * @param props.segmentationId - The ID of the segmentation to download
     */
    downloadSegmentationCommand: ({ segmentationId }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.downloadSegmentation(segmentationId);
    },

    /**
     * Stores a segmentation and shows it in the viewport
     * @param props.segmentationId - The ID of the segmentation to store
     */
    storeSegmentationCommand: async ({ segmentationId }) => {
      const { segmentationService, viewportGridService } = servicesManager.services;

      const displaySetInstanceUIDs = await createReportAsync({
        servicesManager,
        getReport: () =>
          commandsManager.runCommand('storeSegmentation', {
            segmentationId,
          }),
        reportType: 'Segmentation',
      });

      if (displaySetInstanceUIDs) {
        segmentationService.remove(segmentationId);
        viewportGridService.setDisplaySetsForViewport({
          viewportId: viewportGridService.getActiveViewportId(),
          displaySetInstanceUIDs,
        });
      }
    },

    /**
     * Downloads a segmentation as RTSS
     * @param props.segmentationId - The ID of the segmentation
     */
    downloadRTSSCommand: ({ segmentationId }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.downloadRTSS(segmentationId);
    },

    /**
     * Sets the style for a segmentation
     * @param props.segmentationId - The ID of the segmentation
     * @param props.type - The type of style
     * @param props.key - The style key to set
     * @param props.value - The style value
     */
    setSegmentationStyleCommand: ({ type, key, value }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.setStyle({ type }, { [key]: value });
    },

    /**
     * Deletes a segment from a segmentation
     * @param props.segmentationId - The ID of the segmentation
     * @param props.segmentIndex - The index of the segment to delete
     */
    deleteSegmentCommand: ({ segmentationId, segmentIndex }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.removeSegment(segmentationId, segmentIndex);
    },

    /**
     * Deletes an entire segmentation
     * @param props.segmentationId - The ID of the segmentation to delete
     */
    deleteSegmentationCommand: ({ segmentationId }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.remove(segmentationId);
    },

    /**
     * Removes a segmentation from the viewport
     * @param props.segmentationId - The ID of the segmentation to remove
     */
    removeSegmentationFromViewportCommand: ({ segmentationId }) => {
      const { segmentationService, viewportGridService } = servicesManager.services;
      segmentationService.removeSegmentationRepresentations(
        viewportGridService.getActiveViewportId(),
        { segmentationId }
      );
    },

    /**
     * Toggles rendering of inactive segmentations
     */
    toggleRenderInactiveSegmentationsCommand: () => {
      const { segmentationService, viewportGridService } = servicesManager.services;
      const viewportId = viewportGridService.getActiveViewportId();
      const renderInactive = segmentationService.getRenderInactiveSegmentations(viewportId);
      segmentationService.setRenderInactiveSegmentations(viewportId, !renderInactive);
    },

    /**
     * Sets the fill alpha value for a segmentation type
     * @param props.type - The type of segmentation
     * @param props.value - The alpha value to set
     */
    setFillAlphaCommand: ({ type, value }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.setStyle({ type }, { fillAlpha: value });
    },

    /**
     * Sets the outline width for a segmentation type
     * @param props.type - The type of segmentation
     * @param props.value - The width value to set
     */
    setOutlineWidthCommand: ({ type, value }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.setStyle({ type }, { outlineWidth: value });
    },

    /**
     * Sets whether to render fill for a segmentation type
     * @param props.type - The type of segmentation
     * @param props.value - Whether to render fill
     */
    setRenderFillCommand: ({ type, value }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.setStyle({ type }, { renderFill: value });
    },

    /**
     * Sets whether to render outline for a segmentation type
     * @param props.type - The type of segmentation
     * @param props.value - Whether to render outline
     */
    setRenderOutlineCommand: ({ type, value }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.setStyle({ type }, { renderOutline: value });
    },

    /**
     * Sets the fill alpha for inactive segmentations
     * @param props.type - The type of segmentation
     * @param props.value - The alpha value to set
     */
    setFillAlphaInactiveCommand: ({ type, value }) => {
      const { segmentationService } = servicesManager.services;
      segmentationService.setStyle({ type }, { fillAlphaInactive: value });
    },

    editSegmentLabel: async ({ segmentationId, segmentIndex }) => {
      const { segmentationService, uiDialogService } = servicesManager.services;
      const segmentation = segmentationService.getSegmentation(segmentationId);

      if (!segmentation) {
        return;
      }

      const segment = segmentation.segments[segmentIndex];

      callInputDialog({
        uiDialogService,
        title: 'Edit Segment Label',
        placeholder: 'Enter new label',
        defaultValue: segment.label,
      }).then(label => {
        segmentationService.setSegmentLabel(segmentationId, segmentIndex, label);
      });
    },

    editSegmentationLabel: ({ segmentationId }) => {
      const { segmentationService, uiDialogService } = servicesManager.services;
      const segmentation = segmentationService.getSegmentation(segmentationId);

      if (!segmentation) {
        return;
      }

      const { label } = segmentation;

      callInputDialog({
        uiDialogService,
        title: 'Edit Segmentation Label',
        placeholder: 'Enter new label',
        defaultValue: label,
      }).then(label => {
        segmentationService.addOrUpdateSegmentation({ segmentationId, label });
      });
    },

    editSegmentColor: ({ segmentationId, segmentIndex }) => {
      const { segmentationService, uiDialogService, viewportGridService } =
        servicesManager.services;
      const viewportId = viewportGridService.getActiveViewportId();
      const color = segmentationService.getSegmentColor(viewportId, segmentationId, segmentIndex);

      const rgbaColor = {
        r: color[0],
        g: color[1],
        b: color[2],
        a: color[3] / 255.0,
      };

      uiDialogService.show({
        content: colorPickerDialog,
        title: 'Segment Color',
        contentProps: {
          value: rgbaColor,
          onSave: newRgbaColor => {
            const color = [newRgbaColor.r, newRgbaColor.g, newRgbaColor.b, newRgbaColor.a * 255.0];
            segmentationService.setSegmentColor(viewportId, segmentationId, segmentIndex, color);
          },
        },
      });
    },

    getRenderInactiveSegmentations: () => {
      const { segmentationService, viewportGridService } = servicesManager.services;
      return segmentationService.getRenderInactiveSegmentations(
        viewportGridService.getActiveViewportId()
      );
    },
    deleteActiveAnnotation: () => {
      const activeAnnotationsUID = cornerstoneTools.annotation.selection.getAnnotationsSelected();
      activeAnnotationsUID.forEach(activeAnnotationUID => {
        measurementService.remove(activeAnnotationUID);
      });
    },
    // ESC ("Elimina ultima misurazione"):
    //  1) se c'è un disegno IN CORSO (handle in posizionamento), lo annulla
    //     (cornerstone `cancelActiveManipulations`, che ritorna l'UID annullato);
    //  2) altrimenti elimina l'ULTIMA misurazione creata (la più recente).
    cancelMeasurement: () => {
      const tryCancelOnElement = (element?: HTMLDivElement): boolean => {
        if (!element) {
          return false;
        }
        try {
          const cancelledUID = cornerstoneTools.cancelActiveManipulations(element);
          return !!cancelledUID;
        } catch (e) {
          return false;
        }
      };

      // 1) Annulla un eventuale disegno in corso (anche nelle celle montage).
      let cancelled = false;
      const montage = _getMontageCells();
      if (montage) {
        montage.cells.forEach(v => {
          cancelled = tryCancelOnElement(v.element as HTMLDivElement) || cancelled;
        });
      } else {
        cancelled = tryCancelOnElement(
          _getActiveViewportEnabledElement()?.viewport?.element as HTMLDivElement
        );
      }
      if (cancelled) {
        return;
      }

      // 2) Nessun disegno in corso → elimina l'ultima misurazione creata.
      const measurements = measurementService.getMeasurements();
      if (measurements?.length) {
        const last = measurements[measurements.length - 1];
        if (last?.uid) {
          measurementService.remove(last.uid);
        }
      }
    },
    undo: () => {
      DefaultHistoryMemo.undo();
    },
    redo: () => {
      DefaultHistoryMemo.redo();
    },
  };

  const definitions = {
    toggleMontage: {
      commandFn: actions.toggleMontage,
    },
    setMontageLayout: {
      commandFn: actions.setMontageLayout,
    },
    disableMontage: {
      commandFn: actions.disableMontage,
    },
    // The command here is to show the viewer context menu, as being the
    // context menu
    showCornerstoneContextMenu: {
      commandFn: actions.showCornerstoneContextMenu,
      options: {
        menuCustomizationId: 'measurementsContextMenu',
        commands: [
          {
            commandName: 'showContextMenu',
          },
        ],
      },
    },

    getNearbyToolData: {
      commandFn: actions.getNearbyToolData,
    },
    getNearbyAnnotation: {
      commandFn: actions.getNearbyAnnotation,
      storeContexts: [],
      options: {},
    },
    toggleViewportColorbar: {
      commandFn: actions.toggleViewportColorbar,
    },
    deleteMeasurement: {
      commandFn: actions.deleteMeasurement,
    },
    setMeasurementLabel: {
      commandFn: actions.setMeasurementLabel,
    },
    renameMeasurement: {
      commandFn: actions.renameMeasurement,
    },
    updateMeasurement: {
      commandFn: actions.updateMeasurement,
    },
    clearMeasurements: {
      commandFn: actions.clearMeasurements,
    },
    jumpToMeasurement: {
      commandFn: actions.jumpToMeasurement,
    },
    removeMeasurement: {
      commandFn: actions.removeMeasurement,
    },
    toggleLockMeasurement: {
      commandFn: actions.toggleLockMeasurement,
    },
    toggleVisibilityMeasurement: {
      commandFn: actions.toggleVisibilityMeasurement,
    },
    downloadCSVMeasurementsReport: {
      commandFn: actions.downloadCSVMeasurementsReport,
    },
    setViewportWindowLevel: {
      commandFn: actions.setViewportWindowLevel,
    },
    setWindowLevel: {
      commandFn: actions.setWindowLevel,
    },
    setWindowLevelPreset: {
      commandFn: actions.setWindowLevelPreset,
    },
    setWindowLevelPresetByIndex: {
      commandFn: actions.setWindowLevelPresetByIndex,
    },
    setToolActive: {
      commandFn: actions.setToolActive,
    },
    setToolActiveToolbar: {
      commandFn: actions.setToolActiveToolbar,
    },
    setToolEnabled: {
      commandFn: actions.setToolEnabled,
    },
    gestioneHP: {
      commandFn: actions.gestioneHP,
    },
    hideInfoDicom: {
      commandFn: actions.hideInfoDicom,
    },
    mprDirectClick: {
      commandFn: actions.mprDirectClick,
    },
    mprDirectClickForStorico: {
      commandFn: actions.mprDirectClickForStorico,
    },
    ptctDirectClick: {
      commandFn: actions.ptctDirectClick,
    },
    toggleCrosshairs: {
      commandFn: actions.toggleCrosshairs,
    },

    setHPPreferiti: {
      commandFn: actions.setHPPreferiti,
    },
    storeState: {
      commandFn: actions.storeState,
    },
    restoreState: {
      commandFn: actions.restoreState,
    },
    rotateViewportCW: {
      commandFn: actions.rotateViewport,
      options: { rotation: 90 },
    },
    rotateViewportCCW: {
      commandFn: actions.rotateViewport,
      options: { rotation: -90 },
    },
    incrementActiveViewport: {
      commandFn: actions.changeActiveViewport,
    },
    decrementActiveViewport: {
      commandFn: actions.changeActiveViewport,
      options: { direction: -1 },
    },
    flipViewportHorizontal: {
      commandFn: actions.flipViewportHorizontal,
    },
    flipViewportVertical: {
      commandFn: actions.flipViewportVertical,
    },
    invertViewport: {
      commandFn: actions.invertViewport,
    },
    setCamera: {
      commandFn: actions.setCamera,
    },
    resetViewport: {
      commandFn: actions.resetViewport,
    },
    zoomOneToOne: {
      commandFn: actions.zoomOneToOne,
    },
    Reset3DRotate: {
      commandFn: actions.Reset3DRotate,
    },
    scaleUpViewport: {
      commandFn: actions.scaleViewport,
      options: { direction: 1 },
    },
    scaleDownViewport: {
      commandFn: actions.scaleViewport,
      options: { direction: -1 },
    },
    fitViewportToWindow: {
      commandFn: actions.scaleViewport,
      options: { direction: 0 },
    },
    nextImage: {
      commandFn: actions.scroll,
      options: { direction: 1 },
    },
    previousImage: {
      commandFn: actions.scroll,
      options: { direction: -1 },
    },
    firstImage: {
      commandFn: actions.jumpToImage,
      options: { imageIndex: 0 },
    },
    lastImage: {
      commandFn: actions.jumpToImage,
      options: { imageIndex: -1 },
    },
    jumpToImage: {
      commandFn: actions.jumpToImage,
    },
    showDownloadViewportModal: {
      commandFn: actions.showDownloadViewportModal,
    },
    toggleCine: {
      commandFn: actions.toggleCine,
    },
    arrowTextCallback: {
      commandFn: actions.arrowTextCallback,
    },
    setViewportActive: {
      commandFn: actions.setViewportActive,
    },
    setViewportColormap: {
      commandFn: actions.setViewportColormap,
    },
    setSourceViewportForReferenceLinesTool: {
      commandFn: actions.setSourceViewportForReferenceLinesTool,
    },
    storePresentation: {
      commandFn: actions.storePresentation,
    },
    attachProtocolViewportDataListener: {
      commandFn: actions.attachProtocolViewportDataListener,
    },
    setViewportPreset: {
      commandFn: actions.setViewportPreset,
    },
    setVolumeRenderingQulaity: {
      commandFn: actions.setVolumeRenderingQulaity,
    },
    shiftVolumeOpacityPoints: {
      commandFn: actions.shiftVolumeOpacityPoints,
    },
    setVolumeLighting: {
      commandFn: actions.setVolumeLighting,
    },
    resetCrosshairs: {
      commandFn: actions.resetCrosshairs,
    },
    toggleSynchronizer: {
      commandFn: actions.toggleSynchronizer,
    },
    updateVolumeData: {
      commandFn: actions.updateVolumeData,
    },
    toggleEnabledDisabledToolbar: {
      commandFn: actions.toggleEnabledDisabledToolbar,
    },
    togglePassiveDisabledToolbar: {
      commandFn: actions.togglePassiveDisabledToolbar,
    },
    toggleActiveDisabledToolbar: {
      commandFn: actions.toggleActiveDisabledToolbar,
    },
    updateStoredPositionPresentation: {
      commandFn: actions.updateStoredPositionPresentation,
    },
    updateStoredSegmentationPresentation: {
      commandFn: actions.updateStoredSegmentationPresentation,
    },
    createLabelmapForViewport: {
      commandFn: actions.createLabelmapForViewport,
    },
    setActiveSegmentation: {
      commandFn: actions.setActiveSegmentation,
    },
    addSegment: {
      commandFn: actions.addSegmentCommand,
    },
    setActiveSegmentAndCenter: {
      commandFn: actions.setActiveSegmentAndCenterCommand,
    },
    toggleSegmentVisibility: {
      commandFn: actions.toggleSegmentVisibilityCommand,
    },
    toggleSegmentLock: {
      commandFn: actions.toggleSegmentLockCommand,
    },
    toggleSegmentationVisibility: {
      commandFn: actions.toggleSegmentationVisibilityCommand,
    },
    downloadSegmentation: {
      commandFn: actions.downloadSegmentationCommand,
    },
    storeSegmentation: {
      commandFn: actions.storeSegmentationCommand,
    },
    downloadRTSS: {
      commandFn: actions.downloadRTSSCommand,
    },
    setSegmentationStyle: {
      commandFn: actions.setSegmentationStyleCommand,
    },
    deleteSegment: {
      commandFn: actions.deleteSegmentCommand,
    },
    deleteSegmentation: {
      commandFn: actions.deleteSegmentationCommand,
    },
    removeSegmentationFromViewport: {
      commandFn: actions.removeSegmentationFromViewportCommand,
    },
    toggleRenderInactiveSegmentations: {
      commandFn: actions.toggleRenderInactiveSegmentationsCommand,
    },
    setFillAlpha: {
      commandFn: actions.setFillAlphaCommand,
    },
    setOutlineWidth: {
      commandFn: actions.setOutlineWidthCommand,
    },
    setRenderFill: {
      commandFn: actions.setRenderFillCommand,
    },
    setRenderOutline: {
      commandFn: actions.setRenderOutlineCommand,
    },
    setFillAlphaInactive: {
      commandFn: actions.setFillAlphaInactiveCommand,
    },
    editSegmentLabel: {
      commandFn: actions.editSegmentLabel,
    },
    editSegmentationLabel: {
      commandFn: actions.editSegmentationLabel,
    },
    editSegmentColor: {
      commandFn: actions.editSegmentColor,
    },
    getRenderInactiveSegmentations: {
      commandFn: actions.getRenderInactiveSegmentations,
    },
    deleteActiveAnnotation: {
      commandFn: actions.deleteActiveAnnotation,
    },
    cancelMeasurement: {
      commandFn: actions.cancelMeasurement,
    },
    undo: actions.undo,
    redo: actions.redo,
    interpolateLabelmap: actions.interpolateLabelmap,
    runSegmentBidirectional: actions.runSegmentBidirectional,
    downloadCSVSegmentationReport: actions.downloadCSVSegmentationReport,
  };

  return {
    actions,
    definitions,
    defaultContext: 'CORNERSTONE',
  };
}

export default commandsModule;
