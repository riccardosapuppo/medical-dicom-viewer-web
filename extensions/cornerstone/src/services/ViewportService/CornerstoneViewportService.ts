import { PubSubService } from '@ohif/core';
import { Types as OhifTypes } from '@ohif/core';
import {
  RenderingEngine,
  StackViewport,
  Types,
  getRenderingEngine,
  utilities as csUtils,
  VolumeViewport,
  VolumeViewport3D,
  cache,
  Enums as csEnums,
  BaseVolumeViewport,
  eventTarget,
  metaData,
} from '@cornerstonejs/core';

import { utilities as csToolsUtils, Enums as csToolsEnums } from '@cornerstonejs/tools';
import { IViewportService } from './IViewportService';
import { RENDERING_ENGINE_ID } from './constants';
import ViewportInfo, { DisplaySetOptions, PublicViewportOptions } from './Viewport';
import { StackViewportData, VolumeViewportData } from '../../types/CornerstoneCacheService';
import {
  LutPresentation,
  PositionPresentation,
  Presentations,
  SegmentationPresentation,
  SegmentationPresentationItem,
} from '../../types/Presentation';

import JumpPresets from '../../utils/JumpPresets';
import smartImageLoadManager from '../../utils/SmartImageLoadManager';
// eslint-disable-next-line import/no-relative-packages
import {
  applyFraming,
  clearFraming,
  framingBeforeResize,
  notifyFramingApplied,
} from '../../../../../platform/app/public/estensioni/gestioneHP/framing';
import { ViewportProperties } from '@cornerstonejs/core/types';
import { useLutPresentationStore } from '../../stores/useLutPresentationStore';
import { usePositionPresentationStore } from '../../stores/usePositionPresentationStore';
import { useSynchronizersStore } from '../../stores/useSynchronizersStore';
import { useSegmentationPresentationStore } from '../../stores/useSegmentationPresentationStore';

const EVENTS = {
  VIEWPORT_DATA_CHANGED: 'event::cornerstoneViewportService:viewportDataChanged',
  VIEWPORT_VOLUMES_CHANGED: 'event::cornerstoneViewportService:viewportVolumesChanged',
};

export const WITH_NAVIGATION = { withNavigation: true, withOrientation: true };

function isColorImageByImageId(imageId: string): boolean {
  if (!imageId) {
    return false;
  }

  const imagePixelModule =
    metaData.get(csEnums.MetadataModules.IMAGE_PIXEL, imageId) ||
    metaData.get('imagePixelModule', imageId) ||
    {};
  const photometric = imagePixelModule?.photometricInterpretation?.toUpperCase?.() || '';
  const samplesPerPixel = Number(imagePixelModule?.samplesPerPixel ?? 0);

  return (
    samplesPerPixel > 1 ||
    photometric.includes('RGB') ||
    photometric.includes('YBR') ||
    photometric.includes('PALETTE')
  );
}

/**
 * Handles cornerstone viewport logic including enabling, disabling, and
 * updating the viewport.
 */
class CornerstoneViewportService extends PubSubService implements IViewportService {
  static REGISTRATION = {
    name: 'cornerstoneViewportService',
    altName: 'CornerstoneViewportService',
    create: ({
      servicesManager,
    }: OhifTypes.Extensions.ExtensionParams): CornerstoneViewportService => {
      return new CornerstoneViewportService(servicesManager);
    },
  };

  renderingEngine: Types.IRenderingEngine | null;
  viewportsById: Map<string, ViewportInfo> = new Map();
  viewportGridResizeObserver: ResizeObserver | null;
  viewportsDisplaySets: Map<string, string[]> = new Map();
  beforeResizePositionPresentations: Map<string, PositionPresentation> = new Map();
  volumeIdToViewportIds: Map<string, Set<string>> = new Map();
  tooltipTimeoutByElement: Map<HTMLElement, ReturnType<typeof setTimeout>> = new Map();
  viewportIdToPendingVolumeIds: Map<string, Set<string>> = new Map();
  volumeIdleTimeoutByViewportId: Map<string, ReturnType<typeof setTimeout>> = new Map();
  lastVolumeInputArrayByViewportId: Map<string, any[]> = new Map();
  lastPresentationsByViewportId: Map<string, Presentations> = new Map();
  volume3DReapplyCleanupByViewportId: Map<string, () => void> = new Map();

  // Some configs
  enableResizeDetector: true;
  resizeRefreshRateMs: 200;
  resizeRefreshMode: 'debounce';
  servicesManager: AppTypes.ServicesManager = null;

  resizeQueue = [];
  viewportResizeTimer = null;
  gridResizeDelay = 50;
  gridResizeTimeOut = null;

  constructor(servicesManager: AppTypes.ServicesManager) {
    window.servicesManager = servicesManager;
    super(EVENTS);
    this.renderingEngine = null;
    this.viewportGridResizeObserver = null;
    this.servicesManager = servicesManager;
    eventTarget.addEventListener(
      csEnums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
      this._handleVolumeLoadingCompleted
    );
    eventTarget.addEventListener(
      csEnums.Events.IMAGE_VOLUME_MODIFIED,
      this._handleVolumeLoadingProgress
    );
  }

  hangingProtocolService: unknown;
  viewportsInfo: unknown;
  sceneVolumeInputs: unknown;
  viewportDivElements: unknown;
  ViewportPropertiesMap: unknown;
  volumeUIDs: unknown;
  displaySetsNeedRerendering: unknown;
  viewportDisplaySets: unknown;
  private _clearVolumeStateForViewport(viewportId: string, element?: HTMLElement) {
    if (!viewportId) {
      return;
    }
    const pending = this.viewportIdToPendingVolumeIds.get(viewportId);
    if (pending) {
      this.viewportIdToPendingVolumeIds.delete(viewportId);
    }
    const idleTimeout = this.volumeIdleTimeoutByViewportId.get(viewportId);
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      this.volumeIdleTimeoutByViewportId.delete(viewportId);
    }
    const volume3DCleanup = this.volume3DReapplyCleanupByViewportId.get(viewportId);
    if (volume3DCleanup) {
      volume3DCleanup();
    }

    const lastVolumeInputs = this.lastVolumeInputArrayByViewportId.get(viewportId) || [];
    lastVolumeInputs.forEach(input => {
      const volumeId = input?.volumeId;
      if (!volumeId) {
        return;
      }
      const viewportIds = this.volumeIdToViewportIds.get(volumeId);
      if (!viewportIds) {
        return;
      }
      viewportIds.delete(viewportId);
      if (!viewportIds.size) {
        this.volumeIdToViewportIds.delete(volumeId);
      } else {
        this.volumeIdToViewportIds.set(volumeId, viewportIds);
      }
    });

