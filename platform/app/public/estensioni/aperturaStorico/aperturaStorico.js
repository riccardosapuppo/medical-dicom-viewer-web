/* eslint-disable default-case */

const STORICO_IFRAME_READY_TIMEOUT_MS = 25000;
let storicoReadyTimeoutId = null;
let storicoPendingPreloader = null;

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

function parseStoricoLink(linkValue) {
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

function resolveStoricoContext(e, studyInstanceUID, options = {}) {
  const normalizedOptions =
    typeof options === 'string' ? { aetitle: options } : options || {};
  const target = e?.currentTarget;
  const carrier =
    target?.closest?.(
      '[data-study-instance-uid],[data-study-instance-uids],[data-studyuid],[data-study],[data-aetitle],[data-partizione],[data-url]'
    ) || null;

  const parsedLink = parseStoricoLink(
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

function clearStoricoLoadingState({ removePreloader = false } = {}) {
  if (storicoReadyTimeoutId) {
    clearTimeout(storicoReadyTimeoutId);
    storicoReadyTimeoutId = null;
  }
  if (removePreloader && storicoPendingPreloader?.isConnected) {
    storicoPendingPreloader.remove();
  }
  storicoPendingPreloader = null;
}

function showStoricoLoadingError(
  message = 'Impossibile caricare lo studio storico. Verifica token, aetitle e disponibilita dati.'
) {
  if (!storicoPendingPreloader || !storicoPendingPreloader.isConnected) {
    clearStoricoLoadingState();
    return;
  }

  if (storicoReadyTimeoutId) {
    clearTimeout(storicoReadyTimeoutId);
    storicoReadyTimeoutId = null;
  }

  const preloader = storicoPendingPreloader;
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
  title.textContent = 'Errore caricamento storico';
  title.style.fontSize = '16px';
  title.style.fontWeight = '600';

  const text = document.createElement('div');
  text.textContent = message;
  text.style.fontSize = '13px';
  text.style.lineHeight = '1.4';
  text.style.opacity = '0.9';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Chiudi';
  closeButton.style.background = '#8a1818';
  closeButton.style.border = '1px solid #d0d0d0';
  closeButton.style.color = '#fff';
  closeButton.style.padding = '6px 12px';
  closeButton.style.borderRadius = '4px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => {
    window.postMessage('chiudi-iframe-storico', '*');
  });

  wrapper.appendChild(title);
  wrapper.appendChild(text);
  wrapper.appendChild(closeButton);
  preloader.appendChild(wrapper);
}

// ---------------------------------------------------------------------------
// ALLINEAMENTO VERTICALE DELLO STORICO AFFIANCATO
//
// L'iframe dello storico e' un float inserito DOPO la barra dei tab dello
// studio principale, quindi parte gia' piu' in basso di tutta l'altezza della
// barra; al suo interno ha a sua volta la propria etichetta paziente, che
// finiva percio' ben sotto quella dello studio principale e faceva scendere
// anche la griglia dello storico.
// Invece di inseguire numeri fissi (l'altezza dipende da header, banner
// estensione, zoom del browser) misuriamo a runtime: l'iframe viene tirato su
// con un margine negativo finche' la sua etichetta e' alla stessa altezza di
// quella principale, e la sua area viewport viene chiusa esattamente sul fondo
// di quella dello studio principale. Vale per qualsiasi configurazione.
// ---------------------------------------------------------------------------

let storicoAllineamentoIntervalId = null;
let storicoAllineamentoResizeId = null;

function stopAllineamentoStorico() {
  if (storicoAllineamentoIntervalId) {
    clearInterval(storicoAllineamentoIntervalId);
    storicoAllineamentoIntervalId = null;
  }
}

/**
 * Allinea l'iframe dello storico allo studio principale.
 * @returns {boolean} true se le misure erano disponibili ed e' stato applicato.
 */
function allineaStoricoAlloStudioPrincipale() {
  const iframe = document.getElementById('iframe-storico');
  const areaPrincipale = document.querySelector('.mdv-main-area');
  if (!iframe || !areaPrincipale) {
    return false;
  }

  let documentoStorico = null;
  try {
    documentoStorico = iframe.contentDocument;
  } catch (_) {
    return false; //iframe non ancora accessibile
  }
  const areaStorico = documentoStorico?.querySelector('.mdv-main-area');
  if (!areaStorico) {
    return false;
  }

  //Riferimento per l'allineamento in alto: l'etichetta paziente se c'e' da
  //entrambe le parti (e' quella che l'utente vede), altrimenti l'area viewport.
  const barraTabPrincipale = document.getElementById('mdv-tab-container');
  const barraTabStorico = documentoStorico.getElementById('mdv-tab-container');
  const usoBarraTab = Boolean(barraTabPrincipale && barraTabStorico);
  const riferimentoPrincipale = usoBarraTab ? barraTabPrincipale : areaPrincipale;
  const riferimentoStorico = usoBarraTab ? barraTabStorico : areaStorico;

  //1) Etichetta dello storico alla stessa altezza di quella principale.
  iframe.style.marginTop = '0px';
  const scarto = Math.round(
    iframe.getBoundingClientRect().top +
      riferimentoStorico.getBoundingClientRect().top -
      riferimentoPrincipale.getBoundingClientRect().top
  );
  if (scarto > 0) {
    iframe.style.marginTop = `-${scarto}px`;
  }

  //2) Cornice e griglia dello storico chiuse sul fondo di quella principale.
  //   Le regole CSS .storico-same-tab sono !important, quindi lo sono anche
  //   queste altezze calcolate.
  const fondoPrincipale = areaPrincipale.getBoundingClientRect().bottom;
  const cimaIframe = iframe.getBoundingClientRect().top;

  const corpoStorico = documentoStorico.body;
  const altezzaCorpo = Math.round(
    fondoPrincipale - (cimaIframe + corpoStorico.getBoundingClientRect().top)
  );
  if (altezzaCorpo > 0) {
    corpoStorico.style.setProperty('height', `${altezzaCorpo}px`, 'important');
  }

  const altezzaArea = Math.round(
    fondoPrincipale - (cimaIframe + areaStorico.getBoundingClientRect().top)
  );
  if (altezzaArea > 0) {
    areaStorico.style.setProperty('height', `${altezzaArea}px`, 'important');
  }

  return true;
}

/**
 * Avvia l'allineamento: la barra dei tab dentro l'iframe viene creata in modo
 * asincrono, quindi riproviamo finche' le misure ci sono (max ~10s).
 */
function avviaAllineamentoStorico() {
  stopAllineamentoStorico();

  let tentativi = 0;
  let concluso = false;
  const prova = () => {
    tentativi += 1;
    const fatto = allineaStoricoAlloStudioPrincipale();
    if (fatto || tentativi > 40) {
      concluso = true;
      stopAllineamentoStorico();
      if (fatto) {
        //Ritocco finale a layout assestato (pannelli laterali, hanging protocol).
        setTimeout(allineaStoricoAlloStudioPrincipale, 500);
      }
    }
  };

  prova();
  if (!concluso) {
    storicoAllineamentoIntervalId = setInterval(prova, 250);
  }
}

//Il ridimensionamento della finestra cambia le altezze di header e barra tab.
window.addEventListener('resize', () => {
  if (!document.getElementById('iframe-storico')) {
    return;
  }
  clearTimeout(storicoAllineamentoResizeId);
  storicoAllineamentoResizeId = setTimeout(allineaStoricoAlloStudioPrincipale, 150);
});

function markStoricoIframeReady() {
  if (storicoPendingPreloader?.isConnected) {
    storicoPendingPreloader.remove();
  }
  clearStoricoLoadingState();
  //Il preloader occupava la meta' destra: solo ora l'iframe e' al suo posto
  //e ha senso misurarlo per allinearlo allo studio principale.
  avviaAllineamentoStorico();
}

function startStoricoLoadingWatch(preloader) {
  clearStoricoLoadingState();
  storicoPendingPreloader = preloader;

  storicoReadyTimeoutId = setTimeout(() => {
    showStoricoLoadingError();
  }, STORICO_IFRAME_READY_TIMEOUT_MS);
}

const openStorico = (e, modalita, studyInstanceUID, options = {}) => {
  e.stopPropagation();
  if (typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const context = resolveStoricoContext(e, studyInstanceUID, options);
  if (!context.studyInstanceUID) {
    console.warn('Impossibile aprire storico: StudyInstanceUID mancante.');
    return;
  }

  const currentUrl = window.location.href;
  const url = new URL(currentUrl);
  const params = new URLSearchParams(url.search);

  params.set('StudyInstanceUIDs', context.studyInstanceUID);
  params.delete('storico');
  params.set('storicoOpenTs', `${Date.now()}`);

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
    const iframeStorico = document.getElementById('iframe-storico');
    const isAlreadyActive = e.currentTarget?.classList?.contains('active');
    if (iframeStorico && isAlreadyActive) {
      window.postMessage('chiudi-iframe-storico', '*');
      return;
    }

    //Coloro l'icona cliccata di quello studio specifico
    for (const a of document.querySelectorAll('#storico-same-window')) {
      a.classList.remove('active');
    }
    e.currentTarget.classList.add('active');
    split2Studies(newUrl, context.studyInstanceUID);
  } else if (modalita === 'nuovaScheda') {
    window.open(newUrl, '_blank');
  }
};

const createPreloader = (message = 'Caricamento storico in corso...') => {
  const preloader = document.createElement('div');
  preloader.className = 'preloader';
  preloader.setAttribute('data-storico-preloader', 'true');

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

const salvaSerieDaRicliccare = () => {
  const { viewportGridService } = window.servicesManager.services;
  const { activeViewportId, viewports } = viewportGridService.getState();
  const activeViewport = viewports.get(activeViewportId);
  const activeDisplaySetInstanceUID = activeViewport.displaySetInstanceUIDs[0];
  window.instanceUIDMPRDaCliccare = activeDisplaySetInstanceUID;
};

const fixlayoutViewportsMPR = () => {
  //Disattivo e riattivo mpr salvando la serie attualmente attiva
  salvaSerieDaRicliccare();
  document.querySelector('[data-cy="LayoutMPR"]').click(); //Disattivo MPR
  document.body.classList.add('loading-spinner-into-grid'); //Non mostro il cambio vista griglia ma metto uno spinner

  setTimeout(() => {
    document.querySelector('[data-cy="LayoutMPR"]').click(); //Riattivo MPR
  }, 0);
  setTimeout(() => {
    document.body.classList.remove('loading-spinner-into-grid');

    // window.instanceUIDMPRDaCliccare = null;

    //A fine fix ritorno sempre e comunque nella tab dello storico da cui sono partito
    document.querySelector('.storicosulcloud').click();
  }, 500);
};

function split2Studies(urlToOpen) {
  clearStoricoLoadingState({ removePreloader: true });
  stopAllineamentoStorico();
  if (document.getElementById('iframe-storico')) {
    document.getElementById('iframe-storico').remove(); //Sovrascrivo sempre
  }
  //Se è attivo l'mpr lo disabilito e lo riabilito quando lo schermo è già diviso in quanto il ridimensionamento
  //della finestra lo farebbe sfasare random, abilitandolo invece a schermo già diviso non da problemi
  if (document.body.classList.contains('hp-mpr-active')) {
    fixlayoutViewportsMPR();
  }
  document.body.classList.add('storico-injected-iframe');
  document.body.classList.remove('secondo-mpr-attivo');
  const mainArea = document.querySelector('.mdv-main-area');
  mainArea.style.width = '50%';
  mainArea.style.float = 'left'; // Imposta il float per affiancarlo

  // Crea un nuovo iframe
  const iframe = document.createElement('iframe');
  const iframeUrl = new URL(urlToOpen, window.location.origin);
  iframeUrl.searchParams.set('storico', 'same-tab');
  iframe.src = iframeUrl.toString();
  iframe.id = 'iframe-storico';
  iframe.dataset.loaded = 'false';

  // Applica lo stile all'iframe
  iframe.style.width = '50%'; // Imposta l'iframe al 50% della larghezza
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
  startStoricoLoadingWatch(preloader);
  // mainArea.parentNode.insertBefore(iframe, mainArea.nextSibling);
  // Aggiungi un listener per aspettare il caricamento dell'iframe
  iframe.onload = function () {
    try {
      const iframeDocument = iframe.contentWindow.document;
      if (window.location.href.includes('storico=same-tab')) {
        iframeDocument.body.classList.add('storico-same-tab');
      }
    } catch (err) {
      console.warn('Impossibile applicare classe storico-same-tab su iframe:', err);
    }
  };
  //A questo punto avvio un listener per ascoltare eventuali messaggi dall'iframe listener
  ascoltoMessaggiIframeFiglio();
}

//Se sono già uno storico mi differenzio
if (window.location.href.includes('storico=same-tab')) {
  document.body.classList.add('storico-same-tab');
  //Aggiungo il pulsante chiudi per rimuovere eventualmente l'iframe
  document.body.insertAdjacentHTML(
    'beforebegin',
    `
    <button class="chiudi-iframe">x</button>
    `
  );
  const chiudiIframeBtn = document.querySelector('.chiudi-iframe');
  chiudiIframeBtn.addEventListener('click', () => {
    window.parent.postMessage('chiudi-iframe-storico', '*');
  });

  window.sonoUnoStorico = true;

  //Attivo listener per ricevere messaggi dal padre
  window.addEventListener(
    'message',
    function (event) {
      if (event.origin !== window.location.origin) {
        return;
      }
      const messaggioRicevuto = event.data;
      activateCommandOnIframe(messaggioRicevuto);
    },
    false
  );
}

// ---------------------------------------------------------------------------
// PONTE COMANDI: studio principale -> iframe dello storico
//
// Nella modalita' "storico affiancato" la toolbar dell'iframe e' nascosta via
// CSS e i comandi arrivano dallo studio principale via postMessage. Prima si
// simulavano i click sui bottoni (data-cy + setTimeout annidati): approccio
// fragile, che falliva per tutto cio' che vive dentro un menu a tendina (Reset
// e gli altri "MoreTools") e per i tool senza un case dedicato (Scala, Cursori
// di riferimento, Collega immagini, Zoom 1:1, ...).
// Ora il messaggio viene risolto sull'id del bottone di toolbar e passato a
// toolbarService.recordInteraction: e' la stessa identica strada del click
// reale (esegue i comandi con le loro opzioni e aggiorna lo stato del bottone),
// quindi ogni strumento della toolbar risulta sincronizzato senza dover
// scrivere un case dedicato qui dentro.
// ---------------------------------------------------------------------------

//Messaggi "storici" (nomi comando) -> id del bottone di toolbar corrispondente.
//Tutti gli altri messaggi sono gia' id di bottone (es. 'ScaleOverlay', 'Pan').
const STORICO_TOOLBAR_ITEM_BY_MESSAGE = {
  cine: 'Cine',
  resetViewport: 'Reset',
  zoomOneToOne: 'ZoomOneToOne',
  invertViewport: 'invert',
  flipViewportHorizontal: 'flipHorizontal',
  flipViewportVertical: 'flipVertical',
  'rotateViewport-90': 'rotate-right',
  'rotateViewport--90': 'rotate-left',
  mprDirectClick: 'LayoutMPR',
  'attiva-mpr': 'LayoutMPR',
};

//Preset avanzati 3D/MPR: il selettore layout li segna anche come classe sul body.
const STORICO_PRESET_BODY_CLASSES = ['fourUp', 'main3D', 'primaryAxial', 'only3D', 'primary3D'];

function getStoricoServices() {
  return window.servicesManager?.services || null;
}

/**
 * Esegue nell'iframe la stessa interazione di un click sul bottone di toolbar:
 * recordInteraction lancia i comandi del bottone con le sue opzioni (incluso
 * itemId, indispensabile ai toggle tipo Scala / Linee di riferimento) e
 * aggiorna lo stato della toolbar.
 * @returns {boolean} true se il bottone esiste (comando gestito).
 */
function runToolbarItemOnStorico(itemId) {
  const services = getStoricoServices();
  const toolbarService = services?.toolbarService;
  const buttonProps = toolbarService?.getButtonProps?.(itemId);
  if (!buttonProps) {
    return false;
  }

  //Se nello storico il bottone e' disabilitato (es. Crosshairs fuori dall'MPR)
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

/** Esegue un comando OHIF puro (messaggi strutturati dal padre). */
function runCommandOnStorico(commandName, commandOptions = {}) {
  if (!commandName || !window.commandsManager?.run) {
    return false;
  }
  window.commandsManager.run({ commandName, commandOptions });
  return true;
}

/** Layout griglia scelto dal padre ('layout-common-2x3', 'custom2x3'). */
function applyGridLayoutOnStorico(numRows, numCols) {
  if (!numRows || !numCols) {
    return false;
  }
  //Come il selettore layout: il cambio griglia annulla l'MPR da hanging protocol.
  document.body.classList.remove('hp-mpr-active');
  window.mprIsActive = false;
  return runCommandOnStorico('setViewportGridLayout', { numRows, numCols });
}

/** Preset avanzato = id di hanging protocol ('mpr', 'fourUp', 'main3D', ...). */
function applyHangingProtocolOnStorico(protocolId) {
  const services = getStoricoServices();
  const hangingProtocolService = services?.hangingProtocolService;
  if (!hangingProtocolService?.protocols?.get?.(protocolId)) {
    return false;
  }

  STORICO_PRESET_BODY_CLASSES.forEach(preset => document.body.classList.remove(preset));
  if (STORICO_PRESET_BODY_CLASSES.includes(protocolId)) {
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
  document.body.classList.add('caricamento-layout-mpr');
  window.mdvProtocolToApply = protocolId;
  hangingProtocolService.setProtocol(protocolId);

  if (activeDisplaySetInstanceUID) {
    window.instanceUIDMPRDaCliccare = activeDisplaySetInstanceUID;
  }
  setTimeout(() => {
    if (activeDisplaySetInstanceUID) {
      document.querySelector(`#thumbnail-${activeDisplaySetInstanceUID} img`)?.click();
    }
    document.body.classList.remove('caricamento-layout-mpr');
  }, 500);
  return true;
}

function activateCommandOnIframe(command) {
  if (!command) {
    return;
  }

  try {
    //Messaggio strutturato: comando OHIF con opzioni (es. sottogriglia r x c).
    if (typeof command === 'object') {
      if (command.type === 'mdv-storico-command') {
        runCommandOnStorico(command.commandName, command.commandOptions || {});
      } else if (command.type === 'mdv-storico-toolbar') {
        runToolbarItemOnStorico(command.itemId);
      }
      return;
    }

    if (typeof command !== 'string') {
      return;
    }

    //Layout griglia: 'layout-common-2x3' (Standard) e 'custom2x3' (Personalizzato).
    const gridLayout = command.match(/^(?:layout-common-|custom)(\d+)x(\d+)$/);
    if (gridLayout) {
      applyGridLayoutOnStorico(Number(gridLayout[1]), Number(gridLayout[2]));
      return;
    }

    const itemId = Object.prototype.hasOwnProperty.call(STORICO_TOOLBAR_ITEM_BY_MESSAGE, command)
      ? STORICO_TOOLBAR_ITEM_BY_MESSAGE[command]
      : command;
    if (runToolbarItemOnStorico(itemId)) {
      return;
    }

    //Non e' un bottone di toolbar: ultimo tentativo come preset layout avanzato.
    if (applyHangingProtocolOnStorico(command)) {
      return;
    }

    console.warn('Storico: comando non gestito ->', command);
  } catch (err) {
    console.error('Errore passaggio comando ad iframe: ', err);
  }
}

//MAIN - Ricevo messaggi dall'iframe
function listenerEvent(event) {
  if (event.origin !== window.location.origin) {
    console.warn('Messaggio ricevuto da un origine non sicura:', event.origin);
    return;
  }

  if (event.data?.type === 'mdv-iframe-ready') {
    const iframeStorico = document.getElementById('iframe-storico');
    if (iframeStorico && event.source === iframeStorico.contentWindow) {
      iframeStorico.dataset.loaded = 'true';
      markStoricoIframeReady();
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

  const closeStoricoIframe = () => {
    clearStoricoLoadingState({ removePreloader: true });
    stopAllineamentoStorico();

    const studioPrincipale = document.querySelector('.mdv-main-area');
    if (studioPrincipale) {
      studioPrincipale.style.maxWidth = 'none';
    }
    document.body.classList.remove('storico-injected-iframe');
    document.body.classList.remove('secondo-mpr-attivo');
    document.getElementById('iframe-storico')?.remove();
    const mainArea = document.querySelector('.mdv-main-area');
    if (mainArea) {
      mainArea.style.width = '100%';
    }

    for (const a of document.querySelectorAll('#storico-same-window')) {
      a.classList.remove('active');
    }
    //Fix mpr 3D - quando si passa dallo schermo diviso al pieno schermo e ho un 3d Attivo, questo viene tagliato. Metto il preset mpr e poi
    //riattivo il preset 3d precedente
    const listaPreset3D = ['fourUp', 'main3D', 'only3D', 'primary3D'];

    listaPreset3D.forEach(preset3D => {
      if (document.body.classList.contains(preset3D)) {
        salvaSerieDaRicliccare();
        fix3DOnClosedIframe();
      }
    });
  };

  const messaggioRicevuto = event.data;
  console.log(messaggioRicevuto);
  switch (messaggioRicevuto) {
    case 'chiudi-iframe-storico':
      closeStoricoIframe();
      break;
    case 'secondo-mpr':
      document.querySelector('[data-cy="LayoutMPRStorico"]').style.pointerEvents = 'all';
      document.querySelector('[data-cy="LayoutMPRStorico"]').style.opacity = '1';
      break;
    case 'disable-secondo-mpr':
      document.querySelector('[data-cy="LayoutMPRStorico"]').style.pointerEvents = 'none';
      document.querySelector('[data-cy="LayoutMPRStorico"]').style.opacity = '0.5';
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

export default openStorico;
