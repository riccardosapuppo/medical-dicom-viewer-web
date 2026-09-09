/* eslint-disable default-case */

const PRIORS_IFRAME_READY_TIMEOUT_MS = 25000;
let priorsReadyTimeoutId = null;
let priorsPendingPreloader = null;

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const normalized = String(value).trim();
  return normalized;
}

function getDataAttributeValue(element, keys) {
  if (!element || !element.dataset) {
    return '';
  }
  for (const key of keys) {
    const value = normalizeValue(element.dataset[key]);
    if (value) {
      return value;
    }
  }
  return '';
}

function getParamCaseInsensitive(params, ...keys) {
  if (!params || !keys.length) {
    return '';
  }
  const entries = Array.from(params.entries());
  for (const key of keys) {
    const hit = entries.find(([name]) => name.toLowerCase() === key.toLowerCase());
    const value = normalizeValue(hit?.[1]);
    if (value) {
      return value;
    }
  }
  return '';
}

function parsePriorsLink(linkValue) {
  const raw = normalizeValue(linkValue);
  if (!raw) {
    return {};
  }
  try {
    const parsedUrl = new URL(raw, window.location.origin);
    const params = parsedUrl.searchParams;
    return {
      studyInstanceUID: getParamCaseInsensitive(params, 'StudyInstanceUIDs', 'StudyInstanceUID'),
      aetitle: getParamCaseInsensitive(params, 'aetitle', 'partizione'),
      token: getParamCaseInsensitive(params, 'Token', 'token'),
      user: getParamCaseInsensitive(params, 'User', 'user'),
    };
  } catch (_) {
    return {};
  }
}

function resolvePriorsContext(e, studyInstanceUID, options = {}) {
  const normalizedOptions =
    typeof options === 'string' ? { aetitle: options } : options || {};
  const target = e?.currentTarget;
  const carrier =
    target?.closest?.(
      '[data-study-instance-uid],[data-study-instance-uids],[data-studyuid],[data-study],[data-aetitle],[data-partizione],[data-url]'
    ) || null;

  const parsedLink = parsePriorsLink(
    normalizedOptions.url ||
    getDataAttributeValue(target, ['url', 'viewerUrl', 'link']) ||
    getDataAttributeValue(carrier, ['url', 'viewerUrl', 'link']) ||
    target?.getAttribute?.('href')
  );

  let resolvedStudyUID =
    normalizeValue(studyInstanceUID) ||
    normalizeValue(normalizedOptions.studyInstanceUID) ||
    getDataAttributeValue(target, ['studyInstanceUid', 'studyInstanceUIDs', 'studyuid', 'study']) ||
    getDataAttributeValue(carrier, ['studyInstanceUid', 'studyInstanceUIDs', 'studyuid', 'study']) ||
    normalizeValue(parsedLink.studyInstanceUID);

  let resolvedAetitle =
    normalizeValue(normalizedOptions.aetitle) ||
    getDataAttributeValue(target, ['aetitle', 'partizione']) ||
    getDataAttributeValue(carrier, ['aetitle', 'partizione']) ||
    normalizeValue(parsedLink.aetitle);

  if (resolvedStudyUID.includes('|')) {
    const [studyUIDOnly, aetitleFromUID] = resolvedStudyUID.split('|');
    resolvedStudyUID = normalizeValue(studyUIDOnly);
    if (!resolvedAetitle) {
      resolvedAetitle = normalizeValue(aetitleFromUID);
    }
  }

  const resolvedToken =
    normalizeValue(normalizedOptions.token) ||
    getDataAttributeValue(target, ['token']) ||
    getDataAttributeValue(carrier, ['token']) ||
    normalizeValue(parsedLink.token);

  const resolvedUser =
    normalizeValue(normalizedOptions.user) ||
    getDataAttributeValue(target, ['user', 'username']) ||
    getDataAttributeValue(carrier, ['user', 'username']) ||
    normalizeValue(parsedLink.user);

  return {
    studyInstanceUID: resolvedStudyUID,
    aetitle: resolvedAetitle,
    token: resolvedToken,
    user: resolvedUser,
  };
}

