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
    console.warn('[HP] Timed out at startup: the services are not ready', {
      waitedMs: Date.now() - hpStartTime,
      hasServices: !!window.servicesManager?.services,
      mdvAllReady: window.mdvAllReady,
    });
    return true;
  }
  return false;
};

const applyViewportOverlayFromPreferences = preferences => {
  const overlayTags = preferences?.viewportOverlayTags;
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

// Flags saying "what was saved", backwards-compatible with entries that carry no
// `captured`: for those the behaviour is grid, series, instance, zoom and pan, and no window level.
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

// Puts the saved subgrids (montage) back after the hanging protocol has rebuilt the
// layout. A hanging protocol regenerates viewportOptions WITHOUT montage, so it has to be set again here.
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
  // Register the custom view attributes (lat|ViewCode, 2D/3D) BEFORE applying the saved
  // protocol: the view-based seriesMatchingRules use them at load time.
  registerMdvHPAttributes(window.servicesManager?.services?.hangingProtocolService);
  let url = window.location.href;
  const urlParams = new URLSearchParams(new URL(url).search);
  // The parameter and the aetitle are the same thing under two names, and a saved
// arrangement belongs to the pair of that and the user. The first name is the one
// an older host page sends, and it is still read.
  const aetitle = window.mdvAETitle || urlParams.get('partizione') || urlParams.get('aetitle');
  const username = urlParams.get('User') || window.mdvUsername;
  // The local cache is per partition and user. Without the user, a shared workstation
  // would show one person the configuration left by the one before.
  const preferencesKey = `userPreferences-${aetitle}-${username}`;
  let mdvhp;

  let specificInstances = [];
  let hpTrovati = false;
  let tipoMatch = null;
  let capturedFlags;
  let montageByIndexLoaded;
  let studyInstanceUID = new URLSearchParams(new URL(url).search).get('StudyInstanceUIDs') || window.mdvStudyInstanceUIDs;
  let studyExamNameHP = new URLSearchParams(new URL(url).search).get('StudyDescription') || window.mdvStudyDescription;
  let modalityStudioHP = new URLSearchParams(new URL(url).search).get('Modality') || window.mdvModality;
  let examFound = false;
  let remotePreferences;
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

  // Are the study's metadata already there? Then a description or modality still empty
  // is a FINAL value, a study with no name, and not "still loading".
  const metadataAvailable = () => {
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
      // Everything that can be resolved is resolved: do not sit out the full five seconds on an unnamed study.
      if (metadataAvailable()) {
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
  console.log('[HP] Study', {
    studyInstanceUID,
    studyExamNameHP,
    modalityStudioHP,
  });

  if (!studyExamNameHP && !modalityStudioHP) {
    console.warn(
      "StudyDescription and Modality could not be determined from the URL or the metadata. Only study-specific hanging protocols will be applied."
    );
  }
  // Check whether preferences are already in localStorage. If not, this is the first time they are wanted, so ask the server
  if (!localStorage.getItem(preferencesKey)) {
    if (!username) {
      console.warn('No username: the remote hanging protocol preferences cannot be fetched');
      return;
    }
    remotePreferences = await fetchPreferencesFromApi(aetitle, username, studyInstanceUID);
    if (!remotePreferences || !remotePreferences.json) {
      return console.warn('The remote hanging protocol preferences were not fetched');
    }
    // And put them into localStorage
    localStorage.setItem(preferencesKey, JSON.stringify(remotePreferences.json));
    applyViewportOverlayFromPreferences(remotePreferences.json);
  }
  const userPreferencesCache = JSON.parse(localStorage.getItem(preferencesKey));
  applyViewportOverlayFromPreferences(userPreferencesCache);

  let userPreferencesForThisStudy = userPreferencesCache?.hp.specificStudy;
  let userPreferencesByExamDescription = userPreferencesCache?.hp.examName;
  if (!userPreferencesByExamDescription) {
    console.warn('No user preference found for this exam description');
  }
  let userPreferencesByModality = userPreferencesCache?.hp.modality;
  // The specific study comes first: whether any hanging protocol carries this StudyInstanceUID
  if (userPreferencesForThisStudy && userPreferencesForThisStudy[studyInstanceUID]) {
    cameraSettings = userPreferencesForThisStudy[studyInstanceUID].camera;
    cameraByIndex = userPreferencesForThisStudy[studyInstanceUID].cameraByIndex;
    voiSettings = userPreferencesForThisStudy[studyInstanceUID].voi;
    voiByIndex = userPreferencesForThisStudy[studyInstanceUID].voiByIndex;
    colormapSettings = userPreferencesForThisStudy[studyInstanceUID].colormap;
    colormapByIndex = userPreferencesForThisStudy[studyInstanceUID].colormapByIndex;
    capturedFlags = userPreferencesForThisStudy[studyInstanceUID].captured;
    montageByIndexLoaded = userPreferencesForThisStudy[studyInstanceUID].montageByIndex;
    specificInstances = userPreferencesForThisStudy[studyInstanceUID].specificInstances;
    mdvhp = userPreferencesForThisStudy[studyInstanceUID].protocol;
    // window.hpCamera = userPreferencesForThisStudy[studyInstanceUID].camera;
    hpTrovati = true;
    tipoMatch = 'specificStudy';
  }
  // With no specific study, iterate looking for a saved exam description or modality
  else {
    // No `break` here, deliberately: where there are phantom duplicates (legacy entries
    // with examName missing or undefined, plus new ones with ''), the LAST occurrence
    // wins, which is the most recent, because saves are appended. That heals data
    // already corrupted, before a new save de-duplicates it through ensureHpStructure.
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
        specificInstances = userPreferencesByExamDescription[i].specificInstances;
        mdvhp = userPreferencesByExamDescription[i].protocol;
        // window.hpCamera = userPreferencesByExamDescription[i].camera;
        examFound = true;
        hpTrovati = true;
        tipoMatch = 'examDescription';
      }
    }
    // Nothing so far, so try by modality
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
            specificInstances = userPreferencesByModality[i].specificInstances;
            mdvhp = userPreferencesByModality[i].protocol;
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
  // What this entry saved, with a backwards-compatible default for legacy entries.
  const captured = resolveCaptured(capturedFlags);

  // Put the specific instances back, but only when they were saved.
  // Applied twice: initialImageOptions, when the viewport is created, and
  // window.imageIndexFromHPMdv, applied after the render in CornerstoneViewportService,
  // which holds even when the viewport is NOT recreated and initialImageOptions is ignored.
  window.imageIndexFromHPMdv = {};
  if (captured.instance && Array.isArray(specificInstances) && specificInstances.length) {
    for (let i = 0; i < specificInstances.length; i++) {
      if (specificInstances[i] == null) {
        continue;
      }
      const isMontageVp = !!montageByIndexLoaded?.[i]?.enabled;
      if (isMontageVp) {
        continue; // a subgrid uses firstImageIndex, scrolling by blocks, not the viewport index
      }
      const zeroBased = specificInstances[i] - 1;
      if (mdvhp?.stages?.[0]?.viewports?.[i]) {
        mdvhp.stages[0].viewports[i].viewportOptions.initialImageOptions = { index: zeroBased };
      }
      window.imageIndexFromHPMdv[`mdvhp-${i}`] = zeroBased;
    }
  }

  // Remaps per-viewport settings (an `mdvhp-i` map by id, or an array by index) to a map by id.
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

  // Zoom and pan (the camera), applied only when it was saved
  window.cameraSettingsFromHPMdv = {};
  if (captured.zoomPan && (cameraSettings || cameraByIndex)) {
    const cameraByIndexToUse = cameraByIndex || cameraSettings?.byIndex || [];
    const cameraByViewportId = cameraSettings?.byViewportId || cameraSettings || {};
    window.cameraSettingsFromHPMdv = remapPerViewport(cameraByViewportId, cameraByIndexToUse);
  }

  // Window level (VOI), applied only when it was saved
  window.voiSettingsFromHPMdv = {};
  if (captured.windowLevel && (voiSettings || voiByIndex)) {
    window.voiSettingsFromHPMdv = remapPerViewport(voiSettings || {}, voiByIndex || []);
  }

  // Colour LUT (colormap), applied only when it was saved
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
      console.warn('[HP] The services are not ready');
      return false;
    }
    const { hangingProtocolService, displaySetService, uiNotificationService, viewportGridService } =
      services;
    if (!hangingProtocolService || !displaySetService || !viewportGridService) {
      console.warn('[HP] Services are missing', {
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
      console.warn('[HP] ViewportGridService is not ready', err);
      return false;
    }
    const viewports = viewportsState?.viewports;
    const viewportsCount = viewports?.size ?? viewports?.length ?? 0;
    const activeStudyUID =
      activeStudy?.StudyInstanceUID || activeStudy?.studyInstanceUID || activeStudy?.StudyUID;
    if (studyInstanceUID && activeStudyUID && activeStudyUID !== studyInstanceUID) {
      console.warn('[HP] The active study does not match', {
        activeStudyUID,
        studyInstanceUID,
      });
      return false;
    }
    if (!activeStudy || !displaySetsCount || !viewportsCount) {
      console.warn('[HP] Application deferred', {
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
        message: `Hanging protocols applied`,
        type: 'success',
      });
      reapplyMontageLoaded(viewportGridService, montageByIndexLoaded);
      return true;
    } catch (error) {
      console.warn('[HP] Applying it failed; it will be tried again when the display set changes');
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

  // Once loading is done, refresh localStorage so the data stays current
  if (username) {
    remotePreferences = await fetchPreferencesFromApi(aetitle, username, studyInstanceUID);
    if (!remotePreferences || !remotePreferences.json) {
      return console.warn('The remote hanging protocol preferences were not fetched');
    }
    // And put them into localStorage
    localStorage.setItem(preferencesKey, JSON.stringify(remotePreferences.json));
  }
};

async function fetchPreferencesFromApi(aetitle, username, studyInstanceUID) {
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

    // The response is read inside the try, not returned out of it.
    //
    // A server that does not know this address answers with the application's own page
    // and a status of 200: ok is true, the body is HTML, and json() fails. Returning the
    // promise let that rejection leave the function without passing through here, so it
    // reached the console as an unhandled exception and the panel sat on "Loading..."
    // instead of falling back to the local cache, which is what the caller expects.
    return await apiResponse.json();
  } catch (err) {
    console.warn('[HP] The remote user preferences are unavailable, falling back to the local cache', err);
    return;
  }
}

export { fetchPreferencesFromApi };
