import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { vec3 } from 'gl-matrix';
import PropTypes from 'prop-types';
import { metaData, Enums, utilities } from '@cornerstonejs/core';
import type { ImageSliceData } from '@cornerstonejs/core/types';
import { ViewportOverlay } from '@ohif/ui';
import { Tooltip, TooltipTrigger, TooltipContent } from '@ohif/ui-next';
import type { InstanceMetadata } from '@ohif/core/src/types';
import { formatDICOMDate, formatDICOMTime, formatNumberPrecision } from './utils';
import { utils } from '@ohif/core';
import { StackViewportData, VolumeViewportData } from '../../types/CornerstoneCacheService';

import './CustomizableViewportOverlay.css';

const EPSILON = 1e-4;
const { formatPN } = utils;

type ViewportData = StackViewportData | VolumeViewportData;

interface OverlayItemProps {
  element: HTMLElement;
  viewportData: ViewportData;
  imageSliceData: ImageSliceData;
  servicesManager: AppTypes.ServicesManager;
  viewportId: string;
  instance: InstanceMetadata;
  customization: any;
  formatters: {
    formatPN: (val) => string;
    formatDate: (val) => string;
    formatTime: (val) => string;
    formatNumberPrecision: (val, number) => string;
  };

  // calculated values
  voi: {
    windowWidth: number;
    windowCenter: number;
  };
  instanceNumber?: number;
  scale?: number;
}

const OverlayItemComponents = {
  'ohif.overlayItem': OverlayItem,
  'ohif.overlayItem.windowLevel': VOIOverlayItem,
  'ohif.overlayItem.zoomLevel': ZoomOverlayItem,
  'ohif.overlayItem.instanceNumber': InstanceNumberOverlayItem,
  'ohif.overlayItem.linkedSeries': LinkedSeriesBadgeOverlayItem,
};

const linkedSeriesBadgeItem = {
  id: 'LinkedSeriesBadge',
  inheritsFrom: 'ohif.overlayItem.linkedSeries',
};

const storicoLabelItem = {
  id: 'StoricoLabel',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'Storico Label',
  color: '#81d4fa',
  condition: ({ referenceInstance }) =>
    ((referenceInstance?.StudyInstanceUID &&
      referenceInstance?.StudyInstanceUID !== window.mdvStudyInstanceUIDs) ||
      window.sonoUnoStorico === true) &&
    !window.portableVersion,
  contentF: ({ referenceInstance }) => 'STORICO',
};

const studyDateItem = {
  id: 'StudyDate',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'Study date',
  className: 'overlay-info-dicom',
  condition: ({ referenceInstance }) => referenceInstance?.StudyDate,
  contentF: ({ referenceInstance, formatters: { formatDate } }) =>
    formatDate(referenceInstance.StudyDate),
};

const patientIDItem = {
  id: 'PatientID',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'PatientID',
  className: 'overlay-info-dicom',
  condition: ({ referenceInstance }) => {
    return referenceInstance && referenceInstance.PatientID;
  },
  contentF: ({ referenceInstance }) => 'ID: ' + referenceInstance.PatientID,
};

const accessionItem = {
  id: 'Accession',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'Accession',
  className: 'overlay-info-dicom',
  condition: ({ referenceInstance }) => {
    return referenceInstance && referenceInstance.AccessionNumber;
  },
  contentF: ({ referenceInstance }) => referenceInstance.AccessionNumber,
};

const patientNameItem = {
  id: 'PatientName',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'PatientName',
  className: 'overlay-info-dicom',
  condition: ({ referenceInstance }) => {
    return (
      referenceInstance && referenceInstance.PatientName && referenceInstance.PatientName.Alphabetic
    );
  },
  contentF: ({ referenceInstance, formatters: { formatPN } }) =>
    `${formatPN(referenceInstance.PatientName.Alphabetic)} ${referenceInstance.PatientSex ? '(' + referenceInstance.PatientSex + ')' : ''}`,
};

const seriesNumberItem = {
  id: 'SeriesNumber',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'SeriesNumber',
  className: 'overlay-info-dicom',
  condition: ({ referenceInstance }) => {
    return referenceInstance && referenceInstance.SeriesNumber;
  },
  contentF: ({ referenceInstance }) => 'S: ' + referenceInstance.SeriesNumber,
};

