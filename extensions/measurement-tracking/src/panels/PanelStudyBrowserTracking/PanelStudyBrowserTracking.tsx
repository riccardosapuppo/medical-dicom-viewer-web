import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { useSystem, utils } from '@ohif/core';
import { useImageViewer, Dialog, ButtonEnums } from '@ohif/ui';
import { useViewportGrid } from '@ohif/ui-next';
import { StudyBrowser } from '@ohif/ui-next';

import { useTrackedMeasurements } from '../../getContextModule';
import { Separator } from '@ohif/ui-next';
import { PanelStudyBrowserHeader, MoreDropdownMenu } from '@ohif/extension-default';
import { defaultActionIcons, defaultViewPresets } from './constants';

let primoAvvio = true
const cacheThumbnails = {}

const { formatDate, createStudyBrowserTabs } = utils;

const DIALOG_ID = {
  UNTRACK_SERIES: 'untrack-series',
  REJECT_REPORT: 'ds-reject-sr',
};

const thumbnailNoImageModalities = [
  'SR',
  'SEG',
  'SM',
  'RTSTRUCT',
  'RTPLAN',
  'RTDOSE',
  'PMAP',
];

const shouldHideThumbnail = ds => {
  if (thumbnailNoImageModalities.includes(ds.Modality) || ds?.unsupported) {
    return true;
  }

  if (ds?.Modality === 'OT') {
    const frames = Number(ds?.numImageFrames ?? 0);
    const imagesCount = ds?.images?.length ?? 0;
    return frames === 0 && imagesCount === 0;
  }

  return false;
};

const showFirstPriorStudy = true;
const INVALID_STUDY_DESCRIPTION_VALUES = new Set([
  'no data study',
  'no data study',
  'no data',
  'n/a',
  'na',
  'null',
  'undefined',
  '(vuoto)',
]);

const normalizeStudyInstanceUID = studyInstanceUID => {
  if (studyInstanceUID === undefined || studyInstanceUID === null) {
    return studyInstanceUID;
  }

  const studyUIDAsString = `${studyInstanceUID}`.trim();
  if (!studyUIDAsString) {
    return '';
  }

  const lastPathSegment =
    studyUIDAsString
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .pop() || studyUIDAsString;

  return lastPathSegment.split('|')[0];
};

const normalizeText = value => {
  if (value === undefined || value === null) {
    return '';
  }

  return `${value}`.replace(/\s+/g, ' ').trim();
};

const normalizeStudyDescription = value => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  if (INVALID_STUDY_DESCRIPTION_VALUES.has(normalized.toLowerCase())) {
    return '';
  }

  return normalized;
};

const getDicomTagValue = (item, tag) => {
  if (!item || !tag) {
    return '';
  }

  const value = item?.[tag]?.Value;
  if (!Array.isArray(value) || !value.length) {
    return '';
  }

  const firstValue = value[0];
  if (firstValue === undefined || firstValue === null) {
    return '';
  }

  if (typeof firstValue === 'object') {
    return normalizeText(firstValue.Alphabetic || firstValue.Alphanumeric || firstValue.Ideographic);
  }

  return normalizeText(firstValue);
};

const getDicomTagValues = (item, tag) => {
  if (!item || !tag) {
    return [];
  }

  const value = item?.[tag]?.Value;
  if (!Array.isArray(value) || !value.length) {
    return [];
  }

  return value
    .map(v => {
      if (v === undefined || v === null) {
        return '';
      }
      if (typeof v === 'object') {
        return normalizeText(v.Alphabetic || v.Alphanumeric || v.Ideographic);
      }
      return normalizeText(v);
    })
    .filter(Boolean);
};

const hasValue = value => normalizeText(value) !== '';

const mergeStudyEntries = (existingStudy, incomingStudy) => {
  const merged = { ...existingStudy };

  if (hasValue(incomingStudy?.date)) {
    merged.date = incomingStudy.date;
  }

  if (hasValue(incomingStudy?.description)) {
    merged.description = incomingStudy.description;
  }

  if (hasValue(incomingStudy?.modalities)) {
    merged.modalities = incomingStudy.modalities;
  }

  const incomingNumInstances = Number(incomingStudy?.numInstances);
  if (Number.isFinite(incomingNumInstances) && incomingNumInstances > 0) {
    merged.numInstances = incomingNumInstances;
  }

  if (hasValue(incomingStudy?.studyInstanceUid)) {
    merged.studyInstanceUid = incomingStudy.studyInstanceUid;
  }

  return merged;
};

const upsertStudies = (existingStudies, incomingStudies) => {
  const mergedStudies = [...existingStudies];

  incomingStudies.forEach(incomingStudy => {
    if (!incomingStudy?.studyInstanceUid) {
      return;
    }

    const index = mergedStudies.findIndex(
      existingStudy => existingStudy.studyInstanceUid === incomingStudy.studyInstanceUid
    );

    if (index === -1) {
      mergedStudies.push(incomingStudy);
      return;
    }

    mergedStudies[index] = mergeStudyEntries(mergedStudies[index], incomingStudy);
  });

  return mergedStudies;
};

