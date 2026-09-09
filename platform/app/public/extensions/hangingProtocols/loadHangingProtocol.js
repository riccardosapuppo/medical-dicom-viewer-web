import { registerMdvHPAttributes } from './mammoView';

const _mdvhp = {
  id: 'mdvhp',
  description: 'Has various hanging protocol grid layouts',
  name: '2x2',
  protocolMatchingRules: [],
  displaySetSelectors: {
    DisplaySet0: {
      seriesMatchingRules: [
        {
          attribute: 'SeriesInstanceUID',
          constraint: {
            contains: '1.3.76.2.1.1.4.1.3.7471.776535301',
          },
        },
      ],
    },
    DisplaySet1: {
      seriesMatchingRules: [
        {
          attribute: 'SeriesInstanceUID',
          constraint: {
            contains: '1.3.76.2.1.1.4.1.3.7471.776535351',
          },
        },
      ],
    },
    DisplaySet2: {
      seriesMatchingRules: [
        {
          attribute: 'SeriesInstanceUID',
          constraint: {
            contains: '1.3.76.2.1.1.4.1.3.7471.776535708',
          },
        },
      ],
    },
    DisplaySet3: {
      seriesMatchingRules: [
        {
          attribute: 'SeriesInstanceUID',
          constraint: {
            contains: '1.3.76.2.1.1.4.1.3.7471.776536010',
          },
        },
      ],
    },
  },
  stages: [
    {
      id: '2x2',
      name: '2x2',
      viewportStructure: {
        layoutType: 'grid',
        properties: {
          rows: 2,
          columns: 2,
        },
      },
      viewports: [
        {
          viewportOptions: {
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: 'DisplaySet0',
            },
          ],
        },
        {
          viewportOptions: {
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: 'DisplaySet1',
            },
          ],
        },
        {
          viewportOptions: {
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: 'DisplaySet2',
            },
          ],
        },
        {
          viewportOptions: {
            toolGroupId: 'default',
            viewportType: 'stack',
          },
          displaySets: [
            {
              id: 'DisplaySet3',
            },
          ],
        },
      ],
    },
  ],
  numberOfPriorsReferenced: -1,
};

const MAX_WAIT_HP_START_MS = 120000;
const HP_START_INTERVAL_MS = 250;
const hpStartTime = Date.now();

const canStartHangingProtocolLoad = () => {
  const services = window.servicesManager?.services;
  const hasServices =
    !!services?.hangingProtocolService &&
    !!services?.displaySetService &&
    !!services?.viewportGridService;
  if (!window.mdvAllReady && !hasServices) {
    return false;
  }
  const viewportGridService = services?.viewportGridService;
  if (!viewportGridService?.getState) {
    return false;
  }
  try {
    const state = viewportGridService.getState();
    return !!state;
  } catch (err) {
    return false;
  }
};

const tryStartHangingProtocolLoad = () => {
  if (window.loadHangingProtocol) {
    return true;
  }
  if (canStartHangingProtocolLoad()) {
    window.loadHangingProtocol = true;
    console.log('[HP] Loading started');
    loadHangingProtocol();
    return true;
  }
  if (Date.now() - hpStartTime > MAX_WAIT_HP_START_MS) {
    console.warn('[HP] Timeout avvio: servizi non pronti', {
      waitedMs: Date.now() - hpStartTime,
      hasServices: !!window.servicesManager?.services,
      mdvAllReady: window.mdvAllReady,
    });
    return true;
  }
  return false;
};