const seriesDescriptionItem = {
  id: 'SeriesDescription',
  customizationType: 'ohif.overlayItem',
  label: '',
  title: 'Series description',
  className: 'overlay-info-dicom',
  condition: ({ referenceInstance }) => {
    return referenceInstance && referenceInstance.SeriesDescription;
  },
  contentF: ({ referenceInstance }) => referenceInstance.SeriesDescription,
};

const topLeftItems = {
  id: 'cornerstoneOverlayTopLeft',
  items: [
    linkedSeriesBadgeItem,
    studyDateItem,
    seriesNumberItem,
    seriesDescriptionItem,
    storicoLabelItem,
  ],
};

const topRightItems = {
  id: 'cornerstoneOverlayTopRight',
  items: [patientNameItem, patientIDItem, accessionItem],
};

const bottomLeftItems = {
  id: 'cornerstoneOverlayBottomLeft',
  items: [
    {
      id: 'WindowLevel',
      customizationType: 'ohif.overlayItem.windowLevel',
    },
    {
      id: 'ZoomLevel',
      customizationType: 'ohif.overlayItem.zoomLevel',
      condition: props => {
        const activeToolName = props.toolGroupService.getActiveToolForViewport(props.viewportId);
        return activeToolName === 'Zoom';
      },
    },
  ],
};

const bottomRightItems = {
  id: 'cornerstoneOverlayBottomRight',
  items: [
    {
      id: 'InstanceNumber',
      customizationType: 'ohif.overlayItem.instanceNumber',
    },
  ],
};

/**
 * The @ohif/cornerstoneOverlay is a default value for a customization
 * for the cornerstone overlays.  The intent is to allow it to be extended
 * without needing to re-write the individual overlays by using the append
 * mechanism.  Individual attributes can be modified individually without
 * affecting the other items by using the append as well, with position
 * based replacement.
 * This is used as a default in the getCustomizationModule so that it
 * is available early for additional customization extensions.
 */
const CornerstoneOverlay = {
  id: '@ohif/cornerstoneOverlay',
  topLeftItems,
  topRightItems,
  bottomLeftItems,
  bottomRightItems,
};

/**
 * Customizable Viewport Overlay
 */