/**
 *
 * @param {*} param0
 */
export default function PanelStudyBrowserTracking({
  getImageSrc,
  getStudiesForPatientByMRN,
  requestDisplaySetCreationForStudy,
  dataSource,
}) {
  const { servicesManager, commandsManager } = useSystem();
  const {
    displaySetService,
    uiDialogService,
    hangingProtocolService,
    uiNotificationService,
    measurementService,
    studyPrefetcherService,
    customizationService,
    uiModalService,
  } = servicesManager.services;
  const navigate = useNavigate();
  const studyMode = customizationService.getCustomization('studyBrowser.studyMode');
  const { t } = useTranslation('Common');

  // Normally you nest the components so the tree isn't so deep, and the data
  // doesn't have to have such an intense shape. This works well enough for now.
  // Tabs --> Studies --> DisplaySets --> Thumbnails
  const { StudyInstanceUIDs } = useImageViewer();
  const [{ activeViewportId, viewports, isHangingProtocolLayout }, viewportGridService] =
    useViewportGrid();
  const [trackedMeasurements, sendTrackedMeasurementsEvent] = useTrackedMeasurements();

  const [activeTabName, setActiveTabName] = useState(studyMode);
  const [expandedStudyInstanceUIDs, setExpandedStudyInstanceUIDs] = useState([
    ...(StudyInstanceUIDs || []).map(normalizeStudyInstanceUID).filter(Boolean),
  ]);
  const [studyDisplayList, setStudyDisplayList] = useState([]);
  // Local priors: 'idle' | 'loading' | 'done'
  const [priorsState, setPriorsState] = useState('idle');
  const [hasLoadedViewports, setHasLoadedViewports] = useState(false);
  const [displaySets, setDisplaySets] = useState([]);
  const [displaySetsLoadingState, setDisplaySetsLoadingState] = useState({});
  const [thumbnailImageSrcMap, setThumbnailImageSrcMap] = useState({});
  const [jumpToDisplaySet, setJumpToDisplaySet] = useState(null);
  const requestedSeriesByStudyUIDRef = useRef(new Set());
  // Studies whose series were asked for by the automatic preload, not by the reader.
  const studiPrecaricatiRef = useRef(new Set());
  // The last tab chosen by an actual click: it must not be abandoned while still empty.
  const userChosenTabRef = useRef(null);
  // The last study expanded in each tab: coming back to the tab reopens it.
  const ultimoStudioPerTabRef = useRef({});

  const [viewPresets, setViewPresets] = useState(
    customizationService.getCustomization('studyBrowser.viewPresets')
  );

  const [actionIcons, setActionIcons] = useState(defaultActionIcons);

  const updateActionIconValue = actionIcon => {
    actionIcon.value = !actionIcon.value;
    const newActionIcons = [...actionIcons];
    setActionIcons(newActionIcons);
  };

  const updateViewPresetValue = viewPreset => {
    if (!viewPreset) {
      return;
    }
    const newViewPresets = viewPresets.map(preset => {
      preset.selected = preset.id === viewPreset.id;
      return preset;
    });
    setViewPresets(newViewPresets);
  };


  const handleOnMobile = () => {

    if (window.matchMedia("(max-width: 768px)").matches) {
      updateViewPresetValue({
        id: "list",
        iconName: "ListView",
        selected: false,
      })
    }
    primoAvvio = false; // Imposta `primoAvvio` a false per evitare chiamate successive
  };

  // At first start, check for a mobile device and, if it is one, show the series as a list
  useEffect(() => {
    if (primoAvvio) {
      handleOnMobile(); // Verifica se chiudere il pannello
    }
  }, []);


  const onDoubleClickThumbnailHandler = displaySetInstanceUID => {
    let updatedViewports = [];
    const viewportId = activeViewportId;
    try {
      updatedViewports = hangingProtocolService.getViewportsRequireUpdate(
        viewportId,
        displaySetInstanceUID,
        isHangingProtocolLayout
      );
    } catch (error) {
      console.warn(error);
      uiNotificationService.show({
        title: 'Series picker',
        message:
          "The selected display set cannot be added to the viewport: it does not match the hanging protocol rules",
        type: 'info',
        duration: 3000,
      });
    }

    viewportGridService.setDisplaySetsForViewports(updatedViewports);
  };

  const activeViewportDisplaySetInstanceUIDs =
    viewports.get(activeViewportId)?.displaySetInstanceUIDs;

  const { trackedSeries } = trackedMeasurements.context;

  useEffect(() => {
    setActiveTabName(studyMode);
  }, [studyMode]);

  // ~~ studyDisplayList
  useEffect(() => {
    // Fetch all studies for the patient in each primary study
    async function fetchStudiesForPatient(StudyInstanceUID) {
      // current study qido
      const qidoForStudyUID = await dataSource.query.studies.search({
        studyInstanceUid: StudyInstanceUID,
      });

      if (!qidoForStudyUID?.length) {
        navigate('/notfoundstudy', '_self');
        throw new Error('Invalid study URL');
      }

      let qidoStudiesForPatient = qidoForStudyUID;

      // try to fetch the prior studies based on the patientID if the
      // server can respond.
      try {
        qidoStudiesForPatient = await getStudiesForPatientByMRN(qidoForStudyUID);
      } catch (error) {
        console.warn(error);
      }

      const mappedStudies = _mapDataSourceStudies(qidoStudiesForPatient);
      const actuallyMappedStudies = mappedStudies.map(qidoStudy => {
        return {
          studyInstanceUid: normalizeStudyInstanceUID(qidoStudy.StudyInstanceUID),
          date: formatDate(qidoStudy.StudyDate) || t('NoStudyDate'),
          description: normalizeStudyDescription(qidoStudy.StudyDescription),
          modalities: qidoStudy.ModalitiesInStudy,
          numInstances: qidoStudy.NumInstances,
        };
      });

      setStudyDisplayList(prevStudies => upsertStudies(prevStudies, actuallyMappedStudies));
    }

    const studyUIDs = (StudyInstanceUIDs || []).map(normalizeStudyInstanceUID).filter(Boolean);
    if (!studyUIDs.length) {
      return;
    }

    // The priors' loading state, which feeds the "searching" badge on the "Local priors"
    // tab. allSettled, because one failed query must not leave the badge lit for good.
    setPriorsState('loading');
    Promise.allSettled(studyUIDs.map(sid => fetchStudiesForPatient(sid))).then(() =>
      setPriorsState('done')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [StudyInstanceUIDs, getStudiesForPatientByMRN]);

  // ~~ Initial Thumbnails
  useEffect(() => {
    if (!hasLoadedViewports) {
      if (activeViewportId) {
        // Once there is an active viewport id, it means the layout is ready
        // so wait a bit of time to allow the viewports preferential loading
        // which improves user experience of responsiveness significantly on slower
        // systems.
        const delayMs = 250 + displaySetService.getActiveDisplaySets().length * 10;
        window.setTimeout(() => setHasLoadedViewports(true), delayMs);
      }

      return;
    }


    let currentDisplaySets = displaySetService.activeDisplaySets;
    // filter non based on the list of modalities that are supported by cornerstone
    currentDisplaySets = currentDisplaySets.filter(ds => !shouldHideThumbnail(ds));

    if (!currentDisplaySets.length) {
      return;
    }

    currentDisplaySets.forEach(async dSet => {
      const newImageSrcEntry = {};
      const displaySet = displaySetService.getDisplaySetByUID(dSet.displaySetInstanceUID);
      const imageIds = dataSource.getImageIdsForDisplaySet(displaySet);

      const imageId = getImageIdForThumbnail(displaySet, imageIds);

      // TODO: Is it okay that imageIds are not returned here for SR displaySets?
      if (!imageId || displaySet?.unsupported) {
        return;
      }

      // When the image arrives, render it and store the result in the thumbnailImgSrcMap
      let { thumbnailSrc } = displaySet;
      if (!thumbnailSrc && displaySet.getThumbnailSrc) {
        thumbnailSrc = await displaySet.getThumbnailSrc();
      }
      if (!thumbnailSrc) {
        const thumbnailSrc = await getImageSrc(imageId);
        displaySet.thumbnailSrc = thumbnailSrc;
      }
      newImageSrcEntry[dSet.displaySetInstanceUID] = thumbnailSrc;

      setThumbnailImageSrcMap(prevState => {
        return { ...prevState, ...newImageSrcEntry };
      });
    });


  }, [displaySetService, dataSource, getImageSrc, activeViewportId, hasLoadedViewports]);


  // ~~ displaySets
  useEffect(() => {
    const currentDisplaySets = displaySetService.activeDisplaySets;

    if (!currentDisplaySets.length) {
      return;
    }

    const mappedDisplaySets = _mapDisplaySets(
      currentDisplaySets,
      displaySetsLoadingState,
      thumbnailImageSrcMap,
      trackedSeries,
      viewports,
      viewportGridService,
      dataSource,
      displaySetService,
      uiDialogService,
      uiNotificationService
    );

    setDisplaySets(mappedDisplaySets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displaySetService.activeDisplaySets,
    displaySetsLoadingState,
    trackedSeries,
    viewports,
    dataSource,
    thumbnailImageSrcMap,
  ]);

  // Fallback: when the current study does not arrive in the study list (a missing or
  // late QIDO response), rebuild a minimal entry from the display sets already loaded,
  useEffect(() => {
    const normalizedStudyInstanceUIDs = (StudyInstanceUIDs || [])
      .map(normalizeStudyInstanceUID)
      .filter(Boolean);

    if (!normalizedStudyInstanceUIDs.length || !displaySets?.length) {
      return;
    }

    const existingStudyIds = new Set(studyDisplayList.map(study => study.studyInstanceUid));
    const missingStudyIds = normalizedStudyInstanceUIDs.filter(
      studyId => studyId && !existingStudyIds.has(studyId)
    );

    if (!missingStudyIds.length) {
      return;
    }

    const fallbackStudies = missingStudyIds
      .map(studyId => {
        const displaySetsForStudy = displaySets.filter(ds => ds.StudyInstanceUID === studyId);
        if (!displaySetsForStudy.length) {
          return null;
        }

        const modalities = [...new Set(displaySetsForStudy.map(ds => ds.modality).filter(Boolean))];
        const instancesCount = displaySetsForStudy.reduce((acc, ds) => {
          const count = Number(ds.numInstances || 0);
          return acc + (Number.isFinite(count) ? count : 0);
        }, 0);
        const studyDescriptionFromDisplaySets = displaySetsForStudy
          .map(ds =>
            normalizeStudyDescription(
              ds.studyDescription || ds.StudyDescription || ds.description
            )
          )
          .find(Boolean);
        const studyDateFromDisplaySets = displaySetsForStudy
          .map(ds => normalizeText(ds.studyDate || ds.StudyDate || ds.seriesDate))
          .find(Boolean);

        return {
          studyInstanceUid: studyId,
          date: studyDateFromDisplaySets || t('NoStudyDate'),
          description: studyDescriptionFromDisplaySets || 'Current study',
          modalities: modalities.join('\\'),
          numInstances: instancesCount || displaySetsForStudy.length,
        };
      })
      .filter(Boolean);

    if (!fallbackStudies.length) {
      return;
    }

    setStudyDisplayList(prevStudies => {
      const mergedStudies = [...prevStudies];
      fallbackStudies.forEach(study => {
        if (!mergedStudies.find(existing => existing.studyInstanceUid === study.studyInstanceUid)) {
          mergedStudies.push(study);
        }
      });
      return mergedStudies;
    });
  }, [StudyInstanceUIDs, displaySets, studyDisplayList, t]);

  // -- displaySetsLoadingState
  useEffect(() => {
    const { unsubscribe } = studyPrefetcherService.subscribe(
      studyPrefetcherService.EVENTS.DISPLAYSET_LOAD_PROGRESS,
      updatedDisplaySetLoadingState => {
        const { displaySetInstanceUID, loadingProgress } = updatedDisplaySetLoadingState;

        setDisplaySetsLoadingState(prevState => ({
          ...prevState,
          [displaySetInstanceUID]: loadingProgress,
        }));
      }
    );

    return () => unsubscribe();
  }, [studyPrefetcherService]);

  // ~~ subscriptions --> displaySets
  useEffect(() => {
    // DISPLAY_SETS_ADDED returns an array of DisplaySets that were added
    const SubscriptionDisplaySetsAdded = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      data => {
        if (!hasLoadedViewports) {
          return;
        }
        const { displaySetsAdded, options } = data;
        displaySetsAdded.forEach(async dSet => {
          const displaySetInstanceUID = dSet.displaySetInstanceUID;

          const newImageSrcEntry = {};
          const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
          if (displaySet?.unsupported) {
            return;
          }

          if (options.madeInClient) {
            setJumpToDisplaySet(displaySetInstanceUID);
          }

          const imageIds = dataSource.getImageIdsForDisplaySet(displaySet);
          const imageId = getImageIdForThumbnail(displaySet, imageIds);

          // TODO: Is it okay that imageIds are not returned here for SR displaysets?
          if (!imageId) {
            return;
          }

          // When the image arrives, render it and store the result in the thumbnailImgSrcMap
          newImageSrcEntry[displaySetInstanceUID] = await getImageSrc(imageId);
          setThumbnailImageSrcMap(prevState => {
            return { ...prevState, ...newImageSrcEntry };
          });
        });
      }
    );

    return () => {
      SubscriptionDisplaySetsAdded.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySetService, dataSource, getImageSrc, thumbnailImageSrcMap, trackedSeries, viewports]);

  useEffect(() => {
    // TODO: Will this always hold _all_ the displaySets we care about?
    // DISPLAY_SETS_CHANGED returns `DisplaySerService.activeDisplaySets`
    const SubscriptionDisplaySetsChanged = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_CHANGED,
      changedDisplaySets => {
        const mappedDisplaySets = _mapDisplaySets(
          changedDisplaySets,
          displaySetsLoadingState,
          thumbnailImageSrcMap,
          trackedSeries,
          viewports,
          viewportGridService,
          dataSource,
          displaySetService,
          uiDialogService,
          uiNotificationService
        );

        setDisplaySets(mappedDisplaySets);
      }
    );

    const SubscriptionDisplaySetMetaDataInvalidated = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SET_SERIES_METADATA_INVALIDATED,
      () => {
        const mappedDisplaySets = _mapDisplaySets(
          displaySetService.getActiveDisplaySets(),
          displaySetsLoadingState,
          thumbnailImageSrcMap,
          trackedSeries,
          viewports,
          viewportGridService,
          dataSource,
          displaySetService,
          uiDialogService,
          uiNotificationService
        );

        setDisplaySets(mappedDisplaySets);
      }
    );

    return () => {
      SubscriptionDisplaySetsChanged.unsubscribe();
      SubscriptionDisplaySetMetaDataInvalidated.unsubscribe();
    };
  }, [
    displaySetsLoadingState,
    thumbnailImageSrcMap,
    trackedSeries,
    viewports,
    dataSource,
    displaySetService,
  ]);

  const normalizedPrimaryStudyInstanceUIDs = (StudyInstanceUIDs || [])
    .map(normalizeStudyInstanceUID)
    .filter(Boolean);
  const tabs = createStudyBrowserTabs(
    normalizedPrimaryStudyInstanceUIDs,
    studyDisplayList,
    displaySets
  );

  const hasDisplaySetsForStudy = studyUID => {
    const normalized = normalizeStudyInstanceUID(studyUID);
    if (!normalized) {
      return false;
    }
    return displaySets.some(
      displaySet => normalizeStudyInstanceUID(displaySet.StudyInstanceUID) === normalized
    );
  };

  const requestStudySeriesIfNeeded = studyUID => {
    const normalized = normalizeStudyInstanceUID(studyUID);
    if (!normalized) {
      return;
    }

    if (hasDisplaySetsForStudy(normalized)) {
      requestedSeriesByStudyUIDRef.current.delete(normalized);
      return;
    }

    if (requestedSeriesByStudyUIDRef.current.has(normalized)) {
      return;
    }

    requestedSeriesByStudyUIDRef.current.add(normalized);
    // A permanent trace: it is what tells a jump made by this preload (see the
    // jumpToDisplaySet effect) from a jump the reader asked for.
    studiPrecaricatiRef.current.add(normalized);
    const madeInClient = true;
    requestDisplaySetCreationForStudy(displaySetService, normalized, madeInClient);
  };

  useEffect(() => {
    displaySets.forEach(displaySet => {
      const normalized = normalizeStudyInstanceUID(displaySet.StudyInstanceUID);
      if (normalized) {
        requestedSeriesByStudyUIDRef.current.delete(normalized);
      }
    });
  }, [displaySets]);

  useEffect(() => {
    if (!tabs?.length) {
      return;
    }

    const activeTab = tabs.find(tab => tab.name === activeTabName);
    if (activeTab?.studies?.length) {
      return;
    }

    // Always keep "Current study" as the default: this stops it switching to the priors
    // by itself during the first renders, while the primary tab's data has not been
    // filled in yet.
    if (activeTabName === 'primary') {
      return;
    }

    // The same for a tab the reader opened on purpose: an empty one usually means the
    // priors are still loading, and moving them back would cost them their click.
    if (userChosenTabRef.current === activeTabName) {
      return;
    }

    const primaryTab = tabs.find(tab => tab.name === 'primary' && tab.studies?.length);
    const fallbackTab = primaryTab || tabs.find(tab => tab.studies?.length);
    if (fallbackTab && fallbackTab.name !== activeTabName) {
      setActiveTabName(fallbackTab.name);
    }
  }, [tabs, activeTabName]);

  useEffect(() => {
    if (!tabs?.length) {
      return;
    }

    const activeTab = tabs.find(tab => tab.name === activeTabName);
    if (!activeTab?.studies?.length) {
      return;
    }

    const hasExpandedStudy = activeTab.studies.some(study =>
      expandedStudyInstanceUIDs.includes(study.studyInstanceUid)
    );
    if (hasExpandedStudy) {
      return;
    }

    // Coming back to a tab reopens the last study expanded there, if it is still in the
    // list.
    const memorizzato = ultimoStudioPerTabRef.current[activeTabName];
    const memorizzatoAncoraPresente =
      memorizzato && activeTab.studies.some(study => study.studyInstanceUid === memorizzato);

    // With no memory, only "Current study" opens its first study by itself. In the
    // priors' tabs nothing expands until the reader chooses.
    const daEspandere = memorizzatoAncoraPresente
      ? memorizzato
      : activeTabName === 'primary'
        ? activeTab.studies[0].studyInstanceUid
        : null;

    if (!daEspandere) {
      return;
    }

    setExpandedStudyInstanceUIDs(prevState =>
      prevState.length === 1 && prevState[0] === daEspandere ? prevState : [daEspandere]
    );

    requestStudySeriesIfNeeded(daEspandere);
  }, [tabs, activeTabName, expandedStudyInstanceUIDs, displaySets]);

  // TODO: Should not fire this on "close"
  function _handleStudyClick(StudyInstanceUID) {
    const shouldCollapseStudy = expandedStudyInstanceUIDs.includes(StudyInstanceUID);
    // Accordion behaviour: only the study just expanded stays open, the rest close. With
    // the thumbnails of several studies open the panel grew enormous, and it became hard
    // to keep track of which study was being looked at.
    const updatedExpandedStudyInstanceUIDs = shouldCollapseStudy ? [] : [StudyInstanceUID];

    // Remembered per tab, and cleared on close, so coming back leaves the tab as it was
    // rather than reopening something the reader had just shut.
    ultimoStudioPerTabRef.current[activeTabName] = shouldCollapseStudy ? null : StudyInstanceUID;

    setExpandedStudyInstanceUIDs(updatedExpandedStudyInstanceUIDs);

    if (!shouldCollapseStudy) {
      requestStudySeriesIfNeeded(StudyInstanceUID);
    }
  }

  useEffect(() => {
    if (jumpToDisplaySet) {
      // Get element by displaySetInstanceUID
      const displaySetInstanceUID = jumpToDisplaySet;
      const element = document.getElementById(`thumbnail-${displaySetInstanceUID}`);

      if (element && typeof element.scrollIntoView === 'function') {
        // TODO: Any way to support IE here?
        element.scrollIntoView({ behavior: 'smooth' });

        setJumpToDisplaySet(null);
      }
    }
  }, [jumpToDisplaySet, expandedStudyInstanceUIDs, activeTabName]);

  useEffect(() => {
    if (!jumpToDisplaySet) {
      return;
    }

    const displaySetInstanceUID = jumpToDisplaySet;
    // Set the activeTabName and expand the study
    const thumbnailLocation = _findTabAndStudyOfDisplaySet(displaySetInstanceUID, tabs);
    if (!thumbnailLocation) {
      console.warn('jumpToThumbnail: displaySet thumbnail not found.');

      return;
    }
    const { tabName, StudyInstanceUID } = thumbnailLocation;
    // The automatic series preload causes a jump which, with remote priors, can arrive
    // seconds later: it must not drag the reader back to the tab they have just left.
    // Jumps they asked for (a report made, a double click) do not come through here.
    const jumpFromPreload = studiPrecaricatiRef.current.has(StudyInstanceUID);
    if (!jumpFromPreload || tabName === activeTabName) {
      setActiveTabName(tabName);
    }
    const studyExpanded = expandedStudyInstanceUIDs.includes(StudyInstanceUID);
    if (!studyExpanded) {
      const updatedExpandedStudyInstanceUIDs = [...expandedStudyInstanceUIDs, StudyInstanceUID];
      setExpandedStudyInstanceUIDs(updatedExpandedStudyInstanceUIDs);
    }
  }, [expandedStudyInstanceUIDs, jumpToDisplaySet, tabs]);

  // The status badge at the top of the priors list. It is direct DOM manipulation, like
  // the rest of this panel, because it grafts into the scrollbar StudyBrowser renders.
  const drawPriorsBadge = () => {
    const contenitore = document.querySelector('.ohif-scrollbar');
    if (!contenitore) {
      return;
    }
    const esistente = document.getElementById('priors-state');
    if (esistente) {
      esistente.remove();
    }

    if (activeTabName !== 'all') {
      return;
    }

    let testo;
    let classe = '';

    // Badge durante la search, poi solo se la tab e' rimasta vuota (altrimenti la lista
    // parla da se' e il badge sparisce).
    if (priorsState === 'loading') {
      testo = 'Search in corso';
      classe = 'loading';
    } else {
      const tabPriors = tabs.find(tab => tab.name === 'all');
      if (tabPriors?.studies?.length) {
        return;
      }
      testo = 'No local prior studies';
    }

    contenitore.insertAdjacentHTML(
      'afterbegin',
      `<div class="${classe}" id="priors-state"><p>${testo}</p></div>`
    );
  };

  // The badge has to be redrawn when the search changes state while the tab is already
  // open (the priors finish loading and "searching" goes away).
  useEffect(() => {
    drawPriorsBadge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorsState, activeTabName, studyDisplayList]);

  const onClickedtabName = clickedTabName => {
    userChosenTabRef.current = clickedTabName;
    try {
      // document.querySelector('[data-cy="FixReferenceLines"]').style.display = 'none'
      if (document.getElementById('priors-state')) {
        document.getElementById('priors-state').remove();
      }
      if (document.querySelector('.ohif-scrollbar .bg-black')) {
        document.querySelector('.ohif-scrollbar .bg-black').style.display = 'block';
      }

      // Always show the first prior when its tab is clicked, so the thumbnails are visible

      // if (clickedTabName === 'all' && showFirstPriorStudy) {
      //   setTimeout(() => {
      //     const priorsItems = document.querySelectorAll('.ohif-scrollbar button');
      //     if (priorsItems && priorsItems.length > 0) {
      //       priorsItems[0].click();
      //     }
      //   }, 0);
      //   showFirstPriorStudy = false;
      // }

      // The effect on activeTabName redraws the badge: the new one has not been applied
      // yet at this point, so drawing it now would use the previous tab.
    } catch (err) {
      console.error(err);
    }
  };

  const onClickUntrack = displaySetInstanceUID => {
    const onConfirm = () => {
      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);
      sendTrackedMeasurementsEvent('UNTRACK_SERIES', {
        SeriesInstanceUID: displaySet.SeriesInstanceUID,
      });
      const measurements = measurementService.getMeasurements();
      measurements.forEach(m => {
        if (m.referenceSeriesUID === displaySet.SeriesInstanceUID) {
          measurementService.remove(m.uid);
        }
      });
    };

    uiModalService.show({
      title: 'Untrack Series',
      content: UntrackSeriesModal,
      contentProps: {
        onConfirm,
      },
    });
  };

  return (
    <>
      <>
        <PanelStudyBrowserHeader
          viewPresets={viewPresets}
          updateViewPresetValue={updateViewPresetValue}
          actionIcons={actionIcons}
          updateActionIconValue={updateActionIconValue}
        />
        <Separator
          orientation="horizontal"
          className="bg-black"
          thickness="2px"
        />
      </>

      <StudyBrowser
        tabs={tabs}
        servicesManager={servicesManager}
        activeTabName={activeTabName}
        expandedStudyInstanceUIDs={expandedStudyInstanceUIDs}
        onClickStudy={_handleStudyClick}
        onClickTab={clickedTabName => {
          onClickedtabName(clickedTabName);
          setActiveTabName(clickedTabName);
        }}
        onClickUntrack={displaySetInstanceUID => {
          onClickUntrack(displaySetInstanceUID);
        }}
        // onClickThumbnail={() => { }}
        onClickThumbnail={onDoubleClickThumbnailHandler}
        onDoubleClickThumbnail={onDoubleClickThumbnailHandler}
        activeDisplaySetInstanceUIDs={activeViewportDisplaySetInstanceUIDs}
        showSettings={actionIcons.find(icon => icon.id === 'settings').value}
        viewPresets={viewPresets}
      />
    </>
  );
}