    if (element) {
      this.removeTooltipLoadingDynamicVolume(element);
      element.classList.remove('viewport-loading');
    }
  }

  /**
   * Adds the HTML element to the viewportService
   * @param {*} viewportId
   * @param {*} elementRef
   */

  public enableViewport(viewportId: string, elementRef: HTMLDivElement): void {
    const viewportInfo = new ViewportInfo(viewportId);
    viewportInfo.setElement(elementRef);
    this.viewportsById.set(viewportId, viewportInfo);
  }

  public getViewportIds(): string[] {
    return Array.from(this.viewportsById.keys());
  }

  /**
   * It retrieves the renderingEngine if it does exist, or creates one otherwise
   * @returns {RenderingEngine} rendering engine
   */
  public getRenderingEngine() {
    // get renderingEngine from cache if it exists
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);

    if (renderingEngine) {
      this.renderingEngine = renderingEngine;
      return this.renderingEngine;
    }

    if (!renderingEngine || renderingEngine.hasBeenDestroyed) {
      this.renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
    }

    return this.renderingEngine;
  }

  /**
   * It triggers the resize on the rendering engine, and renders the viewports
   *
   * @param isGridResize - if the resize is triggered by a grid resize
   * this is used to avoid double resize of the viewports since if the
   * grid is resized, all viewports will be resized so there is no need
   * to resize them individually which will get triggered by their
   * individual resize observers
   */
  public resize(isGridResize = false) {
    // https://stackoverflow.com/a/26279685
    // This resize() call, among other things, rerenders the viewports. But when the entire viewer is
    // display: none'd, it makes the size of all hidden elements 0, including the viewport canvas and its containers.
    // Even if the viewer is later displayed again, trying to render when the size is 0 permanently "breaks" the
    // viewport, making it fully black even after the size is normal again. So just ignore resize events when hidden:
    const areViewportsHidden = Array.from(this.viewportsById.values()).every(viewportInfo => {
      const element = viewportInfo.getElement();

      return element.clientWidth === 0 && element.clientHeight === 0;
    });
    if (areViewportsHidden) {
      console.warn('Ignoring resize when viewports have size 0');
      return;
    }

    // if there is a grid resize happening, it means the viewport grid
    // has been manipulated (e.g., panels closed, added, etc.) and we need
    // to resize all viewports, so we will add a timeout here to make sure
    // we don't double resize the viewports when viewports in the grid are
    // resized individually
    if (isGridResize) {
      this.performResize();
      this.resetGridResizeTimeout();
      this.resizeQueue = [];
      clearTimeout(this.viewportResizeTimer);
    } else {
      this.enqueueViewportResizeRequest();
    }
  }

  /**
   * Removes the viewport from cornerstone, and destroys the rendering engine
   */
  public destroy() {
    this._removeResizeObserver();
    this.viewportGridResizeObserver = null;
    try {
      this.renderingEngine?.destroy?.();
    } catch (e) {
      console.warn('Rendering engine not destroyed', e);
    }
    this.viewportsDisplaySets.clear();
    this.renderingEngine = null;
    cache.purgeCache();
  }

  /**
   * Disables the viewport inside the renderingEngine, if no viewport is left
   * it destroys the renderingEngine.
   *
   * This is called when the element goes away entirely - with new viewportId's
   * created for every new viewport, this will be called whenever the set of
   * viewports is changed, but NOT when the viewport position changes only.
   *
   * @param viewportId - The viewportId to disable
   */
  public disableElement(viewportId: string): void {
    this.renderingEngine?.disableElement(viewportId);

    // clean up
    this.viewportsById.delete(viewportId);
    this.viewportsDisplaySets.delete(viewportId);
  }

  /**
   * Sets the presentations for a given viewport. Presentations is an object
   * that can define the lut or position for a viewport.
   *
   * @param viewportId - The ID of the viewport.
   * @param presentations - The presentations to apply to the viewport.
   * @param viewportInfo - Contains a view reference for immediate application
   */
  public setPresentations(viewportId: string, presentations: Presentations): void {
    const viewport = this.getCornerstoneViewport(viewportId) as
      | Types.IStackViewport
      | Types.IVolumeViewport;

    if (!viewport || !presentations) {
      return;
    }

    const { lutPresentation, positionPresentation, segmentationPresentation } = presentations;

    // Always set the segmentation presentation first, since there might be some
    // lutpresentation states that need to be set on the segmentation
    // Todo: i think we should even await this
    this._setSegmentationPresentation(viewport, segmentationPresentation);

    this._setLutPresentation(viewport, lutPresentation);
    this._setPositionPresentation(viewport, { ...positionPresentation, viewportId });
  }

  /**
   * Stores the presentation state for a given viewport inside the
   * each store. This is used to persist the presentation state
   * across different scenarios e.g., when the viewport is changing the
   * display set, or when the viewport is moving to a different layout.
   *
   * @param viewportId The ID of the viewport.
   */
  public storePresentation({ viewportId }) {
    const presentationIds = this.getPresentationIds(viewportId);
    const { syncGroupService } = this.servicesManager.services;
    const synchronizers = syncGroupService.getSynchronizersForViewport(viewportId);

    if (!presentationIds || Object.keys(presentationIds).length === 0) {
      return null;
    }

    const { lutPresentationId, positionPresentationId, segmentationPresentationId } =
      presentationIds;

    const positionPresentation = this._getPositionPresentation(viewportId);
    const lutPresentation = this._getLutPresentation(viewportId);
    const segmentationPresentation = this._getSegmentationPresentation(viewportId);

    const { setLutPresentation } = useLutPresentationStore.getState();
    const { setPositionPresentation } = usePositionPresentationStore.getState();
    const { setSynchronizers } = useSynchronizersStore.getState();
    const { setSegmentationPresentation } = useSegmentationPresentationStore.getState();

    if (lutPresentationId) {
      setLutPresentation(lutPresentationId, lutPresentation);
    }

    if (positionPresentationId) {
      setPositionPresentation(positionPresentationId, positionPresentation);
    }

    if (segmentationPresentationId) {
      setSegmentationPresentation(segmentationPresentationId, segmentationPresentation);
    }

    if (synchronizers?.length) {
      setSynchronizers(
        viewportId,
        synchronizers.map(synchronizer => ({
          id: synchronizer.id,
          sourceViewports: [...synchronizer.getSourceViewports()],
          targetViewports: [...synchronizer.getTargetViewports()],
        }))
      );
    }
  }

  /**
   * Retrieves the presentations for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @returns The presentations for the viewport.
   */
  public getPresentations(viewportId: string): Presentations {
    const positionPresentation = this._getPositionPresentation(viewportId);
    const lutPresentation = this._getLutPresentation(viewportId);
    const segmentationPresentation = this._getSegmentationPresentation(viewportId);

    return {
      positionPresentation,
      lutPresentation,
      segmentationPresentation,
    };
  }

  private getPresentationIds(viewportId: string): AppTypes.PresentationIds | null {
    const viewportInfo = this.viewportsById.get(viewportId);
    if (!viewportInfo) {
      return null;
    }

    return viewportInfo.getPresentationIds();
  }

  private _getPositionPresentation(viewportId: string): PositionPresentation {
    const csViewport = this.getCornerstoneViewport(viewportId);
    if (!csViewport) {
      return;
    }

    const viewportInfo = this.viewportsById.get(viewportId);

    return {
      viewportType: viewportInfo.getViewportType(),
      viewReference: csViewport instanceof VolumeViewport3D ? null : csViewport.getViewReference(),
      viewPresentation: csViewport.getViewPresentation({ pan: true, zoom: true }),
      viewportId,
    };
  }

  private _getLutPresentation(viewportId: string): LutPresentation {
    const csViewport = this.getCornerstoneViewport(viewportId) as
      | Types.IStackViewport
      | Types.IVolumeViewport;

    if (!csViewport) {
      return;
    }

    const cleanProperties = properties => {
      if (properties?.isComputedVOI) {
        delete properties?.voiRange;
        delete properties?.VOILUTFunction;
      }
      return properties;
    };

    const properties =
      csViewport instanceof BaseVolumeViewport
        ? new Map()
        : cleanProperties(csViewport.getProperties());

    if (properties instanceof Map) {
      const volumeIds = (csViewport as Types.IBaseVolumeViewport).getAllVolumeIds();
      volumeIds?.forEach(volumeId => {
        const csProps = cleanProperties(csViewport.getProperties(volumeId));
        properties.set(volumeId, csProps);
      });
    }

    const viewportInfo = this.viewportsById.get(viewportId);

    return {
      viewportType: viewportInfo.getViewportType(),
      properties,
    };
  }

  private _getSegmentationPresentation(viewportId: string): SegmentationPresentation {
    const { segmentationService } = this.servicesManager.services;

    const presentation = segmentationService.getPresentation(viewportId);
    return presentation;
  }

  /**
   * Sets the viewport data for a viewport.
   * @param viewportId - The ID of the viewport to set the data for.
   * @param viewportData - The viewport data to set.
   * @param publicViewportOptions - The public viewport options.
   * @param publicDisplaySetOptions - The public display set options.
   * @param presentations - The presentations to set.
   */

  public setViewportData(
    viewportId: string,
    viewportData: StackViewportData | VolumeViewportData,
    publicViewportOptions: PublicViewportOptions,
    publicDisplaySetOptions: DisplaySetOptions[],
    presentations?: Presentations
  ): void {
    const renderingEngine = this.getRenderingEngine();

    // if not valid viewportData then return early
    if (viewportData.viewportType === csEnums.ViewportType.STACK) {
      // check if imageIds is valid
      if (!viewportData.data[0].imageIds?.length) {
        return;
      }
    }

    // This is the old viewportInfo, which may have old options but we might be
    // using its viewport (same viewportId as the new viewportInfo)
    const viewportInfo = this.viewportsById.get(viewportId);

    // Abort all in-flight prefetch/thumbnail requests for this viewport before
    // loading new data. This frees TCP slots immediately so the new series
    // loads without waiting for the old one to finish.
    smartImageLoadManager.abortRequestsForViewport(viewportId);

    // We should store the presentation for the current viewport since we can't only
    // rely to store it WHEN the viewport is disabled since we might keep around the
    // same viewport/element and just change the viewportData for it (drag and drop etc.)
    // the disableElement storePresentation handle would not be called in this case
    // and we would lose the presentation.
    this.storePresentation({ viewportId: viewportInfo.getViewportId() });

    // Todo: i don't like this here, move it
    this.servicesManager.services.segmentationService.clearSegmentationRepresentations(
      viewportInfo.getViewportId()
    );

    if (!viewportInfo) {
      throw new Error('element is not enabled for the given viewportId');
    }

    // override the viewportOptions and displaySetOptions with the public ones
    // since those are the newly set ones, we set them here so that it handles defaults
    const displaySetOptions = viewportInfo.setPublicDisplaySetOptions(publicDisplaySetOptions);
    // Specify an over-ride for the viewport type, even though it is in the public
    // viewport options, because the one in the viewportData is a requirement based on the
    // type of data being displayed.
    const viewportOptions = viewportInfo.setPublicViewportOptions(
      publicViewportOptions,
      viewportData.viewportType
    );

    const element = viewportInfo.getElement();
    const type = viewportInfo.getViewportType();
    const background = viewportInfo.getBackground();
    const orientation = viewportInfo.getOrientation();
    const displayArea = viewportInfo.getDisplayArea();

    const viewportInput: Types.PublicViewportInput = {
      viewportId,
      element,
      type,
      defaultOptions: {
        background,
        orientation,
        displayArea,
      },
    };

    // Rendering Engine Id set should happen before enabling the element
    // since there are callbacks that depend on the renderingEngine id
    // Todo: however, this is a limitation which means that we can't change
    // the rendering engine id for a given viewport which might be a super edge
    // case
    viewportInfo.setRenderingEngineId(renderingEngine.id);

    // Todo: this is not optimal at all, we are re-enabling the already enabled
    // element which is not what we want. But enabledElement as part of the
    // renderingEngine is designed to be used like this. This will trigger
    // ENABLED_ELEMENT again and again, which will run onEnableElement callbacks
    renderingEngine.enableElement(viewportInput);

    viewportInfo.setViewportOptions(viewportOptions);
    viewportInfo.setDisplaySetOptions(displaySetOptions);
    viewportInfo.setViewportData(viewportData);
    viewportInfo.setViewportId(viewportId);

    this.viewportsById.set(viewportId, viewportInfo);

    const viewport = renderingEngine.getViewport(viewportId);
    const displaySetPromise = this._setDisplaySets(
      viewport,
      viewportData,
      viewportInfo,
      presentations
    );

    // The broadcast event here ensures that listeners have a valid, up to date
    // viewport to access.  Doing it too early can result in exceptions or
    // invalid data.
    displaySetPromise.then(() => {
      this._broadcastEvent(this.EVENTS.VIEWPORT_DATA_CHANGED, {
        viewportData,
        viewportId,
      });
    });
  }

  /**
   * Retrieves the Cornerstone viewport with the specified ID.
   *
   * @param viewportId - The ID of the viewport.
   * @returns The Cornerstone viewport object if found, otherwise null.
   */
  public getCornerstoneViewport(viewportId: string): Types.IViewport | null {
    const viewportInfo = this.getViewportInfo(viewportId);

    if (!viewportInfo || !this.renderingEngine || this.renderingEngine.hasBeenDestroyed) {
      return null;
    }

    const viewport = this.renderingEngine.getViewport(viewportId);

    return viewport;
  }

  /**
   * Retrieves the viewport information for a given viewport ID. The viewport information
   * is the OHIF construct that holds different options and data for a given viewport and
   * is different from the cornerstone viewport.
   *
   * @param viewportId The ID of the viewport.
   * @returns The viewport information.
   */
  public getViewportInfo(viewportId: string): ViewportInfo {
    return this.viewportsById.get(viewportId);
  }

  /**
   * Looks through the viewports to see if the specified measurement can be
   * displayed in one of the viewports. This function tries to get a "best fit"
   * viewport to display the image in where it matches, in order:
   *   * Active viewport that can be navigated to the given image without orientation change
   *   * Other viewport that can be navigated to the given image without orientation change
   *   * Active viewport that can change orientation to display the image
   *   * Other viewport that can change orientation to display the image
   *
   * It returns `null` otherwise, indicating that a viewport needs display set/type
   * changes in order to display the image.
   *
   * Notes:
   *   * If the display set is displayed in multiple viewports all needing orientation change,
   *     then the active one or first one listed will be modified.  This can create unexpected
   *     behaviour for MPR views.
   *   * If the image is contained in multiple display sets, then the first one
   *     found will be navigated (active first, followed by first found)
   *
   * @param measurement - The measurement that is desired to view.
   * @param activeViewportId - the index that was active at the time the jump
   *          was initiated.
   * @return the viewportId that the measurement should be displayed in.
   */
  public getViewportIdToJump(activeViewportId: string, metadata): string {
    // First check if the active viewport can just be navigated to show the given item
    const activeViewport = this.getCornerstoneViewport(activeViewportId);
    if (activeViewport.isReferenceViewable(metadata, { withNavigation: true })) {
      return activeViewportId;
    }

    // Next, see if any viewport could be navigated to show the given item,
    // without considering orientation changes.
    for (const id of this.viewportsById.keys()) {
      const viewport = this.getCornerstoneViewport(id);
      if (viewport?.isReferenceViewable(metadata, { withNavigation: true })) {
        return id;
      }
    }

    // No viewport is in the right display set/orientation to show this, so see if
    // the active viewport could change orientations to show this
    if (
      activeViewport.isReferenceViewable(metadata, { withNavigation: true, withOrientation: true })
    ) {
      return activeViewportId;
    }

    // See if any viewport could show this with an orientation change
    for (const id of this.viewportsById.keys()) {
      const viewport = this.getCornerstoneViewport(id);
      if (
        viewport?.isReferenceViewable(metadata, { withNavigation: true, withOrientation: true })
      ) {
        return id;
      }
    }

    // No luck, need to update the viewport itself
    return null;
  }

  /**
   * Sets the image data for the given viewport.
   */
  private async _setOtherViewport(
    viewport: Types.IStackViewport,
    viewportData: StackViewportData,
    viewportInfo: ViewportInfo,
    _presentations: Presentations = {}
  ): Promise<void> {
    const [displaySet] = viewportData.data;
    this._clearVolumeStateForViewport(viewport.id, viewportInfo?.element);
    return viewport.setDataIds(displaySet.imageIds, {
      groupId: displaySet.displaySetInstanceUID,
      viewReference: viewportInfo.getViewReference(),
    });
  }

  private async _setStackViewport(
    viewport: Types.IStackViewport,
    viewportData: StackViewportData,
    viewportInfo: ViewportInfo,
    presentations: Presentations = {}
  ): Promise<void> {
    const displaySetOptions = viewportInfo.getDisplaySetOptions();
    const { element } = viewportInfo;
    this._clearVolumeStateForViewport(viewport.id, element);
    element.classList.add('viewport-loading');

    const displaySetInstanceUIDs = viewportData.data.map(data => data.displaySetInstanceUID);

    // based on the cache service construct always the first one is the non-overlay
    // and the rest are overlays

    this.viewportsDisplaySets.set(viewport.id, [...displaySetInstanceUIDs]);

    const { initialImageIndex, imageIds } = viewportData.data[0];

    // Use the slice index from any provided view reference, as the view reference
    // is being used to navigate to the initial view position for measurement
    // navigation and other navigation forcing specific views.
    let initialImageIndexToUse =
      presentations?.positionPresentation?.initialImageIndex ?? initialImageIndex;

    const { rotation, flipHorizontal, displayArea } = viewportInfo.getViewportOptions();

    const properties = { ...presentations.lutPresentation?.properties };
    if (!presentations.lutPresentation?.properties) {
      const { voi, voiInverted, colormap } = displaySetOptions[0];
      if (voi && (voi.windowWidth || voi.windowCenter)) {
        const { lower, upper } = csUtils.windowLevel.toLowHighRange(
          voi.windowWidth,
          voi.windowCenter
        );
        properties.voiRange = { lower, upper };
      }

      properties.invert = voiInverted ?? properties.invert;
      properties.colormap = colormap ?? properties.colormap;
    }

    viewport.element.addEventListener(csEnums.Events.VIEWPORT_NEW_IMAGE_SET, evt => {
      const { element } = evt.detail;

      if (element !== viewport.element) {
        return;
      }

      // Configure aggressive prefetch for smooth scrolling:
      // - minBefore/maxAfter: 5 images each direction (vs default 2)
      // - directionExtraImages: 20 during continuous scroll (vs default 10)
      // - preserveExistingPool: true to avoid clearing already-queued nearby images
      csToolsUtils.stackContextPrefetch.setConfiguration({
        maxImagesToPrefetch: Infinity,
        minBefore: 5,
        maxAfter: 5,
        directionExtraImages: 20,
        preserveExistingPool: true,
      });
      csToolsUtils.stackContextPrefetch.enable(element);
    });

    let imageIdsToSet = imageIds;
    const overlayProcessingResult = this._processExtraDisplaySetsForViewport(viewport);
    imageIdsToSet = overlayProcessingResult?.imageIds ?? imageIdsToSet;
    const firstImageIdForColorCheck = imageIdsToSet?.[0];

    if (properties.colormap !== undefined && isColorImageByImageId(firstImageIdForColorCheck)) {
      if (
        typeof window !== 'undefined' &&
        window?.localStorage?.getItem('ohifPaletteRuntimeDebug') === '1'
      ) {
        // eslint-disable-next-line no-console
        console.log('[ohifPaletteRuntime:stack:setStack:dropColormap]', {
          viewportId: viewport.id,
          imageId: firstImageIdForColorCheck,
          colormap: properties.colormap,
        });
      }
      delete properties.colormap;
    }

    const referencedImageId = presentations?.positionPresentation?.viewReference?.referencedImageId;
    if (referencedImageId) {
      initialImageIndexToUse = imageIdsToSet.indexOf(referencedImageId);
    }

    if (initialImageIndexToUse === undefined || initialImageIndexToUse === null) {
      initialImageIndexToUse = this._getInitialImageIndexForViewport(viewportInfo, imageIds) || 0;
    }

    return viewport.setStack(imageIdsToSet, initialImageIndexToUse).then(() => {
      // Nuovo stack sulla stessa viewport: l'inquadratura relativa memorizzata
      // apparteneva al contenuto precedente.
      clearFraming(viewport.id);
      if (!window.mdvAllReady) {
        window.mdvAllReady = true;
      }
      viewport.setProperties({ ...properties });
      this.setPresentations(viewport.id, presentations, viewportInfo);

      if (overlayProcessingResult?.addOverlayFn) {
        overlayProcessingResult.addOverlayFn();
      }

      if (displayArea) {
        viewport.setDisplayArea(displayArea);
      }
      if (rotation) {
        viewport.setProperties({ rotation });
      }
      if (flipHorizontal) {
        viewport.setCamera({ flipHorizontal: true });
      }

      if (!window.viewportsAlreadyHPApplied) {
        window.viewportsAlreadyHPApplied = [];
      }
        //Sperimentale - Applico istanza, camera (zoom/pan), window level (VOI) e color LUT salvati nell'hanging protocol
        const hpCameraSettings = window.cameraSettingsFromHPMdv?.[viewport.id];
        const hpVoiSettings = window.voiSettingsFromHPMdv?.[viewport.id];
        const hpColormap = window.colormapFromHPMdv?.[viewport.id];
        const hpImageIndex = window.imageIndexFromHPMdv?.[viewport.id];
        const hasHpImageIndex = Number.isFinite(hpImageIndex);
        if (
          viewport.id &&
          (hpCameraSettings || hpVoiSettings || hpColormap || hasHpImageIndex) &&
          !window.viewportsAlreadyHPApplied.includes(viewport.id)
        ) {
          const applyCameraAndVoi = () => {
            if (hpCameraSettings) {
              // Inquadratura RELATIVA salvata nell'HP (framing.js): indipendente
              // dalla dimensione della cella, quindi corretta anche quando l'HP
              // viene applicato in una cella diversa da quella del salvataggio
              // (storico affiancato, monitor diversi). Se assente o non
              // applicabile, percorso precedente INVARIATO.
              if (applyFraming(viewport, (hpCameraSettings as any).framing)) {
                notifyFramingApplied(viewport);
              } else {
                if (hpCameraSettings.viewPresentation) {
                  viewport.setViewPresentation(hpCameraSettings.viewPresentation);
                } else {
                  viewport.setCamera({
                    parallelScale: hpCameraSettings.parallelscale,
                    focalPoint: hpCameraSettings.focalpoint,
                    position: hpCameraSettings.position,
                  });
                }
              }
            }
            if (
              hpVoiSettings &&
              Number.isFinite(hpVoiSettings.lower) &&
              Number.isFinite(hpVoiSettings.upper)
            ) {
              try {
                viewport.setProperties({
                  voiRange: { lower: hpVoiSettings.lower, upper: hpVoiSettings.upper },
                });
              } catch (err) {
                console.warn('[HP] Applicazione window level fallita', err);
              }
            }
            if (hpColormap && (hpColormap.name || typeof hpColormap === 'string')) {
              try {
                viewport.setProperties({
                  colormap: typeof hpColormap === 'string' ? { name: hpColormap } : hpColormap,
                });
              } catch (err) {
                console.warn('[HP] Applicazione color LUT fallita', err);
              }
            }
            viewport.render();
          };

          const applyHpViewportSettings = () => {
            if (window.viewportsAlreadyHPApplied.includes(viewport.id)) {
              return;
            }
            // Marco subito come applicata: setImageIdIndex rilancia IMAGE_RENDERED
            // e non vogliamo rientrare in questo blocco.
            window.viewportsAlreadyHPApplied.push(viewport.id);
            // L'istanza va impostata PRIMA di camera/VOI: il cambio immagine
            // ricalcolerebbe il VOI di default sovrascrivendo il window level salvato.
            if (hasHpImageIndex && typeof (viewport as any).setImageIdIndex === 'function') {
              try {
                const maybePromise = (viewport as any).setImageIdIndex(hpImageIndex);
                if (maybePromise && typeof maybePromise.then === 'function') {
                  maybePromise.then(applyCameraAndVoi).catch(applyCameraAndVoi);
                } else {
                  applyCameraAndVoi();
                }
              } catch (err) {
                applyCameraAndVoi();
              }
            } else {
              applyCameraAndVoi();
            }
          };

          if (viewport.getImageData && viewport.getImageData()) {
            applyHpViewportSettings();
          } else {
            const onImageRendered = () => {
              element.removeEventListener(csEnums.Events.IMAGE_RENDERED, onImageRendered);
              applyHpViewportSettings();
            };
            element.addEventListener(csEnums.Events.IMAGE_RENDERED, onImageRendered);
          }
        }
      setTimeout(() => {
        element.classList.remove('viewport-loading');
      }, 0);
    });
  }

  private _getInitialImageIndexForViewport(
    viewportInfo: ViewportInfo,
    imageIds?: string[]
  ): number {
    const initialImageOptions = viewportInfo.getInitialImageOptions();
    if (!initialImageOptions) {
      return;
    }
    const { index, preset } = initialImageOptions;
    const viewportType = viewportInfo.getViewportType();

    let numberOfSlices;
    if (viewportType === csEnums.ViewportType.STACK) {
      numberOfSlices = imageIds.length;
    } else if (viewportType === csEnums.ViewportType.ORTHOGRAPHIC) {
      const viewport = this.getCornerstoneViewport(viewportInfo.getViewportId());
      const imageSliceData = csUtils.getImageSliceDataForVolumeViewport(viewport);

      if (!imageSliceData) {
        return;
      }

      ({ numberOfSlices } = imageSliceData);
    } else {
      return;
    }

    return this._getInitialImageIndex(numberOfSlices, index, preset);
  }

  _getInitialImageIndex(numberOfSlices: number, imageIndex?: number, preset?: JumpPresets): number {
    const lastSliceIndex = numberOfSlices - 1;

    if (imageIndex !== undefined) {
      return csUtils.clip(imageIndex, 0, lastSliceIndex);
    }

    if (preset === JumpPresets.First) {
      return 0;
    }

    if (preset === JumpPresets.Last) {
      return lastSliceIndex;
    }

    if (preset === JumpPresets.Middle) {
      // Note: this is a simple but yet very important formula.
      // since viewport reset works with the middle slice
      // if the below formula is not correct, on a viewport reset
      // it will jump to a different slice than the middle one which
      // was the initial slice, and we have some tools such as Crosshairs
      // which rely on a relative camera modifications and those will break.
      return lastSliceIndex % 2 === 0 ? lastSliceIndex / 2 : (lastSliceIndex + 1) / 2;
    }

    return 0;
  }

  async _setVolumeViewport(
    viewport: Types.IVolumeViewport,
    viewportData: VolumeViewportData,
    viewportInfo: ViewportInfo,
    presentations: Presentations = {}
  ): Promise<void> {
    // TODO: We need to overhaul the way data sources work so requests can be made
    // async. I think we should follow the image loader pattern which is async and
    // has a cache behind it.
    // The problem is that to set this volume, we need the metadata, but the request is
    // already in-flight, and the promise is not cached, so we have no way to wait for
    // it and know when it has fully arrived.
    // loadStudyMetadata(StudyInstanceUID) => Promise([instances for study])
    // loadSeriesMetadata(StudyInstanceUID, SeriesInstanceUID) => Promise([instances for series])
    // If you call loadStudyMetadata and it's not in the DicomMetadataStore cache, it should fire
    // a request through the data source?
    // (This call may or may not create sub-requests for series metadata)

    const volumeInputArray = [];
    const displaySetOptionsArray = viewportInfo.getDisplaySetOptions();
    const { element } = viewportInfo;
    const { hangingProtocolService } = this.servicesManager.services;

    const volumeToLoad = [];
    const displaySetInstanceUIDs = [];

    // Cancel loading for any previous volumes still in-flight on this viewport.
    // This calls volume.cancelLoading() which removes queued requests from the
    // pool AND sets loadStatus.cancelled so callbacks are ignored.
    // SmartImageLoadManager additionally aborts the in-flight XHRs.
    this.volumeIdToViewportIds.forEach((vpIdsSet, volId) => {
      if (vpIdsSet.has(viewport.id)) {
        // If this viewport is the ONLY one using this volume, cancel its loading
        // and abort all in-flight XHRs for it via SmartImageLoadManager
        if (vpIdsSet.size === 1) {
          try {
            const vol = cache.getVolume(volId);
            if (vol && vol.loadStatus?.loading && !vol.loadStatus?.loaded) {
              vol.cancelLoading?.();
              // Also abort the actual HTTP requests (cancelLoading only filters the queue)
              smartImageLoadManager.abortRequestsForVolume(volId);
              console.debug(`[CornerstoneViewportService] cancelled volume loading + XHR abort: ${volId}`);
            }
          } catch (e) {
            // Volume may already be removed from cache
          }
        }
        vpIdsSet.delete(viewport.id);
        if (vpIdsSet.size === 0) {
          this.volumeIdToViewportIds.delete(volId);
        }
      }
    });
    // Also drop any pending-volume bookkeeping tied to this viewport — the
    // new setVolumesForViewport call below will repopulate it correctly
    // based on the loadStatus of the incoming volumes.
    this.viewportIdToPendingVolumeIds.delete(viewport.id);

    for (const [index, data] of viewportData.data.entries()) {
      const { volume, imageIds, displaySetInstanceUID } = data;

      displaySetInstanceUIDs.push(displaySetInstanceUID);

      if (!volume) {
        console.log('Volume display set not found');
        continue;
      }

      volumeToLoad.push(volume);

      const displaySetOptions = displaySetOptionsArray[index];
      const { volumeId } = volume;
      volumeInputArray.push({
        imageIds,
        volumeId,
        blendMode: displaySetOptions.blendMode,
        slabThickness: this._getSlabThickness(displaySetOptions, volumeId),
      });
      if (volumeId) {
        let viewportIds = this.volumeIdToViewportIds.get(volumeId);
        if (!viewportIds) {
          viewportIds = new Set();
          this.volumeIdToViewportIds.set(volumeId, viewportIds);
        }
        viewportIds.add(viewport.id);
      }
    }

    this.viewportsDisplaySets.set(viewport.id, displaySetInstanceUIDs);
    this.lastVolumeInputArrayByViewportId.set(viewport.id, volumeInputArray);
    this.lastPresentationsByViewportId.set(viewport.id, presentations);

    const volumesNotLoaded = volumeToLoad.filter(volume => !volume.loadStatus?.loaded);
    const pendingVolumeIds = new Set(
      volumeToLoad
        .filter(volume => volume.loadStatus?.loading || !volume.loadStatus?.loaded)
        .map(volume => volume.volumeId)
        .filter(Boolean)
    );
    if (pendingVolumeIds.size) {
      this.viewportIdToPendingVolumeIds.set(viewport.id, pendingVolumeIds);
      element.classList.add('viewport-loading');
      if (!document.body.classList.contains('hp-mpr-active')) {
        this.createTooltipLoadingDynamicVolume(element);
      }
      this._scheduleVolumeIdleClear(viewport.id, element);
    } else {
      this.viewportIdToPendingVolumeIds.delete(viewport.id);
      const idleTimeout = this.volumeIdleTimeoutByViewportId.get(viewport.id);
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        this.volumeIdleTimeoutByViewportId.delete(viewport.id);
      }
      this.removeTooltipLoadingDynamicVolume(element);
      element.classList.remove('viewport-loading');
    }
    if (volumesNotLoaded.length) {
      const hasDynamicVolume = volumeToLoad.some(
        volume => volume?.isDynamicVolume?.() || volume?.isDynamicVolume
      );
      if (!hasDynamicVolume && hangingProtocolService.getShouldPerformCustomImageLoad()) {
        // delegate the volume loading to the hanging protocol service if it has a custom image load strategy
        const customApplied = hangingProtocolService.runImageLoadStrategy({
          viewportId: viewport.id,
          volumeInputArray,
        });
        if (customApplied) {
          return customApplied;
        }
        console.warn('Custom image load strategy failed, fallback to default volume loading');
      }

      volumesNotLoaded.forEach(volume => {
        if (!volume.loadStatus?.loading && volume.load instanceof Function) {
          if (!document.body.classList.contains('hp-mpr-active')) {
            this.createTooltipLoadingDynamicVolume(element)
          }
          volume.load();
        }
      });
    }

    // It's crucial not to return here because the volume may be loaded,
    // but the viewport also needs to set the volume.
    // if (!volumesNotLoaded.length) {
    //   return;
    // }

    // This returns the async continuation only
    return this.setVolumesForViewport(viewport, volumeInputArray, presentations);
  }

  public createTooltipLoadingDynamicVolume = (element) => {
    //Indico che la viewport per volume dinamico ha bisogno di caricamento
    try {
      if (element.querySelector('.tooltip-loading-dynamic')) {
        return;
      }
      // The same tooltip is reused across workflows that need volume loading.
      // When the PT/CT fusion layout is active the "Volume dinamico" label is
      // misleading (it's not a 4D volume), so adapt the wording by context.
      const isPtctContext = document.body.classList.contains('hp-ptct-active');
      const label = isPtctContext
        ? 'Caricamento serie PET/CT...'
        : 'Volume dinamico in caricamento...';
      element.insertAdjacentHTML('afterbegin', `
        <div style="background: #952c2c;color: #fff;padding: 0 5px; font-size: 0.8rem; z-index: 9999; position:relative" class="tooltip-loading-dynamic">
        <p>${label}</p>
        </div>
        `)
      const existingTimeout = this.tooltipTimeoutByElement.get(element);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      const timeoutId = setTimeout(() => {
        this.removeTooltipLoadingDynamicVolume(element);
        element.classList.remove('viewport-loading');
      }, 60000);
      this.tooltipTimeoutByElement.set(element, timeoutId);
    } catch (err) {
      console.error('Errore creazione tooltip caricamento volume dinamico')
    }
  }

  public removeTooltipLoadingDynamicVolume = (element) => {
    if (!element) {
      return;
    }
    const timeoutId = this.tooltipTimeoutByElement.get(element);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.tooltipTimeoutByElement.delete(element);
    }
    const tooltip = element.querySelector('.tooltip-loading-dynamic');
    if (tooltip) {
      tooltip.remove();
    }
  }

  private _armVolume3DPresetReapply(
    viewport: VolumeViewport3D,
    volumesProperties: Array<{ properties: ViewportProperties; volumeId: string }>
  ) {
    const viewportId = viewport.id;
    const prev = this.volume3DReapplyCleanupByViewportId.get(viewportId);
    if (prev) {
      prev();
    }

    const targets = volumesProperties.filter(
      ({ properties }) => properties && (properties as any).preset
    );
    if (!targets.length) {
      return;
    }

    const element = viewport.element as HTMLElement | undefined;
    // Spinner: reuse the existing .viewport-loading CSS, which renders a
    // centered rotating overlay. Removed once the preset has been bound for
    // every target volume (or via cleanup on safety timeout / teardown).
    if (element) {
      element.classList.add('viewport-loading');
    }

    const remaining = new Set(targets.map(t => t.volumeId));

    const reapply = (volumeId: string) => {
      const target = targets.find(t => t.volumeId === volumeId);
      if (!target) {
        return;
      }
      try {
        viewport.setProperties(
          { preset: (target.properties as any).preset },
          volumeId
        );
        viewport.render();
      } catch (e) {
        console.warn('[mdv][volume3d] preset re-apply failed', e);
      }
    };

    let safetyTimeout: ReturnType<typeof setTimeout>;
    let cachedHotPathTimeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      try {
        eventTarget.removeEventListener(
          csEnums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
          onLoaded
        );
      } catch (_) {}
      clearTimeout(safetyTimeout);
      if (cachedHotPathTimeout) {
        clearTimeout(cachedHotPathTimeout);
      }
      if (element) {
        element.classList.remove('viewport-loading');
      }
      this.volume3DReapplyCleanupByViewportId.delete(viewportId);
    };

    const onLoaded = (evt: any) => {
      const volumeId = evt?.detail?.volumeId;
      if (!volumeId || !remaining.has(volumeId)) {
        return;
      }
      remaining.delete(volumeId);
      reapply(volumeId);
      if (!remaining.size) {
        cleanup();
      }
    };

    // Hot path: when the user revisits a series whose volume is already
    // loaded in cache, IMAGE_VOLUME_LOADING_COMPLETED never fires again. The
    // synchronous setProperties() in setVolumesForViewport still races with
    // the actor swap, so the artifact briefly reappears. Reapply on the next
    // tick to cover this case without waiting on the 3s safety timeout.
    const allCached = targets.every(t => {
      const vol: any = cache.getVolume?.(t.volumeId);
      return vol?.loadStatus?.loaded === true;
    });
    if (allCached) {
      cachedHotPathTimeout = setTimeout(() => {
        const pending = Array.from(remaining);
        remaining.clear();
        pending.forEach(volumeId => reapply(volumeId));
        cleanup();
      }, 50);
    }

    safetyTimeout = setTimeout(() => {
      remaining.forEach(volumeId => reapply(volumeId));
      cleanup();
    }, 3000);

    eventTarget.addEventListener(
      csEnums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
      onLoaded
    );
    this.volume3DReapplyCleanupByViewportId.set(viewportId, cleanup);
  }

  private _scheduleVolumeIdleClear(viewportId: string, element: HTMLElement) {
    const existingTimeout = this.volumeIdleTimeoutByViewportId.get(viewportId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    const timeoutId = setTimeout(() => {
      this.volumeIdleTimeoutByViewportId.delete(viewportId);
      this.viewportIdToPendingVolumeIds.delete(viewportId);
      this.removeTooltipLoadingDynamicVolume(element);
      element.classList.remove('viewport-loading');
    }, 15000);
    this.volumeIdleTimeoutByViewportId.set(viewportId, timeoutId);
  }

  private _handleVolumeLoadingProgress = (evt: any) => {
    const volumeId = evt?.detail?.volumeId;
    if (!volumeId) {
      return;
    }
    const viewportIds = this.volumeIdToViewportIds.get(volumeId);
    if (!viewportIds) {
      return;
    }
    viewportIds.forEach(viewportId => {
      const viewportInfo = this.getViewportInfo(viewportId);
      const element = viewportInfo?.element;
      if (!element) {
        return;
      }
      element.classList.add('viewport-loading');
      if (!document.body.classList.contains('hp-mpr-active')) {
        this.createTooltipLoadingDynamicVolume(element);
      }
      this._scheduleVolumeIdleClear(viewportId, element);
    });
  }

  private _handleVolumeLoadingCompleted = (evt: any) => {
    const volumeId = evt?.detail?.volumeId;
    if (!volumeId) {
      return;
    }
    const viewportIds = this.volumeIdToViewportIds.get(volumeId);
    if (!viewportIds) {
      return;
    }
    viewportIds.forEach(viewportId => {
      const pending = this.viewportIdToPendingVolumeIds.get(viewportId);
      if (pending) {
        pending.delete(volumeId);
        if (!pending.size) {
          this.viewportIdToPendingVolumeIds.delete(viewportId);
        } else {
          this.viewportIdToPendingVolumeIds.set(viewportId, pending);
        }
      }
      const viewportInfo = this.getViewportInfo(viewportId);
      const element = viewportInfo?.element;
      const viewport = this.getCornerstoneViewport(viewportId);
      if (element) {
        const stillPending = this.viewportIdToPendingVolumeIds.get(viewportId);
        if (!stillPending || !stillPending.size) {
          const idleTimeout = this.volumeIdleTimeoutByViewportId.get(viewportId);
          if (idleTimeout) {
            clearTimeout(idleTimeout);
            this.volumeIdleTimeoutByViewportId.delete(viewportId);
          }
          this.removeTooltipLoadingDynamicVolume(element);
          element.classList.remove('viewport-loading');
        }
      }
      if (viewport instanceof BaseVolumeViewport) {
        const hasActors = viewport.getActors?.()?.length;
        if (!hasActors) {
          const volumeInputArray = this.lastVolumeInputArrayByViewportId.get(viewportId);
          const presentations = this.lastPresentationsByViewportId.get(viewportId) || {};
          if (volumeInputArray?.length) {
            this.setVolumesForViewport(viewport, volumeInputArray, presentations);
          }
        }
      }
    });
    if (!window.mdvAllReady) {
      window.mdvAllReady = true;
    }
  }

  public async setVolumesForViewport(viewport, volumeInputArray, presentations) {
    const { displaySetService, viewportGridService } = this.servicesManager.services;

    const viewportInfo = this.getViewportInfo(viewport.id);
    const { element } = viewportInfo;
    element.insertAdjacentHTML
    const displaySetOptions = viewportInfo.getDisplaySetOptions();
    const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(viewport.id);
    const displaySet = displaySetService.getDisplaySetByUID(displaySetUIDs[0]);
    const displaySetModality = displaySet?.Modality;
    // Todo: use presentations states
    const volumesProperties = volumeInputArray.map((volumeInput, index) => {
      const { volumeId } = volumeInput;
      const displaySetOption = displaySetOptions[index];
      const { voi, voiInverted, colormap, displayPreset } = displaySetOption;
      const properties = {} as ViewportProperties;

      if (voi && (voi.windowWidth || voi.windowCenter)) {
        const { lower, upper } = csUtils.windowLevel.toLowHighRange(
          voi.windowWidth,
          voi.windowCenter
        );
        properties.voiRange = { lower, upper };
      }

      if (voiInverted !== undefined) {
        properties.invert = voiInverted;
      }

      if (colormap !== undefined) {
        properties.colormap = colormap;
      }

      if (displayPreset !== undefined) {
        properties.preset = displayPreset[displaySetModality] || displayPreset.default;
      }

      return { properties, volumeId };
    });

    // For SEG and RT viewports
    const { addOverlayFn } = this._processExtraDisplaySetsForViewport(viewport) || {};

    await viewport.setVolumes(volumeInputArray);

    if (addOverlayFn) {
      addOverlayFn();
    }

    volumesProperties.forEach(({ properties, volumeId }) => {
      viewport.setProperties(properties, volumeId);
    });

    // mdv: Volume3D preset race-condition safety net.
    // setProperties({preset}) may silently no-op when it runs right after
    // setVolumes() because the voxel data isn't mapped yet — the transfer
    // function never gets bound and the 3D renders as a degenerate slab
    // (the "flat/2D-looking" artifact). Arm a listener to re-apply the
    // preset once the volume finishes loading. Covers first MPR activation
    // AND every series change inside MPR.
    if (viewport instanceof VolumeViewport3D) {
      this._armVolume3DPresetReapply(viewport, volumesProperties);
    }

    this.setPresentations(viewport.id, presentations, viewportInfo);
    if (!window.mdvAllReady) {
      window.mdvAllReady = true;
    }

    const imageIndex = this._getInitialImageIndexForViewport(viewportInfo);

    if (imageIndex !== undefined) {
      csUtils.jumpToSlice(viewport.element, {
        imageIndex,
      });
    }
    viewport.render();

    this._broadcastEvent(this.EVENTS.VIEWPORT_VOLUMES_CHANGED, {
      viewportInfo,
    });
    const pending = this.viewportIdToPendingVolumeIds.get(viewport.id);
    if (!pending || !pending.size) {
      element.classList.remove('viewport-loading');
    }
  }

  private _processExtraDisplaySetsForViewport(
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ) {
    const { displaySetService } = this.servicesManager.services;

    // load any secondary displaySets
    const displaySetInstanceUIDs = this.viewportsDisplaySets.get(viewport.id);

    // Can be SEG or RTSTRUCT for now but not PMAP
    const segOrRTSOverlayDisplaySet = displaySetInstanceUIDs
      .map(displaySetService.getDisplaySetByUID)
      .find(
        displaySet =>
          displaySet?.isOverlayDisplaySet && ['SEG', 'RTSTRUCT'].includes(displaySet.Modality)
      );

    // if it is only the overlay displaySet, then we need to get the reference
    // displaySet imageIds and set them as the imageIds for the viewport,
    // here we can do some logic if the reference is missing
    // then find the most similar match of displaySet instead
    if (!segOrRTSOverlayDisplaySet) {
      return;
    }

    const referenceDisplaySet = displaySetService.getDisplaySetByUID(
      segOrRTSOverlayDisplaySet.referencedDisplaySetInstanceUID
    );
    const imageIds = referenceDisplaySet.images.map(image => image.imageId);

    return {
      imageIds,
      addOverlayFn: () =>
        this.addOverlayRepresentationForDisplaySet(segOrRTSOverlayDisplaySet, viewport),
    };
  }

  private addOverlayRepresentationForDisplaySet(
    displaySet: OhifTypes.DisplaySet,
    viewport: Types.IViewport
  ) {
    const { segmentationService } = this.servicesManager.services;
    const segmentationId = displaySet.displaySetInstanceUID;

    const representationType =
      displaySet.Modality === 'SEG'
        ? csToolsEnums.SegmentationRepresentations.Labelmap
        : csToolsEnums.SegmentationRepresentations.Contour;

    segmentationService.addSegmentationRepresentation(viewport.id, {
      segmentationId,
      type: representationType,
    });

    // store the segmentation presentation id in the viewport info
    this.storePresentation({ viewportId: viewport.id });
  }

  // Todo: keepCamera is an interim solution until we have a better solution for
  // keeping the camera position when the viewport data is changed
  public updateViewport(viewportId: string, viewportData, keepCamera = false) {
    const viewportInfo = this.getViewportInfo(viewportId);
    const viewport = this.getCornerstoneViewport(viewportId);
    const viewportCamera = viewport.getCamera();

    let displaySetPromise;

    if (viewport instanceof VolumeViewport || viewport instanceof VolumeViewport3D) {
      displaySetPromise = this._setVolumeViewport(viewport, viewportData, viewportInfo).then(() => {
        if (keepCamera) {
          viewport.setCamera(viewportCamera);
          viewport.render();
        }
      });
    }

    if (viewport instanceof StackViewport) {
      displaySetPromise = this._setStackViewport(viewport, viewportData, viewportInfo);
    }

    displaySetPromise.then(() => {
      this._broadcastEvent(this.EVENTS.VIEWPORT_DATA_CHANGED, {
        viewportData,
        viewportId,
      });
    });
  }

  _setDisplaySets(
    viewport: Types.IViewport,
    viewportData: StackViewportData | VolumeViewportData,
    viewportInfo: ViewportInfo,
    presentations: Presentations = {}
  ): Promise<void> {
    if (viewport instanceof StackViewport) {
      return this._setStackViewport(
        viewport,
        viewportData as StackViewportData,
        viewportInfo,
        presentations
      );
    }

    if ([VolumeViewport, VolumeViewport3D].some(type => viewport instanceof type)) {
      return this._setVolumeViewport(
        viewport as Types.IVolumeViewport,
        viewportData as VolumeViewportData,
        viewportInfo,
        presentations
      );
    }

    return this._setOtherViewport(
      viewport,
      viewportData as StackViewportData,
      viewportInfo,
      presentations
    );
  }

  /**
   * Removes the resize observer from the viewport element
   */
  _removeResizeObserver() {
    if (this.viewportGridResizeObserver) {
      this.viewportGridResizeObserver.disconnect();
    }
  }

  _getSlabThickness(displaySetOptions, volumeId) {
    const { blendMode } = displaySetOptions;
    if (blendMode === undefined || displaySetOptions.slabThickness === undefined) {
      return;
    }

    // if there is a slabThickness set as a number then use it
    if (typeof displaySetOptions.slabThickness === 'number') {
      return displaySetOptions.slabThickness;
    }

    if (displaySetOptions.slabThickness.toLowerCase() === 'fullvolume') {
      // calculate the slab thickness based on the volume dimensions
      const imageVolume = cache.getVolume(volumeId);

      const { dimensions, spacing } = imageVolume;
      const slabThickness = Math.sqrt(
        Math.pow(dimensions[0] * spacing[0], 2) +
        Math.pow(dimensions[1] * spacing[1], 2) +
        Math.pow(dimensions[2] * spacing[2], 2)
      );

      return slabThickness;
    }
  }

  _getFrameOfReferenceUID(displaySetInstanceUID) {
    const { displaySetService } = this.servicesManager.services;
    const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

    if (!displaySet) {
      return;
    }

    if (displaySet.frameOfReferenceUID) {
      return displaySet.frameOfReferenceUID;
    }

    if (displaySet.Modality === 'SEG') {
      const { instance } = displaySet;
      return instance.FrameOfReferenceUID;
    }

    if (displaySet.Modality === 'RTSTRUCT') {
      const { instance } = displaySet;
      return instance.ReferencedFrameOfReferenceSequence.FrameOfReferenceUID;
    }

    const { images } = displaySet;
    if (images && images.length) {
      return images[0].FrameOfReferenceUID;
    }
  }

  private enqueueViewportResizeRequest() {
    this.resizeQueue.push(false); // false indicates viewport resize

    clearTimeout(this.viewportResizeTimer);
    this.viewportResizeTimer = setTimeout(() => {
      this.processViewportResizeQueue();
    }, this.gridResizeDelay);
  }

  private processViewportResizeQueue() {
    const isGridResizeInQueue = this.resizeQueue.some(isGridResize => isGridResize);
    if (this.resizeQueue.length > 0 && !isGridResizeInQueue && !this.gridResizeTimeOut) {
      this.performResize();
    }

    // Clear the queue after processing viewport resizes
    this.resizeQueue = [];
  }

  private performResize() {
    const isImmediate = false;

    try {
      // La mappa va svuotata a ogni giro: conserva una entry per viewportId e non
      // veniva mai ripulita, quindi accumulava le viewport smontate (tipico del
      // toggle one-up, dove le celle che spariscono vengono poi ricreate con lo
      // STESSO viewportId). Al resize successivo quelle entry vecchie venivano
      // riapplicate alla cella ricreata, riportandola a una posizione di parecchi
      // resize prima.
      this.beforeResizePositionPresentations.clear();
      const viewports = this.getRenderingEngine().getViewports();
      // Inquadratura RELATIVA per viewport (vedi estensioni/gestioneHP/framing.js):
      // fotografata PRIMA del resize (stato cornerstone ancora coerente) e
      // ri-applicata DOPO, cosi' la posizione scelta dall'utente sopravvive al
      // cambio di dimensione della cella (storico affiancato, one-up, pannelli).
      const framingsBeforeResize = new Map<string, any>();

      // Store the current position presentations for each viewport.
      viewports.forEach(({ id: viewportId }) => {
        const presentation = this._getPositionPresentation(viewportId);

        // Alcune viewport presenti nel rendering engine non sono gestite dal
        // CornerstoneViewportService (es. le celle della sottogriglia/Montage):
        // non hanno una position presentation. Le saltiamo: vengono comunque
        // ridimensionate da renderingEngine.resize() più sotto.
        if (!presentation) {
          return;
        }

        // During a resize, the slice index should remain unchanged. This is a temporary fix for
        // a larger issue regarding the definition of slice index with slab thickness.
        // We need to revisit this to make it more robust and understandable.
        delete presentation.viewReference?.sliceIndex;
        this.beforeResizePositionPresentations.set(viewportId, presentation);

        const framing = framingBeforeResize(this.getCornerstoneViewport(viewportId));
        if (framing) {
          framingsBeforeResize.set(viewportId, framing);
        }
      });

      // Resize the rendering engine and render.
      const renderingEngine = this.renderingEngine;
      renderingEngine.resize(isImmediate);
      renderingEngine.render();

      // Reset the camera for all viewports using position presentation to maintain relative size/position
      // which means only those viewports that have a zoom level of 1.
      this.beforeResizePositionPresentations.forEach((positionPresentation, viewportId) => {
        this.setPresentations(viewportId, {
          positionPresentation,
        });
      });

      // Resize and render the rendering engine again.
      renderingEngine.resize(isImmediate);
      renderingEngine.render();

      // Ricalcola la camera dall'inquadratura relativa sulle NUOVE dimensioni.
      // Sovrascrive il pan in pixel appena ripristinato da setPresentations, che
      // non e' robusto al cambio di dimensione (e' la causa del bug "le serie
      // spariscono"). Interruttore: window.mdvFramingOff = true.
      const reframedIds: string[] = [];
      framingsBeforeResize.forEach((framing, viewportId) => {
        if (applyFraming(this.getCornerstoneViewport(viewportId), framing)) {
          reframedIds.push(viewportId);
        }
      });
      if (reframedIds.length) {
        // Evento camera consolidato SOLO a correzioni finite (overlay zoom ecc.).
        reframedIds.forEach(id => notifyFramingApplied(this.getCornerstoneViewport(id)));
        renderingEngine.render();
      }
    } catch (e) {
      // This can happen if the resize is too close to navigation or shutdown
      console.warn('Caught resize exception', e);
    }
  }

  private resetGridResizeTimeout() {
    clearTimeout(this.gridResizeTimeOut);
    this.gridResizeTimeOut = setTimeout(() => {
      this.gridResizeTimeOut = null;
    }, this.gridResizeDelay);
  }

  private _setLutPresentation(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    lutPresentation: LutPresentation
  ): void {
    if (!lutPresentation) {
      return;
    }

    // mdv: never restore a persisted LUT on a 3D volume viewport. Its
    // rendering is fully controlled by the volumetric preset (CT-Bone /
    // MR-Default / ...) applied via setVolumesForViewport. The persisted
    // LUT only contains a 2D voiRange snapshot — restoring it overrides
    // the preset's transfer function and produces the "wrong window"
    // symptom on close+reopen MPR (visible until the user hits Reset).
    if (viewport instanceof VolumeViewport3D) {
      return;
    }

    const { properties } = lutPresentation;
    if (viewport instanceof BaseVolumeViewport) {
      if (properties instanceof Map) {
        properties.forEach((propertiesEntry, volumeId) => {
          viewport.setProperties(propertiesEntry, volumeId);
        });
      } else {
        viewport.setProperties(properties);
      }
    } else {
      const stackProperties = { ...(properties || {}) };
      if (stackProperties.colormap !== undefined) {
        const currentImageId = (viewport as Types.IStackViewport).getCurrentImageId?.();
        if (isColorImageByImageId(currentImageId)) {
          if (
            typeof window !== 'undefined' &&
            window?.localStorage?.getItem('ohifPaletteRuntimeDebug') === '1'
          ) {
            // eslint-disable-next-line no-console
            console.log('[ohifPaletteRuntime:stack:setLutPresentation:dropColormap]', {
              viewportId: viewport.id,
              imageId: currentImageId,
              colormap: stackProperties.colormap,
            });
          }
          delete stackProperties.colormap;
        }
      }
      viewport.setProperties(stackProperties);
    }
  }

  private _setPositionPresentation(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    positionPresentation: PositionPresentation
  ): void {
    const viewRef = positionPresentation?.viewReference;
    if (viewRef) {
      if (viewport.isReferenceViewable(viewRef, WITH_NAVIGATION)) {
        viewport.setViewReference(viewRef);
      } else {
        console.warn('Unable to apply reference viewable', viewRef);
      }
    }

    const viewPresentation = positionPresentation?.viewPresentation;
    if (viewPresentation) {
      viewport.setViewPresentation(viewPresentation);
    }
  }

  private _setSegmentationPresentation(
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    segmentationPresentation: SegmentationPresentation
  ): void {
    if (!segmentationPresentation) {
      return;
    }

    const { segmentationService } = this.servicesManager.services;

    segmentationPresentation.forEach((presentationItem: SegmentationPresentationItem) => {
      const { segmentationId, type, hydrated } = presentationItem;

      if (hydrated) {
        segmentationService.addSegmentationRepresentation(viewport.id, {
          segmentationId,
          type,
        });
      }
    });
  }
}

export default CornerstoneViewportService;