const applyViewportOverlayFromPreferences = preferenze => {
  const overlayTags = preferenze?.viewportOverlayTags;
  if (!overlayTags) {
    return;
  }

  if (!window.config) {
    window.config = {};
  }
  if (!window.mdvDefaultViewportOverlayTags) {
    try {
      window.mdvDefaultViewportOverlayTags = window.config.viewportOverlayTags
        ? JSON.parse(JSON.stringify(window.config.viewportOverlayTags))
        : null;
    } catch (err) {
      window.mdvDefaultViewportOverlayTags = window.config.viewportOverlayTags || null;
    }
  }
  window.config.viewportOverlayTags = overlayTags;
  window.mdvViewportOverlayPending = overlayTags;

  const customizationService = window.servicesManager?.services?.customizationService;
  const buildCustomizations = window.mdvBuildViewportOverlayCustomizations;
  const applyNow = () => {
    if (!customizationService || typeof buildCustomizations !== 'function') {
      return false;
    }
    try {
      const customizations = buildCustomizations(overlayTags);
      const scope = customizationService.Scope?.Global || customizationService.Scope?.Mode;
      customizationService.setCustomizations(customizations, scope);
      window.mdvViewportOverlayPending = null;
      return true;
    } catch (err) {
      console.warn('Viewport overlay: the preferences could not be applied', err);
      return false;
    }
  };

  if (!applyNow() && typeof window.mdvApplyViewportOverlayIfReady === 'function') {
    window.mdvApplyViewportOverlayIfReady();
  }
};

const hangingProtocolLoadInterval = setInterval(() => {
  if (tryStartHangingProtocolLoad()) {
    clearInterval(hangingProtocolLoadInterval);
  }
}, HP_START_INTERVAL_MS);

window.addEventListener('load', () => {
  if (tryStartHangingProtocolLoad()) {
    clearInterval(hangingProtocolLoadInterval);
  }
});

  let cameraSettings;
  let cameraByIndex;
  let voiSettings;
  let voiByIndex;
  let colormapSettings;
  let colormapByIndex;

// Flags "cosa è stato salvato" (retro-compatibile con entry senza `captured`:
// comportamento priors = griglia + serie + istanza + zoom/pan, niente window level).
const resolveCaptured = captured => {
  const c = captured && typeof captured === 'object' ? captured : null;
  if (c) {
    return {
      grid: c.grid !== false,
      series: c.series !== false,
      instance: !!c.instance,
      windowLevel: !!c.windowLevel,
      zoomPan: !!c.zoomPan,
      colorLut: !!c.colorLut,
    };
  }
  return {
    grid: true,
    series: true,
    instance: true,
    windowLevel: false,
    zoomPan: true,
    colorLut: false,
  };
};

// Riapplica le sottogriglie (Montage) salvate dopo che l'HP ha (ri)creato il layout.
// L'Hanging Protocol rigenera viewportOptions SENZA montage, quindi va reimpostato a parte.
let _montageReapplyScheduled = false;
const reapplyMontageLoaded = (viewportGridService, montageByIndex) => {
  const list = Array.isArray(montageByIndex) ? montageByIndex : [];
  if (_montageReapplyScheduled || !viewportGridService || !list.some(m => m?.enabled)) {
    return;
  }
  _montageReapplyScheduled = true;
  let done = false;
  const apply = () => {
    if (done) {
      return;
    }
    done = true;
    try {
      const state = viewportGridService.getState();
      list.forEach((m, idx) => {
        if (!m?.enabled) {
          return;
        }
        const vpId = `mdvhp-${idx}`;
        const vp = state.viewports.get(vpId);
        if (!vp) {
          return;
        }
        viewportGridService.setDisplaySetsForViewports([
          {
            viewportId: vpId,
            displaySetInstanceUIDs: vp.displaySetInstanceUIDs,
            viewportOptions: {
              ...vp.viewportOptions,
              montage: { ...m, firstImageIndex: m.firstImageIndex ?? 0 },
            },
            displaySetOptions: vp.displaySetOptions,
          },
        ]);
      });
    } catch (err) {
      console.warn('[HP] Putting the subgrid back failed', err);
    }
    sub?.unsubscribe?.();
  };
  const sub = viewportGridService.subscribe?.(
    viewportGridService.EVENTS.VIEWPORTS_READY,
    apply
  );
  setTimeout(apply, 600);
};