PanelStudyBrowserTracking.propTypes = {
  dataSource: PropTypes.shape({
    getImageIdsForDisplaySet: PropTypes.func.isRequired,
  }).isRequired,
  getImageSrc: PropTypes.func.isRequired,
  getStudiesForPatientByMRN: PropTypes.func.isRequired,
  requestDisplaySetCreationForStudy: PropTypes.func.isRequired,
};

function getImageIdForThumbnail(displaySet: any, imageIds: any) {
  let imageId;
  if (displaySet.isDynamicVolume) {
    const timePoints = displaySet.dynamicVolumeInfo.timePoints;
    const middleIndex = Math.floor(timePoints.length / 2);
    const middleTimePointImageIds = timePoints[middleIndex];
    imageId = middleTimePointImageIds[Math.floor(middleTimePointImageIds.length / 2)];
  } else {
    imageId = imageIds[Math.floor(imageIds.length / 2)];
  }
  return imageId;
}

/**
 * Maps from the DataSource's format to a naturalized object
 *
 * @param {*} studies
 */
function _mapDataSourceStudies(studies) {
  return studies.map(study => {
    const modalitiesFromTags =
      getDicomTagValues(study, '00080061').join('\\') ||
      getDicomTagValue(study, '00080060') ||
      '';

    const numInstancesRaw =
      study.NumInstances ?? study.instances ?? getDicomTagValue(study, '00201208') ?? 0;
    const normalizedNumInstances = Number(numInstancesRaw);

    // TODO: Why does the data source return in this format?
    return {
      AccessionNumber:
        study.AccessionNumber ?? study.accession ?? getDicomTagValue(study, '00080050'),
      StudyDate: study.StudyDate ?? study.date ?? getDicomTagValue(study, '00080020'),
      StudyDescription: normalizeStudyDescription(
        study.StudyDescription ??
          study.studyDescription ??
          study.description ??
          getDicomTagValue(study, '00081030')
      ),
      NumInstances: Number.isFinite(normalizedNumInstances) ? normalizedNumInstances : 0,
      ModalitiesInStudy:
        normalizeText(study.ModalitiesInStudy ?? study.modalities ?? modalitiesFromTags) || '',
      PatientID: study.PatientID ?? study.mrn ?? getDicomTagValue(study, '00100020'),
      PatientName: study.PatientName ?? study.patientName ?? getDicomTagValue(study, '00100010'),
      StudyInstanceUID:
        study.StudyInstanceUID ?? study.studyInstanceUid ?? getDicomTagValue(study, '0020000D'),
      StudyTime: study.StudyTime ?? study.time ?? getDicomTagValue(study, '00080030'),
    };
  });
}