function clearPriorsLoadingState({ removePreloader = false } = {}) {
  if (priorsReadyTimeoutId) {
    clearTimeout(priorsReadyTimeoutId);
    priorsReadyTimeoutId = null;
  }
  if (removePreloader && priorsPendingPreloader?.isConnected) {
    priorsPendingPreloader.remove();
  }
  priorsPendingPreloader = null;
}

function showPriorsLoadingError(
  message = 'The prior study could not be loaded. Check the token, the AE title, and whether the data is there.'
) {
  if (!priorsPendingPreloader || !priorsPendingPreloader.isConnected) {
    clearPriorsLoadingState();
    return;
  }

  if (priorsReadyTimeoutId) {
    clearTimeout(priorsReadyTimeoutId);
    priorsReadyTimeoutId = null;
  }

  const preloader = priorsPendingPreloader;
  preloader.innerHTML = '';
  preloader.style.display = 'flex';
  preloader.style.alignItems = 'center';
  preloader.style.justifyContent = 'center';

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.gap = '12px';
  wrapper.style.padding = '24px';
  wrapper.style.maxWidth = '90%';
  wrapper.style.textAlign = 'center';
  wrapper.style.color = '#fff';

  const title = document.createElement('div');
  title.textContent = 'The prior studies could not be loaded';
  title.style.fontSize = '16px';
  title.style.fontWeight = '600';

  const text = document.createElement('div');
  text.textContent = message;
  text.style.fontSize = '13px';
  text.style.lineHeight = '1.4';
  text.style.opacity = '0.9';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.background = '#0ea5e9';
  closeButton.style.border = '1px solid #d0d0d0';
  closeButton.style.color = '#fff';
  closeButton.style.padding = '6px 12px';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => {
    window.postMessage('close-priors-iframe', '*');
  });

  wrapper.appendChild(title);
  wrapper.appendChild(text);
  wrapper.appendChild(closeButton);
  preloader.appendChild(wrapper);
}

// ---------------------------------------------------------------------------
// ALLINEAMENTO VERTICALE DELLO PRIORS AFFIANCATO
//
// L'iframe dello priors e' un float inserito DOPO la barra dei tab dello
// studio principale, quindi parte gia' piu' in basso di tutta l'height della
// barra; al suo interno ha a sua volta la propria etichetta patient, che
// finiva percio' ben sotto quella dello studio principale e faceva scendere
// anche la griglia dello priors.
// Invece di inseguire numeri fissi (l'height dipende da header, banner
// estensione, zoom del browser) misuriamo a runtime: l'iframe viene tirato su
// con un margine negativo finche' la sua etichetta e' alla stessa height di
// quella principale, e la sua area viewport viene chiusa esattamente sul fondo
// di quella dello studio principale. Vale per qualsiasi configurazione.
// ---------------------------------------------------------------------------

let priorsAlignmentIntervalId = null;
let priorsAlignmentResizeId = null;

function stopPriorsAlignment() {
  if (priorsAlignmentIntervalId) {
    clearInterval(priorsAlignmentIntervalId);
    priorsAlignmentIntervalId = null;
  }
}

/**
 * Allinea l'iframe dello priors allo studio principale.
 * @returns {boolean} true se le misure erano disponibili ed e' stato applicato.
 */