const loadHangingProtocol = async () => {
  // Registra gli attributi custom di vista (lat|ViewCode, 2D/3D) PRIMA di applicare
  // l'HP salvato: le seriesMatchingRules basate sulla vista li usano al caricamento.
  registerMdvHPAttributes(window.servicesManager?.services?.hangingProtocolService);
  let url = window.location.href;
  const urlParams = new URLSearchParams(new URL(url).search);
  // partizione (postazione) ≡ aetitle: le config viaggiano per (partizione, utente).
  const aetitle = window.mdvAETitle || urlParams.get('partizione') || urlParams.get('aetitle');
  const username = urlParams.get('User') || window.mdvUsername;
  // Cache locale per (partizione, utente): senza l'utente, su postazione condivisa
  // un altro utente leggerebbe la config di chi l'ha preceduto.
  const preferenzeKey = `userPreferences-${aetitle}-${username}`;
  let mdvhp;

  let istanzeSpecifiche = [];
  let hpTrovati = false;
  let tipoMatch = null;
  let capturedFlags;
  let montageByIndexLoaded;
  let studyInstanceUID = new URLSearchParams(new URL(url).search).get('StudyInstanceUIDs') || window.mdvStudyInstanceUIDs;
  let studyExamNameHP = new URLSearchParams(new URL(url).search).get('StudyDescription') || window.mdvStudyDescription;
  let modalityStudioHP = new URLSearchParams(new URL(url).search).get('Modality') || window.mdvModality;
  let examFound = false;
  let preferenzeRemote;
  const normalizza = value => (value || '').toString().trim().toUpperCase();
  const normalizzaModality = value =>
    (value || '')
      .toString()
      .split('\\')
      .map(item => normalizza(item))
      .filter(Boolean);

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const applicaFallbackDaMetadata = () => {
    if (studyExamNameHP && modalityStudioHP) {
      return true;
    }
    const displaySetService = window.servicesManager?.services?.displaySetService;
    if (!displaySetService || !studyInstanceUID) {
      return false;
    }
    const displaySets = displaySetService.getDisplaySetsBy(
      ds => ds?.StudyInstanceUID === studyInstanceUID
    );
    if (!displaySets?.length) {
      return false;
    }
    const displaySetWithInstance = displaySets.find(ds => ds.instances?.length) || displaySets[0];
    const referenceInstance =
      displaySetWithInstance?.instance || displaySetWithInstance?.instances?.[0];

    if (!studyExamNameHP) {
      const studyDescriptionFromMetadata =
        referenceInstance?.StudyDescription || displaySetWithInstance?.StudyDescription;
      if (studyDescriptionFromMetadata) {
        studyExamNameHP = studyDescriptionFromMetadata;
        window.mdvStudyDescription = studyExamNameHP;
      }
    }

    if (!modalityStudioHP) {
      const modalities = new Set();
      displaySets.forEach(ds => {
        if (ds?.Modality) {
          modalities.add(ds.Modality);
        } else if (ds?.instances?.[0]?.Modality) {
          modalities.add(ds.instances[0].Modality);
        }
      });
      if (modalities.size) {
        modalityStudioHP = Array.from(modalities).join('\\');
        window.mdvModality = modalityStudioHP;
      }
    }

    return !!(studyExamNameHP || modalityStudioHP);
  };

  // Metadati dello studio già disponibili? Allora una description/modality ancora vuota
  // è un valore DEFINITIVO (studio senza nome), non "sto ancora caricando".
  const metadataDisponibili = () => {
    const displaySetService = window.servicesManager?.services?.displaySetService;
    if (!displaySetService || !studyInstanceUID) {
      return false;
    }
    const dss =
      displaySetService.getDisplaySetsBy?.(ds => ds?.StudyInstanceUID === studyInstanceUID) || [];
    return dss.length > 0;
  };

  const ensureStudyInfoFromMetadata = async () => {
    if (studyExamNameHP && modalityStudioHP) {
      return;
    }

    const start = Date.now();
    const timeoutMs = 5000;
    const stepMs = 250;

    while (Date.now() - start <= timeoutMs) {
      applicaFallbackDaMetadata();
      if (studyExamNameHP && modalityStudioHP) {
        return;
      }
      // Risolto tutto il possibile: non aspettare i 5s pieni sugli studi senza nome/modality.
      if (metadataDisponibili()) {
        return;
      }
      await wait(stepMs);
    }
  };

  if (!studyInstanceUID || !aetitle) {
    console.warn("Custom hanging protocols cannot be read: StudyInstanceUIDs or the AE title are missing");
    return;
  }

  await ensureStudyInfoFromMetadata();
  const normalisedExamName = normalizza(studyExamNameHP);
  console.log('[HP] Studio', {
    studyInstanceUID,
    studyExamNameHP,
    modalityStudioHP,
  });

  if (!studyExamNameHP && !modalityStudioHP) {
    console.warn(
      "StudyDescription and Modality could not be determined from the URL or the metadata. Only study-specific hanging protocols will be applied."
    );
  }
  //Verifico che ci siano già delle preferenze nella localStorage. Se non fosse così è la prima volta che richiedo le preferenze quindi le chiedo al server
  if (!localStorage.getItem(preferenzeKey)) {
    if (!username) {
      console.warn('No username: the remote hanging protocol preferences cannot be fetched');
      return;
    }
    preferenzeRemote = await letturaPreferenzeAPI(aetitle, username, studyInstanceUID);
    if (!preferenzeRemote || !preferenzeRemote.json) {
      return console.warn('The remote hanging protocol preferences were not fetched');
    }
    //A questo punto li setto in localStorage
    localStorage.setItem(preferenzeKey, JSON.stringify(preferenzeRemote.json));
    applyViewportOverlayFromPreferences(preferenzeRemote.json);
  }
  const userPreferencesCache = JSON.parse(localStorage.getItem(preferenzeKey));
  applyViewportOverlayFromPreferences(userPreferencesCache);

  let userPreferencesForThisStudy = userPreferencesCache?.hp.studioSpecifico;
  let userPreferencesByExamDescription = userPreferencesCache?.hp.examName;
  if (!userPreferencesByExamDescription) {
    console.warn('No user preference found for this exam description');
  }
  let userPreferencesByModality = userPreferencesCache?.hp.modality;
  //Prima do priorità allo studio specifico ovvero se gli hanging protocol hanno quello studyInstanceUID
  if (userPreferencesForThisStudy && userPreferencesForThisStudy[studyInstanceUID]) {
    cameraSettings = userPreferencesForThisStudy[studyInstanceUID].camera;
    cameraByIndex = userPreferencesForThisStudy[studyInstanceUID].cameraByIndex;
    voiSettings = userPreferencesForThisStudy[studyInstanceUID].voi;
    voiByIndex = userPreferencesForThisStudy[studyInstanceUID].voiByIndex;
    colormapSettings = userPreferencesForThisStudy[studyInstanceUID].colormap;
    colormapByIndex = userPreferencesForThisStudy[studyInstanceUID].colormapByIndex;
    capturedFlags = userPreferencesForThisStudy[studyInstanceUID].captured;
    montageByIndexLoaded = userPreferencesForThisStudy[studyInstanceUID].montageByIndex;
    istanzeSpecifiche = userPreferencesForThisStudy[studyInstanceUID].istanzeSpecifiche;
    mdvhp = userPreferencesForThisStudy[studyInstanceUID].performanceHP;
    // window.hpCamera = userPreferencesForThisStudy[studyInstanceUID].camera;
    hpTrovati = true;
    tipoMatch = 'studioSpecifico';
  }
  //Se non c'è lo studio specifico itero per controllare se presente exam description o modality salvata negli HP
  else {
    // NB: nessun `break` → in caso di duplicati "fantasma" (entry legacy con examName
    // assente/undefined + entry nuove con ''), vince l'ULTIMA occorrenza = la più
    // recente (i salvataggi vengono aggiunti in coda). Guarisce i dati già corrotti
    // anche prima che un nuovo salvataggio li deduplichi tramite ensureHpStructure.
    for (let i = 0; i < (userPreferencesByExamDescription || []).length; i++) {
      if (normalizza(userPreferencesByExamDescription[i].examName) === normalisedExamName) {
        cameraSettings = userPreferencesByExamDescription[i].camera;
        cameraByIndex = userPreferencesByExamDescription[i].cameraByIndex;
        voiSettings = userPreferencesByExamDescription[i].voi;
        voiByIndex = userPreferencesByExamDescription[i].voiByIndex;
        colormapSettings = userPreferencesByExamDescription[i].colormap;
        colormapByIndex = userPreferencesByExamDescription[i].colormapByIndex;
        capturedFlags = userPreferencesByExamDescription[i].captured;
        montageByIndexLoaded = userPreferencesByExamDescription[i].montageByIndex;
        istanzeSpecifiche = userPreferencesByExamDescription[i].istanzeSpecifiche;
        mdvhp = userPreferencesByExamDescription[i].performanceHP;
        // window.hpCamera = userPreferencesByExamDescription[i].camera;
        examFound = true;
        hpTrovati = true;
        tipoMatch = 'examDescription';
      }
    }
    // Non ho trovato nulla finora, provo per modality
    if (!examFound) {
      // eslint-disable-next-line no-lone-blocks
      {
        for (let i = 0; i < (userPreferencesByModality || []).length; i++) {
          const modalityCandidates = normalizzaModality(modalityStudioHP);
          const savedCandidates = normalizzaModality(userPreferencesByModality[i].modalityName);
          const hasMatch = savedCandidates.some(item => modalityCandidates.includes(item));
          if (modalityCandidates.length && hasMatch) {
            cameraSettings = userPreferencesByModality[i].camera;
            cameraByIndex = userPreferencesByModality[i].cameraByIndex;
            voiSettings = userPreferencesByModality[i].voi;
            voiByIndex = userPreferencesByModality[i].voiByIndex;
            colormapSettings = userPreferencesByModality[i].colormap;
            colormapByIndex = userPreferencesByModality[i].colormapByIndex;
            capturedFlags = userPreferencesByModality[i].captured;
            montageByIndexLoaded = userPreferencesByModality[i].montageByIndex;
            istanzeSpecifiche = userPreferencesByModality[i].istanzeSpecifiche;
            mdvhp = userPreferencesByModality[i].performanceHP;
            // window.hpCamera = userPreferencesByModality[i].camera;
            hpTrovati = true;
            tipoMatch = 'modality';
          }
        }
      }
    }
  }
  if (hpTrovati) {
    console.log('[HP] Match', {
      tipo: tipoMatch,
      studyInstanceUID,
      studyExamNameHP,
      modalityStudioHP,
    });
  } else {
    console.warn('[HP] No hanging protocol found for this study', {
      studyInstanceUID,
      studyExamNameHP,
      modalityStudioHP,
    });
  }
  // Cosa è stato salvato in questa entry (default retro-compatibile per entry legacy).
  const captured = resolveCaptured(capturedFlags);

  //Sistemo le istanze specifiche (solo se erano state salvate).
  // Doppia applicazione: initialImageOptions (alla creazione del viewport) +
  // window.imageIndexFromHPMdv (applicato dopo il render in CornerstoneViewportService,
  // robusto anche se il viewport NON viene ricreato / initialImageOptions ignorato).
  window.imageIndexFromHPMdv = {};
  if (captured.instance && Array.isArray(istanzeSpecifiche) && istanzeSpecifiche.length) {
    for (let i = 0; i < istanzeSpecifiche.length; i++) {
      if (istanzeSpecifiche[i] == null) {
        continue;
      }
      const isMontageVp = !!montageByIndexLoaded?.[i]?.enabled;
      if (isMontageVp) {
        continue; // le montage usano firstImageIndex (scroll a blocchi), non l'indice del viewport
      }
      const zeroBased = istanzeSpecifiche[i] - 1;
      if (mdvhp?.stages?.[0]?.viewports?.[i]) {
        mdvhp.stages[0].viewports[i].viewportOptions.initialImageOptions = { index: zeroBased };
      }
      window.imageIndexFromHPMdv[`mdvhp-${i}`] = zeroBased;
    }
  }

  // Rimappa settings per-viewport (mappa per-id `mdvhp-i` oppure array per-indice) → mappa per-id.
  const remapPerViewport = (byViewportId, byIndex) => {
    const remapped = {};
    if (byViewportId && Object.keys(byViewportId).some(key => key.startsWith('mdvhp-'))) {
      Object.entries(byViewportId).forEach(([key, value]) => {
        if (key.startsWith('mdvhp-') && value) {
          remapped[key] = value;
        }
      });
    } else if (Array.isArray(byIndex)) {
      byIndex.forEach((value, index) => {
        if (value) {
          remapped[`mdvhp-${index}`] = value;
        }
      });
    }
    return remapped;
  };

  // Zoom / Pan (camera) — applicato solo se salvato
  window.cameraSettingsFromHPMdv = {};
  if (captured.zoomPan && (cameraSettings || cameraByIndex)) {
    const cameraByIndexToUse = cameraByIndex || cameraSettings?.byIndex || [];
    const cameraByViewportId = cameraSettings?.byViewportId || cameraSettings || {};
    window.cameraSettingsFromHPMdv = remapPerViewport(cameraByViewportId, cameraByIndexToUse);
  }

  // Window Level (VOI) — applicato solo se salvato
  window.voiSettingsFromHPMdv = {};
  if (captured.windowLevel && (voiSettings || voiByIndex)) {
    window.voiSettingsFromHPMdv = remapPerViewport(voiSettings || {}, voiByIndex || []);
  }

  // Color LUT (colormap) — applicato solo se salvato
  window.colormapFromHPMdv = {};
  if (captured.colorLut && (colormapSettings || colormapByIndex)) {
    window.colormapFromHPMdv = remapPerViewport(colormapSettings || {}, colormapByIndex || []);
  }

  if (
    Object.keys(window.cameraSettingsFromHPMdv).length ||
    Object.keys(window.voiSettingsFromHPMdv).length ||
    Object.keys(window.colormapFromHPMdv).length ||
    Object.keys(window.imageIndexFromHPMdv).length
  ) {
    window.viewportsAlreadyHPApplied = [];
  }

  // window.cameraSettingsFromHPMdv = cameraSettings;

  //Applico HP letti
  const applicaHangingProtocol = () => {
    if (!mdvhp) {
      return false;
    }
    const services = window.servicesManager?.services;
    if (!services) {
      console.warn('[HP] Servizi non pronti');
      return false;
    }
    const { hangingProtocolService, displaySetService, uiNotificationService, viewportGridService } =
      services;
    if (!hangingProtocolService || !displaySetService || !viewportGridService) {
      console.warn('[HP] Servizi mancanti', {
        hasHP: !!hangingProtocolService,
        hasDisplaySets: !!displaySetService,
        hasViewportGrid: !!viewportGridService,
      });
      return false;
    }
    const activeStudy = hangingProtocolService.getActiveProtocol?.()?.activeStudy;
    const displaySetsCount = displaySetService?.getActiveDisplaySets?.()?.length || 0;
    let viewportsState;
    try {
      viewportsState = viewportGridService.getState?.();
    } catch (err) {
      console.warn('[HP] ViewportGridService non pronto', err);
      return false;
    }
    const viewports = viewportsState?.viewports;
    const viewportsCount = viewports?.size ?? viewports?.length ?? 0;
    const activeStudyUID =
      activeStudy?.StudyInstanceUID || activeStudy?.studyInstanceUID || activeStudy?.StudyUID;
    if (studyInstanceUID && activeStudyUID && activeStudyUID !== studyInstanceUID) {
      console.warn('[HP] Studio attivo non corrisponde', {
        activeStudyUID,
        studyInstanceUID,
      });
      return false;
    }
    if (!activeStudy || !displaySetsCount || !viewportsCount) {
      console.warn('[HP] Applicazione rimandata', {
        hasActiveStudy: !!activeStudy,
        displaySetsCount,
        viewportsCount,
      });
      return false;
    }

    try {
      hangingProtocolService.addProtocol(mdvhp.id, mdvhp);
      hangingProtocolService.setProtocol('mdvhp');
      uiNotificationService.show({
        title: 'Hanging protocol',
        message: `Hanging protocol applicati`,
        type: 'success',
      });
      reapplyMontageLoaded(viewportGridService, montageByIndexLoaded);
      return true;
    } catch (error) {
      console.warn('HP - applicazione fallita, riprovo al cambio display set');
      return false;
    }
  };

  if (mdvhp) {
    const applied = applicaHangingProtocol();
    if (!applied) {
      const services = window.servicesManager?.services;
      const { displaySetService, viewportGridService } = services || {};
      const subscriptions = [];
      const tryApply = () => {
        const retryApplied = applicaHangingProtocol();
        if (retryApplied) {
          subscriptions.forEach(sub => sub?.unsubscribe?.());
          subscriptions.length = 0;
        }
      };
      if (displaySetService?.subscribe) {
        subscriptions.push(
          displaySetService.subscribe(displaySetService.EVENTS.DISPLAY_SETS_CHANGED, tryApply)
        );
      }
      if (viewportGridService?.subscribe) {
        subscriptions.push(
          viewportGridService.subscribe(viewportGridService.EVENTS.VIEWPORTS_READY, tryApply)
        );
        subscriptions.push(
          viewportGridService.subscribe(viewportGridService.EVENTS.GRID_STATE_CHANGED, tryApply)
        );
      }
    }
  }

  //A fine caricamento rinnovo la localStorage per avere dati sempre freschi e aggiornati
  if (username) {
    preferenzeRemote = await letturaPreferenzeAPI(aetitle, username, studyInstanceUID);
    if (!preferenzeRemote || !preferenzeRemote.json) {
      return console.warn('The remote hanging protocol preferences were not fetched');
    }
    //A questo punto li setto in localStorage
    localStorage.setItem(preferenzeKey, JSON.stringify(preferenzeRemote.json));
  }
};

async function letturaPreferenzeAPI(aetitle, username, studyInstanceUID) {
  const origin = window.location.origin;
  const apiUrl = `${origin}/viewer/userdata/${aetitle}/?user=${username}&StudyInstanceUIDs=${studyInstanceUID}&cacheBuster=${new Date().getTime()}`;

  try {
    const apiResponse = await fetch(apiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    });

    if (!apiResponse.ok) {
      console.warn('[HP] The remote user preferences are out of reach');
      return;
    }

    // La risposta va letta dentro il try, non restituita.
    //
    // Un server che non conosce questo indirizzo risponde con la pagina
    // dell'applicazione e stato 200: ok è vero, il corpo è HTML, e json()
    // fallisce. Restituendo la promessa il rifiuto usciva dalla funzione senza
    // passare di qui, arrivava alla console come eccezione non gestita e il
    // pannello restava fermo su "Loading..." invece di ripiegare sulla
    // cache locale, come chi lo ha chiamato si aspetta.
    return await apiResponse.json();
  } catch (err) {
    console.warn('[HP] The remote user preferences are unavailable, falling back to the local cache', err);
    return;
  }
}

export { letturaPreferenzeAPI };