function _mapDisplaySets(
  displaySets,
  displaySetLoadingState,
  thumbnailImageSrcMap,
  trackedSeriesInstanceUIDs,
  viewports, // TODO: make array of `displaySetInstanceUIDs`?
  viewportGridService,
  dataSource,
  displaySetService,
  uiDialogService,
  uiNotificationService
) {
  const thumbnailDisplaySets = [];
  const thumbnailNoImageDisplaySets = [];
  const noImageModalities = ['PR', 'SR', 'SEG', 'SM', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'];
  const shouldLogStudyBrowser = false; // attivare a true per debug DisplaySet/StudyBrowser
  // if (shouldLogStudyBrowser) {
  //   console.log('[StudyBrowser][DisplaySet][Summary]', {
  //     totalDisplaySets: displaySets?.length || 0,
  //     visibleDisplaySets: displaySets?.filter(ds => !ds.excludeFromThumbnailBrowser).length || 0,
  //   });
  // }
  displaySets
    .filter(ds => !ds.excludeFromThumbnailBrowser)
    .forEach(ds => {
      const { thumbnailSrc, displaySetInstanceUID } = ds; // thumbnailImageSrcMap[ds.displaySetInstanceUID];
      const componentType = _getComponentType(ds);

      const array =
        componentType === 'thumbnailTracked' ? thumbnailDisplaySets : thumbnailNoImageDisplaySets;

      const loadingProgress = displaySetLoadingState?.[displaySetInstanceUID];
      const studyDescription = normalizeStudyDescription(
        ds.StudyDescription ||
          ds.studyDescription ||
          ds?.images?.[0]?.StudyDescription ||
          ds?.instances?.[0]?.StudyDescription
      );

      const thumbnailProps = {
        displaySetInstanceUID,
        description: ds.SeriesDescription,
        studyDescription,
        studyDate: formatDate(ds.StudyDate) || formatDate(ds.SeriesDate),
        seriesNumber: ds.SeriesNumber,
        modality: ds.Modality,
        seriesDate: formatDate(ds.SeriesDate),
        numInstances: ds.numImageFrames,
        loadingProgress,
        countIcon: ds.countIcon,
        messages: ds.messages,
        StudyInstanceUID: ds.StudyInstanceUID,
        componentType,
        imageSrc: thumbnailSrc || thumbnailImageSrcMap[displaySetInstanceUID],
        dragData: {
          type: 'displayset',
          displaySetInstanceUID,
          modality: ds.Modality,
        },
        isTracked: trackedSeriesInstanceUIDs.includes(ds.SeriesInstanceUID),
        isHydratedForDerivedDisplaySet: ds.isHydrated,
      };

        // if (shouldLogStudyBrowser) {
        //   const modalityUpper = (ds.Modality || '').toString().toUpperCase();
        //   const isNoImageSeries =
        //     componentType === 'thumbnailNoImage' || noImageModalities.includes(modalityUpper);
        //   const payload = {
        //     displaySetInstanceUID,
        //     studyInstanceUID: ds.StudyInstanceUID,
        //     seriesInstanceUID: ds.SeriesInstanceUID,
        //     modality: ds.Modality,
        //     seriesNumber: ds.SeriesNumber,
        //     description: ds.SeriesDescription,
        //     studyDescription,
        //     numInstances: ds.numImageFrames,
        //     componentType,
        //     unsupported: ds?.unsupported,
        //     excludeFromThumbnailBrowser: ds?.excludeFromThumbnailBrowser,
        //     imageSrc: thumbnailProps.imageSrc,
        //     isNoImageSeries,
        //   };
        //   console.log('[StudyBrowser][DisplaySet]', payload);
        // }

      array.push(thumbnailProps);
    });

  return [...thumbnailDisplaySets, ...thumbnailNoImageDisplaySets];
}

function _getComponentType(ds) {
  if (shouldHideThumbnail(ds)) {
    return 'thumbnailNoImage';
  }

  return 'thumbnailTracked';
}

function _findTabAndStudyOfDisplaySet(displaySetInstanceUID, tabs) {
  for (let t = 0; t < tabs.length; t++) {
    const { studies } = tabs[t];

    for (let s = 0; s < studies.length; s++) {
      const { displaySets } = studies[s];

      for (let d = 0; d < displaySets.length; d++) {
        const displaySet = displaySets[d];

        if (displaySet.displaySetInstanceUID === displaySetInstanceUID) {
          return {
            tabName: tabs[t].name,
            StudyInstanceUID: studies[s].studyInstanceUid,
          };
        }
      }
    }
  }
}