function alignPriorsToMainStudy() {
  const iframe = document.getElementById('priors-iframe');
  const mainArea = document.querySelector('.mdv-main-area');
  if (!iframe || !mainArea) {
    return false;
  }

  let priorsDocument = null;
  try {
    priorsDocument = iframe.contentDocument;
  } catch (_) {
    return false; //iframe non ancora accessibile
  }
  const priorsArea = priorsDocument?.querySelector('.mdv-main-area');
  if (!priorsArea) {
    return false;
  }

  //Riferimento per l'allineamento in alto: l'etichetta patient se c'e' da
  //entrambe le parti (e' quella che l'utente vede), altrimenti l'area viewport.
  const mainTabBar = document.getElementById('mdv-tab-container');
  const priorsTabBar = priorsDocument.getElementById('mdv-tab-container');
  const tabBarUse = Boolean(mainTabBar && priorsTabBar);
  const mainRef = tabBarUse ? mainTabBar : mainArea;
  const priorsRef = tabBarUse ? priorsTabBar : priorsArea;

  //1) Etichetta dello priors alla stessa height di quella principale.
  iframe.style.marginTop = '0px';
  const scarto = Math.round(
    iframe.getBoundingClientRect().top +
      priorsRef.getBoundingClientRect().top -
      mainRef.getBoundingClientRect().top
  );
  if (scarto > 0) {
    iframe.style.marginTop = `-${scarto}px`;
  }

  //2) Cornice e griglia dello priors chiuse sul fondo di quella principale.
  //   Le regole CSS .priors-same-tab sono !important, quindi lo sono anche
  //   queste altezze calcolate.
  const mainBackground = mainArea.getBoundingClientRect().bottom;
  const cimaIframe = iframe.getBoundingClientRect().top;

  const priorsBody = priorsDocument.body;
  const bodyHeight = Math.round(
    mainBackground - (cimaIframe + priorsBody.getBoundingClientRect().top)
  );
  if (bodyHeight > 0) {
    priorsBody.style.setProperty('height', `${bodyHeight}px`, 'important');
  }

  const areaHeight = Math.round(
    mainBackground - (cimaIframe + priorsArea.getBoundingClientRect().top)
  );
  if (areaHeight > 0) {
    priorsArea.style.setProperty('height', `${areaHeight}px`, 'important');
  }

  return true;
}

/**
 * Avvia l'allineamento: la barra dei tab dentro l'iframe viene creata in modo
 * asincrono, quindi riproviamo finche' le misure ci sono (max ~10s).
 */
function startPriorsAlignment() {
  stopPriorsAlignment();

  let tentativi = 0;
  let concluso = false;
  const prova = () => {
    tentativi += 1;
    const fatto = alignPriorsToMainStudy();
    if (fatto || tentativi > 40) {
      concluso = true;
      stopPriorsAlignment();
      if (fatto) {
        //Ritocco finale a layout assestato (pannelli laterali, hanging protocol).
        setTimeout(alignPriorsToMainStudy, 500);
      }
    }
  };

  prova();
  if (!concluso) {
    priorsAlignmentIntervalId = setInterval(prova, 250);
  }
}

//Il ridimensionamento della finestra cambia le altezze di header e barra tab.
window.addEventListener('resize', () => {
  if (!document.getElementById('priors-iframe')) {
    return;
  }
  clearTimeout(priorsAlignmentResizeId);
  priorsAlignmentResizeId = setTimeout(alignPriorsToMainStudy, 150);
});

function markPriorsIframeReady() {
  if (priorsPendingPreloader?.isConnected) {
    priorsPendingPreloader.remove();
  }
  clearPriorsLoadingState();
  //Il preloader occupava la meta' destra: solo ora l'iframe e' al suo posto
  //e ha senso misurarlo per allinearlo allo studio principale.
  startPriorsAlignment();
}

function startPriorsLoadingWatch(preloader) {
  clearPriorsLoadingState();
  priorsPendingPreloader = preloader;

  priorsReadyTimeoutId = setTimeout(() => {
    showPriorsLoadingError();
  }, PRIORS_IFRAME_READY_TIMEOUT_MS);
}

