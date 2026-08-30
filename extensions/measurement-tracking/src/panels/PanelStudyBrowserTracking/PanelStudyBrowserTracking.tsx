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
import axios from 'axios';

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

let erroreStudiRemoti = false;
// Esito della verifica "esiste un centro remoto per questa partizione?", per aetitle.
// Vive quanto la pagina: se il pannello si rimonta non si rifa' la chiamata.
const centroRemotoConfigurato = new Map();
const mostraPrimoStudioStorico = true;
const INVALID_STUDY_DESCRIPTION_VALUES = new Set([
  'no data studio',
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
  // Storico remoto: 'idle' (mai cercato) | 'loading' | 'done' | 'error'
  const [statoStoricoRemoto, setStatoStoricoRemoto] = useState('idle');
  // Storico sul cloud / locale: 'idle' | 'loading' | 'done'
  const [statoStorico, setStatoStorico] = useState('idle');
  // Esiste un centro remoto configurato per la partizione corrente? Serve solo a far
  // ridisegnare le tab quando la verifica risponde.
  const [centroRemotoPresente, setCentroRemotoPresente] = useState(false);
  const storicoRemotoControllatoRef = useRef(false);
  const [hasLoadedViewports, setHasLoadedViewports] = useState(false);
  const [displaySets, setDisplaySets] = useState([]);
  const [displaySetsLoadingState, setDisplaySetsLoadingState] = useState({});
  const [thumbnailImageSrcMap, setThumbnailImageSrcMap] = useState({});
  const [jumpToDisplaySet, setJumpToDisplaySet] = useState(null);
  const requestedSeriesByStudyUIDRef = useRef(new Set());
  // Studi le cui serie sono state chieste dal pre-caricamento automatico (non dall'utente).
  const studiPrecaricatiRef = useRef(new Set());
  // Ultima tab scelta esplicitamente cliccando: non va abbandonata se ancora vuota.
  const tabSceltaDaUtenteRef = useRef(null);
  // Ultimo studio espanso in ciascuna tab: rientrando nella tab lo si riapre.
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

  //Al primo avvio verifico se sono su mobile, se lo sono al primo avvio setto la modalità visualizzazione serie in lista
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
        title: 'Selezione serie',
        message:
          "Il display set selezionato non può essere aggiunto alla viewport a causa di un'incongruenza con le regole dell'Hanging Protocol",
        type: 'info',
        duration: 3000,
      });
    }

    viewportGridService.setDisplaySetsForViewports(updatedViewports);
  };

  const activeViewportDisplaySetInstanceUIDs =
    viewports.get(activeViewportId)?.displaySetInstanceUIDs;

  const { trackedSeries } = trackedMeasurements.context;

  // La tab "Storico remoto" compare solo se per l'aetitle dell'URL esiste davvero un centro
  // configurato in remotePeers. Una sola chiamata per partizione, non bloccante: il viewer
  // continua a caricare e la tab si aggiunge appena arriva la risposta.
  useEffect(() => {
    if (!window.storicoRemoto) {
      return;
    }

    const aetitle = `${window.mdvAETitle || ''}`.trim();
    if (!aetitle) {
      window.storicoRemotoDisponibile = false;
      return;
    }

    if (centroRemotoConfigurato.has(aetitle)) {
      window.storicoRemotoDisponibile = centroRemotoConfigurato.get(aetitle);
      setCentroRemotoPresente(centroRemotoConfigurato.get(aetitle));
      return;
    }

    let annullato = false;
    const base = `${window.qidoUrl || ''}`.replace(/\/qido\/?$/, '');
    if (!base) {
      return;
    }

    axios
      .get(`${base}/storico-remoto/disponibile`, {
        params: { aetitle },
        withCredentials: false,
      })
      .then(risposta => {
        const disponibile = !!risposta?.data?.disponibile;
        centroRemotoConfigurato.set(aetitle, disponibile);
        if (!annullato) {
          window.storicoRemotoDisponibile = disponibile;
          setCentroRemotoPresente(disponibile);
        }
      })
      .catch(err => {
        // Solo un "no" esplicito del backend nasconde la tab. Se l'endpoint non c'e'
        // (backend non aggiornato/riavviato) o la rete fallisce, si torna al comportamento
        // precedente e la tab resta: meglio una tab che dira' "Offline" che una funzione
        // sparita senza spiegazione.
        const rispostaEsplicita = err?.response?.status === 200;
        const disponibile = !rispostaEsplicita;
        console.warn(
          `Storico remoto: verifica configurazione non riuscita (${
            err?.response?.status || 'nessuna risposta'
          }); tab ${disponibile ? 'mostrata comunque' : 'nascosta'}`,
          err
        );
        centroRemotoConfigurato.set(aetitle, disponibile);
        if (!annullato) {
          window.storicoRemotoDisponibile = disponibile;
          setCentroRemotoPresente(disponibile);
        }
      });

    return () => {
      annullato = true;
    };
  }, []);

  // ---- Storico remoto (solo suite) -------------------------------------------------
  // La ricerca parte al CLICK sulla tab, non all'apertura dello studio: un centro
  // irraggiungibile non deve rallentare il caricamento dello studio corrente.
  const buildQidoUrlRemoto = () => {
    const base = window.qidoUrlDefinitivo;
    if (!base) {
      return '';
    }
    const url = base.replace('/qido/', '/qido-remoto/');
    // L'aetitle identifica il centro da interrogare: se la query non lo porta gia',
    // uso quello con cui e' stato aperto il viewer.
    if (!/[?&]aetitle=/i.test(url) && window.mdvAETitle) {
      return `${url}${url.includes('?') ? '&' : '?'}aetitle=${encodeURIComponent(
        window.mdvAETitle
      )}`;
    }
    return url;
  };

  // window.qidoUrlDefinitivo viene popolato da StaticWadoClient quando parte la query per
  // PatientID: cliccando subito sulla tab puo' non essere ancora pronta, e dichiarare il
  // centro "Offline" sarebbe falso. Quindi la si attende, restando in "Ricerca in corso".
  const attendiQidoUrlRemoto = async (timeoutMs = 15000) => {
    const scadenza = Date.now() + timeoutMs;
    let url = buildQidoUrlRemoto();
    while (!url && Date.now() < scadenza) {
      await new Promise(resolve => setTimeout(resolve, 200));
      url = buildQidoUrlRemoto();
    }
    return url;
  };

  const storicoRemoto = async () => {
    if (storicoRemotoControllatoRef.current) {
      return;
    }
    storicoRemotoControllatoRef.current = true;
    setStatoStoricoRemoto('loading');

    const qidoUrl = await attendiQidoUrlRemoto();
    if (!qidoUrl) {
      console.warn('Storico remoto: query QIDO del paziente non disponibile');
      erroreStudiRemoti = true;
      storicoRemotoControllatoRef.current = false;
      setStatoStoricoRemoto('error');
      return;
    }

    try {
      const apiResponse = await axios.get(qidoUrl, {
        withCredentials: false, // Simile a credentials: 'omit'
      });

      const response = Array.isArray(apiResponse.data) ? apiResponse.data : [];
      console.log('storico remoto ', response);

      const studiRemotiGrezzi = response.map(a => {
        const remoteDescription = normalizeStudyDescription(getDicomTagValue(a, '00081030'));
        const remoteModalities = getDicomTagValues(a, '00080061').join('\\');
        return {
          studyInstanceUid: getDicomTagValue(a, '0020000D'),
          date: getDicomTagValue(a, '00080020'),
          time: getDicomTagValue(a, '00080030'),
          accession: getDicomTagValue(a, '00080050'),
          mrn: getDicomTagValue(a, '00100020'),
          patientName: getDicomTagValue(a, '00100010'),
          instances: getDicomTagValue(a, '00201208'),
          // Il marcatore |Remoto| e' quello che createStudyBrowserTabs usa per spostare
          // lo studio nella tab dedicata invece che nello storico sul cloud.
          description: `${remoteDescription || ''} |Remoto|`.trim(),
          modalities: remoteModalities || getDicomTagValue(a, '00080060'),
        };
      });

      const actuallyMappedStudies = _mapDataSourceStudies(studiRemotiGrezzi).map(qidoStudy => {
        return {
          studyInstanceUid: normalizeStudyInstanceUID(qidoStudy.StudyInstanceUID),
          date: formatDate(qidoStudy.StudyDate),
          description: normalizeStudyDescription(qidoStudy.StudyDescription),
          modalities: qidoStudy.ModalitiesInStudy,
          numInstances: qidoStudy.NumInstances,
        };
      });

      erroreStudiRemoti = false;
      setStudyDisplayList(prevStudies => upsertStudies(prevStudies, actuallyMappedStudies));
      setStatoStoricoRemoto('done');
    } catch (err) {
      erroreStudiRemoti = true;
      // Un centro momentaneamente offline deve poter essere ritentato riaprendo la tab.
      storicoRemotoControllatoRef.current = false;
      console.warn('Non è stato possibile recuperare lo storico remoto: ', err);
      setStatoStoricoRemoto('error');
    }
  };

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
      // Lo storico remoto NON viene cercato qui: parte al click sulla relativa tab.
    }

    const studyUIDs = (StudyInstanceUIDs || []).map(normalizeStudyInstanceUID).filter(Boolean);
    if (!studyUIDs.length) {
      return;
    }

    // Stato del caricamento storico: alimenta il badge "Ricerca in corso" della tab
    // "Storico sul cloud"/"Storico locale". allSettled perche' una query fallita non deve
    // lasciare il badge acceso per sempre.
    setStatoStorico('loading');
    Promise.allSettled(studyUIDs.map(sid => fetchStudiesForPatient(sid))).then(() =>
      setStatoStorico('done')
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

  // Fallback: se lo studio attuale non arriva nella study list (es. risposta QIDO assente/in ritardo),
  // ricostruisco una voce minima dagli stessi display set già caricati così le serie restano visibili.
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
          description: studyDescriptionFromDisplaySets || 'Studio attuale',
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
    // Traccia permanente: serve a riconoscere il jump generato da questo pre-caricamento
    // (vedi l'effetto di jumpToDisplaySet) e distinguerlo da un jump voluto dall'utente.
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

    // Mantieni sempre "Studio attuale" come default: evita switch automatici allo
    // storico durante i primi render quando i dati della tab primaria non sono
    // ancora stati popolati.
    if (activeTabName === 'primary') {
      return;
    }

    // 'remoteAll' e' legittimamente vuota finche' la ricerca sul centro non ha risposto
    // (parte al click): non va abbandonata, altrimenti il click sulla tab rimbalza indietro.
    if (activeTabName === 'remoteAll') {
      return;
    }

    // Idem per una tab aperta esplicitamente dall'utente: se e' vuota di solito lo storico
    // sta ancora caricando, e riportarlo indietro gli farebbe perdere il click.
    if (tabSceltaDaUtenteRef.current === activeTabName) {
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

    // Rientrando in una tab si riapre l'ultimo studio che vi era stato espanso, se c'e'
    // ancora nell'elenco.
    const memorizzato = ultimoStudioPerTabRef.current[activeTabName];
    const memorizzatoAncoraPresente =
      memorizzato && activeTab.studies.some(study => study.studyInstanceUid === memorizzato);

    // Senza memoria: solo "Studio attuale" apre da se' il primo studio. Nelle tab dello
    // storico non si espande nulla finche' non e' l'utente a scegliere.
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
    // Comportamento ad accordion: resta aperto solo lo studio appena espanso, gli altri si
    // chiudono. Con le anteprime di piu' studi aperte il pannello diventava lunghissimo e
    // si perdeva di vista quale studio si stesse guardando.
    const updatedExpandedStudyInstanceUIDs = shouldCollapseStudy ? [] : [StudyInstanceUID];

    // Memoria per tab: chiudendo si azzera, cosi' rientrando la tab resta com'e' stata
    // lasciata invece di riaprire qualcosa che l'utente aveva appena chiuso.
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
    // Il pre-caricamento automatico delle serie genera un jump che, con lo storico remoto,
    // puo' arrivare secondi dopo: non deve riportare l'utente sulla tab che ha appena
    // lasciato. I jump voluti (referto creato, doppio click) non passano di qui.
    const jumpDaPrecaricamento = studiPrecaricatiRef.current.has(StudyInstanceUID);
    if (!jumpDaPrecaricamento || tabName === activeTabName) {
      setActiveTabName(tabName);
    }
    const studyExpanded = expandedStudyInstanceUIDs.includes(StudyInstanceUID);
    if (!studyExpanded) {
      const updatedExpandedStudyInstanceUIDs = [...expandedStudyInstanceUIDs, StudyInstanceUID];
      setExpandedStudyInstanceUIDs(updatedExpandedStudyInstanceUIDs);
    }
  }, [expandedStudyInstanceUIDs, jumpToDisplaySet, tabs]);

  // Badge di stato in cima alla lista della tab remota. E' manipolazione DOM diretta come
  // il resto di questo pannello, perche' si innesta nella scrollbar renderizzata da StudyBrowser.
  const disegnaBadgeStorico = () => {
    const contenitore = document.querySelector('.ohif-scrollbar');
    if (!contenitore) {
      return;
    }
    const esistente = document.getElementById('storico-remoto');
    if (esistente) {
      esistente.remove();
    }

    let testo;
    let classe = '';

    if (activeTabName === 'remoteAll') {
      const numeroStudiRemoti = Array.isArray(window.studiRemoti) ? window.studiRemoti.length : 0;
      if (statoStoricoRemoto === 'loading') {
        testo = 'Ricerca in corso';
        classe = 'loading';
      } else if (statoStoricoRemoto === 'error') {
        testo = 'Offline';
        classe = 'error';
      } else if (!numeroStudiRemoti) {
        // Centro raggiungibile ma niente da mostrare: o non ha storico per questo paziente,
        // o quello che ha e' gia' tutto presente sul cloud (il backend lo filtra).
        testo = 'Nessuno storico remoto';
      } else {
        testo = 'Online';
      }
    } else if (activeTabName === 'all') {
      // Storico sul cloud / locale: badge durante la ricerca, poi solo se la tab e' rimasta
      // vuota (altrimenti la lista parla da se' e il badge sparisce).
      if (statoStorico === 'loading') {
        testo = 'Ricerca in corso';
        classe = 'loading';
      } else {
        const tabStorico = tabs.find(tab => tab.name === 'all');
        if (tabStorico?.studies?.length) {
          return;
        }
        testo = window.isSuiteRuntime ? 'Nessuno storico sul cloud' : 'Nessuno storico locale';
      }
    } else {
      return;
    }

    contenitore.insertAdjacentHTML(
      'afterbegin',
      `<div class="${classe}" id="storico-remoto"><p>${testo}</p></div>`
    );
  };

  // Il badge va ridisegnato quando una delle due ricerche cambia stato mentre la relativa
  // tab e' gia' aperta (es. lo storico finisce di caricare e "Ricerca in corso" sparisce).
  useEffect(() => {
    disegnaBadgeStorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statoStoricoRemoto, statoStorico, activeTabName, studyDisplayList, centroRemotoPresente]);

  const onClickedtabName = clickedTabName => {
    tabSceltaDaUtenteRef.current = clickedTabName;
    try {
      // document.querySelector('[data-cy="FixReferenceLines"]').style.display = 'none'
      if (document.getElementById('storico-remoto')) {
        document.getElementById('storico-remoto').remove();
      }
      if (document.querySelector('.ohif-scrollbar .bg-black')) {
        document.querySelector('.ohif-scrollbar .bg-black').style.display = 'block';
      }

      //Mostro sempre il primo storico se clicco la relativa tab così da far vedere le anteprime

      // if (clickedTabName === 'all' && mostraPrimoStudioStorico) {
      //   setTimeout(() => {
      //     const storicoItems = document.querySelectorAll('.ohif-scrollbar button');
      //     if (storicoItems && storicoItems.length > 0) {
      //       storicoItems[0].click();
      //     }
      //   }, 0);
      //   mostraPrimoStudioStorico = false;
      // }

      if (clickedTabName === 'remoteAll') {
        // Prima apertura della tab: e' qui che parte l'interrogazione del centro.
        if (!storicoRemotoControllatoRef.current) {
          storicoRemoto();
        }
      }
      // Il badge lo ridisegna l'effetto su activeTabName: qui quello nuovo non e' ancora
      // stato applicato, quindi disegnarlo adesso userebbe la tab precedente.
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

/**
 *
 * @param {string[]} primaryStudyInstanceUIDs
 * @param {object[]} studyDisplayList
 * @param {string} studyDisplayList.studyInstanceUid
 * @param {string} studyDisplayList.date
 * @param {string} studyDisplayList.description
 * @param {string} studyDisplayList.modalities
 * @param {number} studyDisplayList.numInstances
 * @param {object[]} displaySets
 * @returns tabs - The prop object expected by the StudyBrowser component
 */
function _createStudyBrowserTabs(
  primaryStudyInstanceUIDs,
  studyDisplayList,
  displaySets,
  hangingProtocolService
) {
  const primaryStudies = [];
  const recentStudies = [];
  let allStudies = [];
  let studiRemoti = [];

  // Iterate over each study...
  studyDisplayList.forEach(study => {
    // Find it's display sets
    const displaySetsForStudy = displaySets.filter(
      ds => ds.StudyInstanceUID === study.studyInstanceUid
    );

    // Sort them
    const dsSortFn = hangingProtocolService.getDisplaySetSortFunction();
    displaySetsForStudy.sort(dsSortFn);

    /* Sort by series number, then by series date
      displaySetsForStudy.sort((a, b) => {
        if (a.seriesNumber !== b.seriesNumber) {
          return a.seriesNumber - b.seriesNumber;
        }

        const seriesDateA = Date.parse(a.seriesDate);
        const seriesDateB = Date.parse(b.seriesDate);

        return seriesDateA - seriesDateB;
      });
    */

    // Map the study to it's tab/view representation
    const tabStudy = Object.assign({}, study, {
      displaySets: displaySetsForStudy,
    });

    // Add the "tab study" to the 'primary', 'recent', and/or 'all' tab group(s)
    if (primaryStudyInstanceUIDs.includes(study.studyInstanceUid)) {
      primaryStudies.push(tabStudy);
      allStudies.push(tabStudy);
    } else {
      // TODO: Filter allStudies to dates within one year of current date
      recentStudies.push(tabStudy);
      allStudies.push(tabStudy);
    }
  });

  allStudies = allStudies.filter(study => {
    if (study.description.includes('|Remoto|')) {
      study.description = study.description.replace('|Remoto|', '');
      studiRemoti.push(study);
      return false; // Esclude l'elemento da allStudies
    }
    return true; // Mantiene l'elemento in allStudies
  });

  if (studiRemoti.length === 0) {
    studiRemoti = [
      {
        studyInstanceUid: '',
        date: '',
        description: 'Nessuno storico remoto',
        modalities: '',
        numInstances: 0,
        displaySets: [],
      },
    ];
  }
  window.studiRemoti = JSON.parse(JSON.stringify(studiRemoti));

  // Newest first
  const _byDate = (a, b) => {
    const dateA = Date.parse(a);
    const dateB = Date.parse(b);

    return dateB - dateA;
  };

  const tabs = [
    {
      name: 'primary',
      label: 'Studio attuale',
      studies: primaryStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
    {
      name: 'recent',
      label: 'Storico locale',
      studies: recentStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
    {
      name: 'remoteAll',
      label: 'Storico remoto',
      studies: allStudies.sort((studyA, studyB) => _byDate(studyA.date, studyB.date)),
    },
  ];

  return tabs;
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