function CustomizableViewportOverlay({
  element,
  viewportData,
  imageSliceData,
  viewportId,
  servicesManager,
}: {
  element: HTMLElement;
  viewportData: ViewportData;
  imageSliceData: ImageSliceData;
  viewportId: string;
  servicesManager: AppTypes.ServicesManager;
}) {
  const { cornerstoneViewportService, customizationService, toolGroupService, displaySetService } =
    servicesManager.services;
  const [voi, setVOI] = useState({ windowCenter: null, windowWidth: null });
  const [scale, setScale] = useState(1);
  const [, setCustomizationVersion] = useState(0);
  const { imageIndex } = imageSliceData;

  // Historical usage defined the overlays as separate items due to lack of
  // append functionality.  This code enables the historical usage, but
  // the recommended functionality is to append to the default values in
  // cornerstoneOverlay rather than defining individual items.
  const topLeftCustomization = customizationService.getCustomization('viewportOverlay.topLeft');
  const topRightCustomization = customizationService.getCustomization('viewportOverlay.topRight');
  const bottomLeftCustomization = customizationService.getCustomization(
    'viewportOverlay.bottomLeft'
  );
  const bottomRightCustomization = customizationService.getCustomization(
    'viewportOverlay.bottomRight'
  );

  useEffect(() => {
    if (!customizationService?.EVENTS) {
      return;
    }
    const { MODE_CUSTOMIZATION_MODIFIED, GLOBAL_CUSTOMIZATION_MODIFIED, DEFAULT_CUSTOMIZATION_MODIFIED } =
      customizationService.EVENTS;
    const bump = () => setCustomizationVersion(v => v + 1);
    const subscriptions = [];
    if (MODE_CUSTOMIZATION_MODIFIED) {
      subscriptions.push(customizationService.subscribe(MODE_CUSTOMIZATION_MODIFIED, bump));
    }
    if (GLOBAL_CUSTOMIZATION_MODIFIED) {
      subscriptions.push(customizationService.subscribe(GLOBAL_CUSTOMIZATION_MODIFIED, bump));
    }
    if (DEFAULT_CUSTOMIZATION_MODIFIED) {
      subscriptions.push(customizationService.subscribe(DEFAULT_CUSTOMIZATION_MODIFIED, bump));
    }

    return () => {
      subscriptions.forEach(sub => sub?.unsubscribe?.());
    };
  }, [customizationService]);

  const instanceNumber = useMemo(
    () =>
      viewportData
        ? getInstanceNumber(viewportData, viewportId, imageIndex, cornerstoneViewportService)
        : null,
    [viewportData, viewportId, imageIndex, cornerstoneViewportService]
  );

  const displaySetProps = useMemo(() => {
    const displaySets = getDisplaySets(viewportData, displaySetService);
    if (!displaySets) {
      return null;
    }
    const [displaySet] = displaySets;
    const { instances, instance: referenceInstance } = displaySet;
    return {
      displaySets,
      displaySet,
      instance: instances?.[imageIndex],
      instances,
      referenceInstance,
    };
  }, [viewportData, viewportId, imageIndex, instanceNumber, cornerstoneViewportService]);

  /**
   * Updating the VOI when the viewport changes its voi
   */
  useEffect(() => {
    const updateVOI = eventDetail => {
      const { range } = eventDetail.detail;

      if (!range) {
        return;
      }

      const { lower, upper } = range;
      const { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(lower, upper);

      setVOI({ windowCenter, windowWidth });
    };

    element.addEventListener(Enums.Events.VOI_MODIFIED, updateVOI);

    return () => {
      element.removeEventListener(Enums.Events.VOI_MODIFIED, updateVOI);
    };
  }, [viewportId, viewportData, voi, element]);

  /**
   * Updating the scale when the viewport changes its zoom
   */
  useEffect(() => {
    const updateScale = eventDetail => {
      const { previousCamera, camera } = eventDetail.detail;

      if (
        previousCamera.parallelScale !== camera.parallelScale ||
        previousCamera.scale !== camera.scale
      ) {
        const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

        if (!viewport) {
          return;
        }

        const scale = viewport.getZoom();

        setScale(scale);
      }
    };

    element.addEventListener(Enums.Events.CAMERA_MODIFIED, updateScale);

    return () => {
      element.removeEventListener(Enums.Events.CAMERA_MODIFIED, updateScale);
    };
  }, [viewportId, viewportData, cornerstoneViewportService, element]);

  const _renderOverlayItem = useCallback(
    (item, props) => {
      const overlayItemProps = {
        ...props,
        element,
        viewportData,
        imageSliceData,
        viewportId,
        servicesManager,
        customization: item,
        formatters: {
          formatPN,
          formatDate: formatDICOMDate,
          formatTime: formatDICOMTime,
          formatNumberPrecision,
        },
      };

      if (!item) {
        return null;
      }

      const { inheritsFrom } = item;
      const OverlayItemComponent = OverlayItemComponents[inheritsFrom];

      if (OverlayItemComponent) {
        return <OverlayItemComponent {...overlayItemProps} />;
      } else {
        const renderItem = customizationService.transform(item);

        if (typeof renderItem.contentF === 'function') {
          return renderItem.contentF(overlayItemProps);
        }
      }
    },
    [
      element,
      viewportData,
      imageSliceData,
      viewportId,
      servicesManager,
      customizationService,
      displaySetProps,
      voi,
      scale,
      instanceNumber,
    ]
  );

  const getContent = useCallback(
    (customization, keyPrefix) => {
      const props = {
        ...displaySetProps,
        formatters: { formatDate: formatDICOMDate },
        voi,
        scale,
        instanceNumber,
        viewportId,
        toolGroupService,
        // Necessari a condition()/contentF per risolvere il valore dei tag
        // sull'immagine/frame CORRENTE (getCurrentImageId + metaData.get).
        servicesManager,
        viewportData,
        imageSliceData,
      };

      return (
        <>
          {customization.map((item, index) => (
            <div key={`${keyPrefix}_${index}`}>
              {((!item?.condition || item.condition(props)) && _renderOverlayItem(item, props)) ||
                null}
            </div>
          ))}
        </>
      );
    },
    [_renderOverlayItem]
  );

  return (
    <ViewportOverlay
      topLeft={getContent(topLeftCustomization, 'topLeftOverlayItem')}
      topRight={getContent(topRightCustomization, 'topRightOverlayItem')}
      bottomLeft={getContent(bottomLeftCustomization, 'bottomLeftOverlayItem')}
      bottomRight={getContent(bottomRightCustomization, 'bottomRightOverlayItem')}
    />
  );
}

/**
 * Gets an array of display sets for the given viewport, based on the viewport data.
 * Returns null if none found.
 */
function getDisplaySets(viewportData, displaySetService) {
  if (!viewportData?.data?.length) {
    return null;
  }
  const displaySets = viewportData.data
    .map(datum => displaySetService.getDisplaySetByUID(datum.displaySetInstanceUID))
    .filter(it => !!it);
  if (!displaySets.length) {
    return null;
  }
  return displaySets;
}

const getInstanceNumber = (viewportData, viewportId, imageIndex, cornerstoneViewportService) => {
  let instanceNumber;

  switch (viewportData.viewportType) {
    case Enums.ViewportType.STACK:
      instanceNumber = _getInstanceNumberFromStack(viewportData, imageIndex);
      break;
    case Enums.ViewportType.ORTHOGRAPHIC:
      instanceNumber = _getInstanceNumberFromVolume(
        viewportData,
        viewportId,
        cornerstoneViewportService,
        imageIndex
      );
      break;
  }

  return instanceNumber ?? null;
};

function _getInstanceNumberFromStack(viewportData, imageIndex) {
  const imageIds = viewportData.data[0].imageIds;
  const imageId = imageIds[imageIndex];

  if (!imageId) {
    return;
  }

  const generalImageModule = metaData.get('generalImageModule', imageId) || {};
  const { instanceNumber } = generalImageModule;

  const stackSize = imageIds.length;

  if (stackSize <= 1) {
    return;
  }

  return parseInt(instanceNumber);
}

// Since volume viewports can be in any view direction, they can render
// a reconstructed image which don't have imageIds; therefore, no instance and instanceNumber
// Here we check if viewport is in the acquisition direction and if so, we get the instanceNumber
function _getInstanceNumberFromVolume(
  viewportData,
  viewportId,
  cornerstoneViewportService,
  imageIndex
) {
  const volumes = viewportData.data;

  if (!volumes) {
    return;
  }

  // Todo: support fusion of acquisition plane which has instanceNumber
  const { volume } = volumes[0];

  if (!volume) {
    return;
  }

  const { direction, imageIds } = volume;

  const cornerstoneViewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

  if (!cornerstoneViewport) {
    return;
  }

  const camera = cornerstoneViewport.getCamera();
  const { viewPlaneNormal } = camera;
  // checking if camera is looking at the acquisition plane (defined by the direction on the volume)

  const scanAxisNormal = direction.slice(6, 9);

  // check if viewPlaneNormal is parallel to scanAxisNormal
  const cross = vec3.cross(vec3.create(), viewPlaneNormal, scanAxisNormal);
  const isAcquisitionPlane = vec3.length(cross) < EPSILON;

  if (isAcquisitionPlane) {
    const imageId = imageIds[imageIndex];

    if (!imageId) {
      return {};
    }

    const { instanceNumber } = metaData.get('generalImageModule', imageId) || {};
    return parseInt(instanceNumber);
  }
}

function OverlayItem(props) {
  const { instance, customization = {} } = props;
  const { color, attribute, title, label, background, className } = customization;
  const value = customization.contentF?.(props, customization) ?? instance?.[attribute];
  if (value === undefined || value === null) {
    return null;
  }
  return (
    <div
      className={`overlay-item flex flex-row ${className}`}
      style={{ color, background }}
      title={title}
    >
      {label ? <span className="mr-1 shrink-0">{label}</span> : null}
      {label ? <span className="mr-1 shrink-0">{label}</span> : null}
      <span className="ml-1 mr-2 shrink-0">{value}</span>
    </div>
  );
}

/**
 * Window Level / Center Overlay item
 */
function VOIOverlayItem({ voi, customization }: OverlayItemProps) {
  const { windowWidth, windowCenter } = voi;
  if (typeof windowCenter !== 'number' || typeof windowWidth !== 'number') {
    return null;
  }

  return (
    <div
      className="overlay-item overlay-info-dicom flex flex-row"
      style={{ color: customization?.color }}
    >
      <span className="mr-1 shrink-0">W:</span>
      <span className="windowWidth-viewport ml-1 mr-2 shrink-0">{windowWidth.toFixed(0)}</span>
      <span className="mr-1 shrink-0">L:</span>
      <span className="windowCenter-viewport ml-1 shrink-0">{windowCenter.toFixed(0)}</span>
    </div>
  );
}

/**
 * Zoom Level Overlay item
 */
function ZoomOverlayItem({ scale, customization }: OverlayItemProps) {
  return (
    <div
      className="overlay-item overlay-info-dicom flex flex-row"
      style={{ color: (customization && customization.color) || undefined }}
    >
      <span className="mr-1 shrink-0">Zoom:</span>
      <span>{scale.toFixed(2)}x</span>
    </div>
  );
}

/**
 * Instance Number Overlay Item
 */
function InstanceNumberOverlayItem({
  instanceNumber,
  imageSliceData,
  customization,
}: OverlayItemProps) {
  const { imageIndex, numberOfSlices } = imageSliceData;

  return (
    <div
      className="overlay-item flex flex-row overlay-info-dicom"
      style={{ color: (customization && customization.color) || undefined }}
    >
      <span>
        {instanceNumber !== undefined && instanceNumber !== null ? (
          <>
            <span className="mr-1 shrink-0">I:</span>
            <span>{`${instanceNumber} (${imageIndex + 1}/${numberOfSlices})`}</span>
          </>
        ) : (
          `${imageIndex + 1}/${numberOfSlices}`
        )}
      </span>
    </div>
  );
}

CustomizableViewportOverlay.propTypes = {
  viewportData: PropTypes.object,
  imageIndex: PropTypes.number,
  viewportId: PropTypes.string,
};

/**
 * Palette of high-contrast colors used to tint the linked-series badges.
 * A sync group ID is hashed into an index so every viewport that belongs to
 * the same group renders with the same color, while different groups get
 * visually distinct hues.
 */
const LINKED_SERIES_PALETTE = [
  '#4FC3F7', // light blue
  '#81C784', // green
  '#FFB74D', // orange
  '#BA68C8', // purple
  '#EF5350', // red (default slot the IMAGE_SLICE_SYNC id hashes into)
  '#4DD0E1', // cyan
  '#9CCC65', // lime
  '#FF8A65', // coral
];

/**
 * Un colore per ogni INSIEME di viewport che si muovono insieme.
 *
 * Prima la chiave era l'id del sincronizzatore, e di sincronizzatori ce n'e'
 * uno: "collega serie" ci mette dentro tutte le viewport, e quale coppia si
 * muova davvero lo decide dopo il controllo di complanarita'. Con una chiave
 * sola uscivano tutti i pallini dello stesso colore, cioe' il pallino diceva
 * che cinque serie scorrono insieme mentre ne scorrono due con due e una con
 * una.
 *
 * La chiave e' l'insieme ordinato dei partecipanti. Chi si muove con gli stessi
 * ha lo stesso colore; chi si muove con altri ne ha un altro. Ed e' stabile:
 * ordinare rende la chiave indipendente da chi la calcola, quindi due viewport
 * dello stesso gruppo arrivano allo stesso colore ciascuna per conto suo.
 */
function hashSyncIdToColor(chiave: string): string {
  let hash = 0;
  for (let i = 0; i < chiave.length; i++) {
    hash = (hash * 31 + chiave.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % LINKED_SERIES_PALETTE.length;
  return LINKED_SERIES_PALETTE[index];
}

/**
 * Renders a small colored dot indicating this viewport is part of one or more
 * series-sync groups, with a hover tooltip listing the linked series.
 * Re-evaluates on sync-group changes, viewport data changes and layout changes
 * so it stays in step with grid rearrangements and series substitutions.
 */
function LinkedSeriesBadgeOverlayItem(props: OverlayItemProps) {
  const { viewportId, servicesManager } = props;
  const { syncGroupService, viewportGridService, displaySetService, cornerstoneViewportService } =
    servicesManager.services as AppTypes.Services;
  const [, setVersion] = useState(0);

  // Hide the badge in modes/viewport layouts where a series-link indicator is
  // not meaningful: MPR orthographic viewports (they receive only reference
  // lines, not slice scrolling) and PET/CT fusion mode (tmtv route).
  const route =
    typeof window !== 'undefined' ? window.location?.pathname?.split('/')[1] : '';
  const isPetCtMode = route === 'tmtv';
  const viewportInfo = cornerstoneViewportService?.getViewportInfo?.(viewportId);
  const viewportType =
    viewportInfo?.getViewportData?.()?.viewportType ||
    viewportInfo?.viewportOptions?.viewportType;
  const isOrthographic =
    typeof viewportType === 'string' && viewportType.toLowerCase() === 'orthographic';
  const hideBadge = isPetCtMode || isOrthographic;

  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    const subs = [];
    if (syncGroupService?.EVENTS?.SYNC_GROUP_CHANGED) {
      subs.push(syncGroupService.subscribe(syncGroupService.EVENTS.SYNC_GROUP_CHANGED, bump));
    }
    if (viewportGridService?.EVENTS?.LAYOUT_CHANGED) {
      subs.push(viewportGridService.subscribe(viewportGridService.EVENTS.LAYOUT_CHANGED, bump));
    }
    if (viewportGridService?.EVENTS?.GRID_STATE_CHANGED) {
      subs.push(
        viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, bump)
      );
    }
    return () => {
      subs.forEach(s => s?.unsubscribe?.());
    };
  }, [syncGroupService, viewportGridService]);

  if (hideBadge) {
    return null;
  }

  const gridState = viewportGridService?.getState?.();
  const gridViewports = gridState?.viewports;

  const getViewportDisplaySet = (vpId: string) => {
    if (!gridViewports) return null;
    const vp = gridViewports.get ? gridViewports.get(vpId) : gridViewports[vpId];
    const uids: string[] = vp?.displaySetInstanceUIDs || [];
    for (const uid of uids) {
      const ds = displaySetService?.getDisplaySetByUID?.(uid);
      if (ds) return ds;
    }
    return null;
  };

  const thisDs = getViewportDisplaySet(viewportId);
  const thisDsUID = thisDs?.displaySetInstanceUID;

  // Snapshot of this viewport's cornerstone-level state: camera normal and
  // frame-of-reference. These are the two signals Cornerstone's own
  // imageSliceSyncCallback uses to decide whether a scroll event on this
  // viewport will actually move the target viewport (see
  // @cornerstonejs/tools/.../imageSliceSyncCallback.js +
  // areViewportsCoplanar.js). We mirror that logic to decide which peers
  // belong on the badge.
  const getViewportSpatialInfo = (vpId: string) => {
    const csVp = cornerstoneViewportService?.getCornerstoneViewport?.(vpId);
    if (!csVp) return null;
    const camera = csVp.getCamera?.();
    const normal = camera?.viewPlaneNormal;
    const frameOfReferenceUID = csVp.getFrameOfReferenceUID?.();
    return { normal, frameOfReferenceUID };
  };

  const thisSpatial = getViewportSpatialInfo(viewportId);

  const isCoplanar = (n1?: number[], n2?: number[]) => {
    if (!n1 || !n2 || n1.length < 3 || n2.length < 3) return false;
    const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
    return Math.abs(dot) > 0.9;
  };

  const synchronizers = syncGroupService?.getSynchronizersForViewport?.(viewportId) || [];
  const groups = synchronizers
    .filter(sync => {
      // Skip synchronizers the user has turned off via the "collega serie"
      // toggle: the group may still hold viewports but is no longer active,
      // so the badge must disappear (and reappear when the toggle is re-enabled).
      if ((sync as any)?._enabled === false) {
        return false;
      }
      // Only surface viewport-scroll links ("collega serie"). Other sync
      // types (reference lines, camera position, VOI, zoom/pan) must not
      // trigger the badge because they don't actually scroll the series.
      if (syncGroupService?.isImageSliceSyncronizer?.(sync)) {
        return true;
      }
      const type = syncGroupService?.getSynchronizerType?.(sync);
      return typeof type === 'string' && type.toLowerCase() === 'imageslice';
    })
    .map(sync => {
      const sourceVps = sync.getSourceViewports?.() || [];
      const targetVps = sync.getTargetViewports?.() || [];
      const allIds = new Set<string>();
      sourceVps.forEach(vp => allIds.add(vp.viewportId));
      targetVps.forEach(vp => allIds.add(vp.viewportId));
      // Mirror Cornerstone's own imageSliceSyncCallback logic. A scroll event
      // on this viewport will actually move a peer viewport iff:
      //   1. the two viewports are coplanar (|dot(normal1, normal2)| > 0.9),
      //      AND
      //   2. they share the same FrameOfReferenceUID (Cornerstone uses an
      //      identity registration) OR a spatialRegistrationModule has been
      //      computed between them (Cornerstone cached it after the first
      //      sync event across non-coregistered series).
      // Every other case — different orientation (MPR), unrelated frames of
      // reference — yields only reference-line movement, not real scrolling,
      // and must not display a link badge.
      const provider = (utilities as any)?.spatialRegistrationMetadataProvider;
      const peers = Array.from(allIds).filter(vpId => {
        if (vpId === viewportId) return false;
        const peerSpatial = getViewportSpatialInfo(vpId);
        if (!thisSpatial || !peerSpatial) return false;
        if (!isCoplanar(thisSpatial.normal, peerSpatial.normal)) return false;
        if (
          thisSpatial.frameOfReferenceUID &&
          peerSpatial.frameOfReferenceUID &&
          thisSpatial.frameOfReferenceUID === peerSpatial.frameOfReferenceUID
        ) {
          return true;
        }
        const forward = provider?.get?.('spatialRegistrationModule', viewportId, vpId);
        const reverse = provider?.get?.('spatialRegistrationModule', vpId, viewportId);
        if (forward || reverse) return true;
        // Fallback: when metadata is still incomplete (first frames loading)
        // trust the series identity to avoid a flicker/gap on the badge.
        const ds = getViewportDisplaySet(vpId);
        return !!(thisDsUID && ds?.displaySetInstanceUID === thisDsUID);
      });
      return { id: sync.id as string, peers };
    })
    .filter(g => g.peers.length > 0);

  if (!groups.length) {
    return null;
  }

  const describeViewport = (vpId: string): string => {
    const ds = getViewportDisplaySet(vpId);
    if (!ds) return vpId;
    return (
      ds.SeriesDescription ||
      (ds.SeriesNumber != null ? `Serie ${ds.SeriesNumber}` : null) ||
      ds.Modality ||
      vpId
    );
  };

  const linkInfo = groups.map(g => ({
    id: g.id,
    // L'insieme di chi si muove insieme, ordinato: questa viewport e i suoi pari.
    color: hashSyncIdToColor([viewportId, ...g.peers].sort().join('|')),
    others: g.peers.map(vpId => describeViewport(vpId)),
  }));

  return (
    <div className="linked-series-badge-wrapper flex flex-row items-center">
      {linkInfo.map(group => (
        <Tooltip key={group.id} delayDuration={150}>
          <TooltipTrigger asChild>
            <span
              className="linked-series-badge"
              style={{ backgroundColor: group.color, boxShadow: `0 0 4px ${group.color}` }}
              aria-label="Serie collegata"
              tabIndex={0}
            />
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={6}
            className="z-[9999]"
          >
            <div className="text-xs">
              <div className="mb-1 font-medium">Collegata con:</div>
              {group.others.length ? (
                <ul className="list-none space-y-0.5 pl-0">
                  {group.others.map((label, i) => (
                    <li key={i}>· {label}</li>
                  ))}
                </ul>
              ) : (
                <div className="opacity-70">Nessun'altra serie nel gruppo</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export default CustomizableViewportOverlay;

export { CustomizableViewportOverlay };