const openPriors = (e, modalita, studyInstanceUID, options = {}) => {
  e.stopPropagation();
  if (typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const context = resolvePriorsContext(e, studyInstanceUID, options);
  if (!context.studyInstanceUID) {
    console.warn('The prior study cannot be opened: the StudyInstanceUID is missing.');
    return;
  }

  const currentUrl = window.location.href;
  const url = new URL(currentUrl);
  const params = new URLSearchParams(url.search);

  params.set('StudyInstanceUIDs', context.studyInstanceUID);
  params.delete('priors');
  params.set('priorsOpenTs', `${Date.now()}`);

  if (context.aetitle) {
    params.set('aetitle', context.aetitle);
  }
  if (context.token) {
    params.set('Token', context.token);
    params.delete('token');
  }
  if (context.user) {
    params.set('User', context.user);
  }

  const newUrl = `${url.origin}${url.pathname}?${params.toString()}`;

  if (modalita === 'stessaScheda') {
    const priorsIframe = document.getElementById('priors-iframe');
    const isAlreadyActive = e.currentTarget?.classList?.contains('active');
    if (priorsIframe && isAlreadyActive) {
      window.postMessage('close-priors-iframe', '*');
      return;
    }

    //Coloro l'icona cliccata di quello studio specifico
    for (const a of document.querySelectorAll('#priors-same-window')) {
      a.classList.remove('active');
    }
    e.currentTarget.classList.add('active');
    split2Studies(newUrl, context.studyInstanceUID);
  } else if (modalita === 'nuovaScheda') {
    window.open(newUrl, '_blank');
  }
};

const createPreloader = (message = 'Loading the prior studies...') => {
  const preloader = document.createElement('div');
  preloader.className = 'preloader';
  preloader.setAttribute('data-priors-preloader', 'true');

  const text = document.createElement('div');
  text.textContent = message;
  text.style.position = 'absolute';
  text.style.bottom = '20px';
  text.style.left = '50%';
  text.style.transform = 'translateX(-50%)';
  text.style.fontSize = '12px';
  text.style.color = '#d8d8d8';
  text.style.zIndex = '2';
  preloader.appendChild(text);

  return preloader;
};

const saveSeriesToClickAgain = () => {
  const { viewportGridService } = window.servicesManager.services;
  const { activeViewportId, viewports } = viewportGridService.getState();
  const activeViewport = viewports.get(activeViewportId);
  const activeDisplaySetInstanceUID = activeViewport.displaySetInstanceUIDs[0];
  window.instanceUIDMPRToClick = activeDisplaySetInstanceUID;
};

const fixlayoutViewportsMPR = () => {
  //Disattivo e riattivo mpr salvando la serie attualmente attiva
  saveSeriesToClickAgain();
  document.querySelector('[data-cy="LayoutMPR"]').click(); //Disattivo MPR
  document.body.classList.add('loading-spinner-into-grid'); //Non mostro il cambio vista griglia ma metto uno spinner

  setTimeout(() => {
    document.querySelector('[data-cy="LayoutMPR"]').click(); //Riattivo MPR
  }, 0);
  setTimeout(() => {
    document.body.classList.remove('loading-spinner-into-grid');

    // window.instanceUIDMPRToClick = null;

    //A fine fix ritorno sempre e comunque nella tab dello priors da cui sono partito
    document.querySelector('.storicosulcloud').click();
  }, 500);
};

function split2Studies(urlToOpen) {
  clearPriorsLoadingState({ removePreloader: true });
  stopPriorsAlignment();
  if (document.getElementById('priors-iframe')) {
    document.getElementById('priors-iframe').remove(); //Sovrascrivo sempre
  }
  //Se è attivo l'mpr lo disabilito e lo riabilito quando lo schermo è già diviso in quanto il ridimensionamento
  //della finestra lo farebbe sfasare random, abilitandolo invece a schermo già diviso non da problemi
  if (document.body.classList.contains('hp-mpr-active')) {
    fixlayoutViewportsMPR();
  }
  document.body.classList.add('priors-injected-iframe');
  document.body.classList.remove('secondo-mpr-attivo');
  const mainArea = document.querySelector('.mdv-main-area');
  mainArea.style.width = '50%';
  mainArea.style.float = 'left'; // Imposta il float per affiancarlo

  // Crea un nuovo iframe
  const iframe = document.createElement('iframe');
  const iframeUrl = new URL(urlToOpen, window.location.origin);
  iframeUrl.searchParams.set('priors', 'same-tab');
  iframe.src = iframeUrl.toString();
  iframe.id = 'priors-iframe';
  iframe.dataset.loaded = 'false';

  // Applica lo stile all'iframe
  iframe.style.width = '50%'; // Imposta l'iframe al 50% della width
  iframe.style.height = '100vh'; // Altezza a tutta la vista
  iframe.style.border = 'none'; // Rimuove il bordo
  iframe.style.float = 'left'; // Imposta anche qui il float
  iframe.style.position = 'relative'; // Imposta anche qui il float
  iframe.style.zIndex = '19'; // Imposta anche qui il float

  //Creo un preloader
  const preloader = createPreloader();

  mainArea.parentNode.insertBefore(preloader, mainArea.nextSibling);
  // return;

  // Inserisci l'iframe dopo il main area
  preloader.parentNode.insertBefore(iframe, preloader.nextSibling);
  startPriorsLoadingWatch(preloader);
  // mainArea.parentNode.insertBefore(iframe, mainArea.nextSibling);
  // Aggiungi un listener per aspettare il caricamento dell'iframe
  iframe.onload = function () {
    try {
      const iframeDocument = iframe.contentWindow.document;
      if (window.location.href.includes('priors=same-tab')) {
        iframeDocument.body.classList.add('priors-same-tab');
      }
    } catch (err) {
      console.warn('Could not put the priors-same-tab class on the frame:', err);
    }
  };
  //A questo punto avvio un listener per ascoltare eventuali messages dall'iframe listener
  ascoltoMessaggiIframeFiglio();
}

//Se sono già uno priors mi differenzio
if (window.location.href.includes('priors=same-tab')) {
  document.body.classList.add('priors-same-tab');
  //Aggiungo il pulsante chiudi per rimuovere eventualmente l'iframe
  document.body.insertAdjacentHTML(
    'beforebegin',
    `
    <button class="close-iframe">x</button>
    `
  );
  const closeIframeBtn = document.querySelector('.close-iframe');
  closeIframeBtn.addEventListener('click', () => {
    window.parent.postMessage('close-priors-iframe', '*');
  });

  window.iAmAPrior = true;

  //Attivo listener per ricevere messages dal padre
  window.addEventListener(
    'message',
    function (event) {
      if (event.origin !== window.location.origin) {
        return;
      }
      const messageReceived = event.data;
      activateCommandOnIframe(messageReceived);
    },
    false
  );
}

// ---------------------------------------------------------------------------
// PONTE COMANDI: studio principale -> iframe dello priors
//
// Nella modalita' "priors affiancato" la toolbar dell'iframe e' nascosta via
// CSS e i comandi arrivano dallo studio principale via postMessage. Prima si
// simulavano i click sui bottoni (data-cy + setTimeout annidati): approccio
// fragile, che falliva per tutto cio' che vive dentro un menu a tendina (Reset
// e gli altri "MoreTools") e per i tool senza un case dedicato (Scale, Cursori
// di riferimento, Link images, Zoom 1:1, ...).
// Ora il message viene risolto sull'id del bottone di toolbar e passato a
// toolbarService.recordInteraction: e' la stessa identica strada del click
// reale (esegue i comandi con le loro opzioni e aggiorna lo stato del bottone),
// quindi ogni strumento della toolbar risulta sincronizzato senza dover
// scrivere un case dedicato qui dentro.
// ---------------------------------------------------------------------------

//Messaggi "storici" (nomi comando) -> id del bottone di toolbar corrispondente.
//Tutti gli altri messages sono gia' id di bottone (es. 'ScaleOverlay', 'Pan').
const PRIORS_TOOLBAR_ITEM_BY_MESSAGE = {
  cine: 'Cine',
  resetViewport: 'Reset',
  zoomOneToOne: 'ZoomOneToOne',
  invertViewport: 'invert',
  flipViewportHorizontal: 'flipHorizontal',
  flipViewportVertical: 'flipVertical',
  'rotateViewport-90': 'rotate-right',
  'rotateViewport--90': 'rotate-left',
  mprDirectClick: 'LayoutMPR',
  'enable-mpr': 'LayoutMPR',
};

//Preset avanzati 3D/MPR: il selettore layout li segna anche come classe sul body.
const PRIORS_PRESET_BODY_CLASSES = ['fourUp', 'main3D', 'primaryAxial', 'only3D', 'primary3D'];

function getPriorsServices() {
  return window.servicesManager?.services || null;
}

/**
 * Esegue nell'iframe la stessa interazione di un click sul bottone di toolbar:
 * recordInteraction lancia i comandi del bottone con le sue opzioni (incluso
 * itemId, indispensabile ai toggle tipo Scale / Reference lines) e
 * aggiorna lo stato della toolbar.
 * @returns {boolean} true se il bottone esiste (comando gestito).
 */
function runToolbarItemOnPriors(itemId) {
  const services = getPriorsServices();
  const toolbarService = services?.toolbarService;
  const buttonProps = toolbarService?.getButtonProps?.(itemId);
  if (!buttonProps) {
    return false;
  }

  //Se nello priors il bottone e' disabilitato (es. Crosshairs fuori dall'MPR)
  //non eseguo nulla, esattamente come farebbe il click reale.
  if (buttonProps.disabled === true) {
    return true;
  }

  toolbarService.recordInteraction(
    { ...buttonProps, itemId },
    { refreshProps: { viewportId: services?.viewportGridService?.getActiveViewportId?.() } }
  );
  return true;
}

/** Esegue un comando OHIF puro (messages strutturati dal padre). */
function runCommandOnPriors(commandName, commandOptions = {}) {
  if (!commandName || !window.commandsManager?.run) {
    return false;
  }
  window.commandsManager.run({ commandName, commandOptions });
  return true;
}

/** Layout griglia scelto dal padre ('layout-common-2x3', 'custom2x3'). */
function applyGridLayoutOnPriors(numRows, numCols) {
  if (!numRows || !numCols) {
    return false;
  }
  //Come il selettore layout: il cambio griglia annulla l'MPR da hanging protocol.
  document.body.classList.remove('hp-mpr-active');
  window.mprIsActive = false;
  return runCommandOnPriors('setViewportGridLayout', { numRows, numCols });
}

/** Preset avanzato = id di hanging protocol ('mpr', 'fourUp', 'main3D', ...). */
function applyHangingProtocolOnPriors(protocolId) {
  const services = getPriorsServices();
  const hangingProtocolService = services?.hangingProtocolService;
  if (!hangingProtocolService?.protocols?.get?.(protocolId)) {
    return false;
  }

  PRIORS_PRESET_BODY_CLASSES.forEach(preset => document.body.classList.remove(preset));
  if (PRIORS_PRESET_BODY_CLASSES.includes(protocolId)) {
    document.body.classList.add(protocolId);
  }

  //Memorizzo la serie attiva per ricliccarla a preset applicato, come fa il
  //selettore layout dello studio principale.
  let activeDisplaySetInstanceUID = null;
  try {
    const { activeViewportId, viewports } = services.viewportGridService.getState();
    activeDisplaySetInstanceUID = viewports.get(activeViewportId)?.displaySetInstanceUIDs?.[0];
  } catch (_) {
    /* viewport non ancora pronta */
  }

  //Maschera di caricamento come nel selettore layout dello studio principale.
  document.body.classList.add('mpr-layout-loading');
  window.mdvProtocolToApply = protocolId;
  hangingProtocolService.setProtocol(protocolId);

  if (activeDisplaySetInstanceUID) {
    window.instanceUIDMPRToClick = activeDisplaySetInstanceUID;
  }
  setTimeout(() => {
    if (activeDisplaySetInstanceUID) {
      document.querySelector(`#thumbnail-${activeDisplaySetInstanceUID} img`)?.click();
    }
    document.body.classList.remove('mpr-layout-loading');
  }, 500);
  return true;
}

function activateCommandOnIframe(command) {
  if (!command) {
    return;
  }

  try {
    //Message strutturato: comando OHIF con opzioni (es. subgrid r x c).
    if (typeof command === 'object') {
      if (command.type === 'mdv-priors-command') {
        runCommandOnPriors(command.commandName, command.commandOptions || {});
      } else if (command.type === 'mdv-priors-toolbar') {
        runToolbarItemOnPriors(command.itemId);
      }
      return;
    }

    if (typeof command !== 'string') {
      return;
    }

    //Layout griglia: 'layout-common-2x3' (Standard) e 'custom2x3' (Personalizzato).
    const gridLayout = command.match(/^(?:layout-common-|custom)(\d+)x(\d+)$/);
    if (gridLayout) {
      applyGridLayoutOnPriors(Number(gridLayout[1]), Number(gridLayout[2]));
      return;
    }

    const itemId = Object.prototype.hasOwnProperty.call(PRIORS_TOOLBAR_ITEM_BY_MESSAGE, command)
      ? PRIORS_TOOLBAR_ITEM_BY_MESSAGE[command]
      : command;
    if (runToolbarItemOnPriors(itemId)) {
      return;
    }

    //Non e' un bottone di toolbar: ultimo tentativo come preset layout avanzato.
    if (applyHangingProtocolOnPriors(command)) {
      return;
    }

    console.warn('Priors: comando non gestito ->', command);
  } catch (err) {
    console.error('Could not pass the command to the frame: ', err);
  }
}

//MAIN - Ricevo messages dall'iframe
function listenerEvent(event) {
  if (event.origin !== window.location.origin) {
    console.warn('Message ricevuto da un origine non sicura:', event.origin);
    return;
  }

  if (event.data?.type === 'mdv-iframe-ready') {
    const priorsIframe = document.getElementById('priors-iframe');
    if (priorsIframe && event.source === priorsIframe.contentWindow) {
      priorsIframe.dataset.loaded = 'true';
      markPriorsIframeReady();
    }
    return;
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  const fix3DOnClosedIframe = async () => {
    document.body.classList.add('loading-spinner-into-grid');
    document.querySelector('[data-cy="LayoutMPR"]').click();
    await wait(0); // Attendi per evitare l'annidamento dei timeout

    document.querySelector('[data-cy="LayoutMPR"]').click();
    setTimeout(() => {
      document.body.classList.remove('loading-spinner-into-grid');
    }, 0);
  };

  const closePriorsIframe = () => {
    clearPriorsLoadingState({ removePreloader: true });
    stopPriorsAlignment();

    const mainStudy = document.querySelector('.mdv-main-area');
    if (mainStudy) {
      mainStudy.style.maxWidth = 'none';
    }
    document.body.classList.remove('priors-injected-iframe');
    document.body.classList.remove('secondo-mpr-attivo');
    document.getElementById('priors-iframe')?.remove();
    const mainArea = document.querySelector('.mdv-main-area');
    if (mainArea) {
      mainArea.style.width = '100%';
    }

    for (const a of document.querySelectorAll('#priors-same-window')) {
      a.classList.remove('active');
    }
    //Fix mpr 3D - quando si passa dallo schermo diviso al pieno schermo e ho un 3d Attivo, questo viene tagliato. Metto il preset mpr e poi
    //riattivo il preset 3d precedente
    const listaPreset3D = ['fourUp', 'main3D', 'only3D', 'primary3D'];

    listaPreset3D.forEach(preset3D => {
      if (document.body.classList.contains(preset3D)) {
        saveSeriesToClickAgain();
        fix3DOnClosedIframe();
      }
    });
  };

  const messageReceived = event.data;
  console.log(messageReceived);
  switch (messageReceived) {
    case 'close-priors-iframe':
      closePriorsIframe();
      break;
    case 'secondo-mpr':
      document.querySelector('[data-cy="LayoutMPRPriors"]').style.pointerEvents = 'all';
      document.querySelector('[data-cy="LayoutMPRPriors"]').style.opacity = '1';
      break;
    case 'disable-secondo-mpr':
      document.querySelector('[data-cy="LayoutMPRPriors"]').style.pointerEvents = 'none';
      document.querySelector('[data-cy="LayoutMPRPriors"]').style.opacity = '0.5';
      break;
    case 'uscita-da-secondo-mpr':
      document.body.classList.remove('secondo-mpr-attivo');
      break;
  }
}

function ascoltoMessaggiIframeFiglio() {
  // Rimuove l'event listener precedente, se esiste
  window.removeEventListener('message', listenerEvent);

  // Aggiungi l'event listener
  window.addEventListener('message', listenerEvent);
}

export default openPriors;
