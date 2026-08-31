// ========================
//   MODALE + IFRAME
// ========================

// ======================================================================
//   FUNZIONE PER INVIARE CSS ALL'IFRAME VIA POSTMESSAGE
// ======================================================================
if (window.self === window.top) {
  localStorage.removeItem("aetitle");
  localStorage.removeItem("urlOriginalePerWorklist");
}

const isStudyListEnabled = window?.config?.showStudyList !== false;

/**
 * I piani di sovrapposizione, in un posto solo.
 *
 * Erano numeri sparsi - 99999, 100000, 999999, 9999999 - scelti ciascuno per
 * vincere contro qualcosa, senza un ordine scritto da nessuna parte. Bastava
 * abbassarne uno per rompere un rapporto che nessuno sapeva esistesse: la
 * barra delle schede portata sotto il contenuto faceva sparire la scheda
 * selezionata dietro il proprio iframe, che comincia sei pixel piu in alto.
 *
 * I suggerimenti della barra strumenti si disegnano a 50: qualunque cosa
 * debba lasciarli leggere deve stare sotto quel numero.
 */
const PIANI = {
  nascosto: -1,
  contenuto: 1,
  barraSchede: 10,
  schedaPaziente: 11,
  modale: 100,
};


const iframeSpinnerById = new Map();
const iframeLoadTimeoutById = new Map();
const iframeLoadErrorById = new Map();
const IFRAME_READY_TIMEOUT_MS = 25000;

function showStudyLoadErrorNotification(message) {
  const uiNotificationService = window?.servicesManager?.services?.uiNotificationService;
  if (uiNotificationService?.show) {
    uiNotificationService.show({
      title: 'Errore caricamento studio',
      message,
      type: 'error',
    });
    return;
  }
  console.error(message);
}

function clearIframeLoadTimeout(iframeId) {
  const timeoutId = iframeLoadTimeoutById.get(iframeId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    iframeLoadTimeoutById.delete(iframeId);
  }
}

function startIframeReadyTimeout(iframeId, studyTitle = 'Studio') {
  if (!iframeId) {
    return;
  }
  clearIframeLoadTimeout(iframeId);
  const timeoutId = setTimeout(() => {
    markIframeFailed(
      iframeId,
      `Impossibile completare il caricamento di "${studyTitle}". Verifica disponibilita studio/token/aetitle.`
    );
  }, IFRAME_READY_TIMEOUT_MS);
  iframeLoadTimeoutById.set(iframeId, timeoutId);
}

function markIframeFailed(iframeId, message) {
  clearIframeLoadTimeout(iframeId);
  iframeLoadErrorById.set(iframeId, message);

  const iframe = document.getElementById(iframeId);
  if (iframe) {
    iframe.dataset.loaded = 'error';
  }

  const spinner = iframeSpinnerById.get(iframeId);
  if (spinner) {
    spinner.style.display = 'none';
  }

  const tab = document.querySelector(`.mdv-dynamic-tab[data-iframe-id="${iframeId}"]`);
  if (tab) {
    tab.style.border = '1px solid #38bdf8';
    tab.style.background = 'rgb(40 15 15)';
    tab.title = message;
  }

  if (pendingIframeId === iframeId || activeIframeId === iframeId) {
    showStudyLoadErrorNotification(message);
  }
}

function markIframeReady(iframe) {
  if (!iframe) return;
  iframe.dataset.loaded = 'true';
  clearIframeLoadTimeout(iframe.id);
  iframeLoadErrorById.delete(iframe.id);

  const spinner = iframeSpinnerById.get(iframe.id);
  if (spinner) {
    spinner.style.display = 'none';
  }
  const tab = document.querySelector(`.mdv-dynamic-tab[data-iframe-id="${iframe.id}"]`);
  if (tab && !tab.classList.contains('active-tab')) {
    tab.style.background = 'rgb(7 7 7)';
    tab.style.border = '1px solid transparent';
  }

  if (pendingIframeId === iframe.id) {
    showIframeForTab(iframe.id);
  } else if (activeIframeId === iframe.id) {
    iframe.style.opacity = '1';
    iframe.style.pointerEvents = 'auto';
    iframe.style.zIndex = String(PIANI.contenuto);
  }
}

let quickDateFilterIntervalId = null;
let patientTabInfoRefreshIntervalId = null;

function normalizeInfoText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  const lowered = normalized.toLowerCase();
  if (lowered === 'n/a' || lowered === 'na' || lowered === 'null' || lowered === 'undefined') {
    return '';
  }
  return normalized;
}

function getQueryParamCaseInsensitive(...keys) {
  if (!keys.length) {
    return '';
  }
  const params = new URLSearchParams(window.location.search);
  const entries = Array.from(params.entries());
  for (const key of keys) {
    const hit = entries.find(([paramName]) => paramName.toLowerCase() === key.toLowerCase());
    const value = normalizeInfoText(hit?.[1]);
    if (value) {
      return value;
    }
  }
  return '';
}

function getAccessionFromDom() {
  const nodesWithTitle = Array.from(document.querySelectorAll('[title]'));
  for (const node of nodesWithTitle) {
    const title = normalizeInfoText(node.getAttribute('title'));
    if (!title || !title.toLowerCase().includes('accession')) {
      continue;
    }
    const value = normalizeInfoText(node.textContent);
    if (!value) {
      continue;
    }
    if (value.toLowerCase() === title.toLowerCase()) {
      continue;
    }
    return value;
  }
  return '';
}

function getPatientNameForTab() {
  return (
    normalizeInfoText(window.mdvPatientInfo?.PatientName) ||
    getQueryParamCaseInsensitive('PatientName', 'patientName')
  );
}

function getAccessionForTab() {
  return (
    normalizeInfoText(window.mdvStudyInfo?.AccessionNumber) ||
    normalizeInfoText(window.mdvPatientInfo?.AccessionNumber) ||
    getQueryParamCaseInsensitive('AccessionNumber', 'accessionNumber', 'accession') ||
    getAccessionFromDom()
  );
}

function buildPatientTabDescription() {
  // "Studio" era un ripiego pigro: e' quello che si leggeva sulla linguetta
  // finche' i dati del paziente non arrivavano, e per uno studio che il nome
  // paziente non ce l'ha - LIDC-IDRI-0001 nell'archivio dimostrativo - restava
  // per sempre. Meglio l'identificativo del paziente, che c'e' sempre.
  const patientName =
    getPatientNameForTab() ||
    getQueryParamCaseInsensitive('PatientID', 'patientId', 'mrn') ||
    'Studio';
  const accession = getAccessionForTab();
  // Quando l accession non c e non si scrive "- N/A": una scheda che dichiara
  // di non sapere una cosa occupa spazio per non dire niente, e allunga
  // l etichetta fino a mandare a capo la crocetta di chiusura.
  return accession ? `${patientName} — ${accession}` : patientName;
}

function updatePatientTabDescription() {
  const titleNode = document.querySelector('#explorer-tab-btn .patient-title');
  if (!titleNode) {
    return false;
  }
  const accession = getAccessionForTab();
  titleNode.textContent = buildPatientTabDescription();
  return Boolean(accession);
}

function clearPatientTabInfoRefresh() {
  if (patientTabInfoRefreshIntervalId) {
    clearInterval(patientTabInfoRefreshIntervalId);
    patientTabInfoRefreshIntervalId = null;
  }
}

function startPatientTabInfoRefresh() {
  clearPatientTabInfoRefresh();
  let attempts = 0;
  patientTabInfoRefreshIntervalId = setInterval(() => {
    attempts += 1;
    const resolvedAccession = updatePatientTabDescription();
    if (resolvedAccession || attempts >= 30 || !document.getElementById('explorer-tab-btn')) {
      clearPatientTabInfoRefresh();
    }
  }, 350);
}

function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function injectQuickDateFilter() {
  if (document.getElementById('mdv-quick-date-filter')) return true;

  const startInput = document.querySelector('[data-cy="input-date-range-start"]');
  const endInput = document.querySelector('[data-cy="input-date-range-end"]');
  if (!startInput || !endInput) return false;

  const wrapper = document.createElement('div');
  wrapper.id = 'mdv-quick-date-filter';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '6px';
  wrapper.style.marginBottom = '6px';
  wrapper.style.paddingTop = '6px';
  wrapper.style.boxSizing = 'border-box';

  const label = document.createElement('span');
  label.textContent = 'Intervallo rapido';
  label.style.fontSize = '12px';
  label.style.color = '#ddd';

  const select = document.createElement('select');
  select.style.background = 'rgb(20 20 20)';
  select.style.color = '#fff';
  select.style.border = '1px solid rgb(55 55 55)';
  select.style.borderRadius = '4px';
  select.style.padding = '4px 6px';
  select.style.fontSize = '12px';
  select.addEventListener('mousedown', e => e.stopPropagation());
  select.addEventListener('click', e => e.stopPropagation());

  const options = [
    { value: '', label: 'Seleziona' },
    { value: 'today', label: 'Oggi' },
    { value: 'week', label: 'Ultima settimana' },
    { value: 'month', label: 'Ultimo mese' },
    { value: 'year', label: 'Ultimo anno' },
  ];
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    const end = new Date();
    const start = new Date(end);
    if (select.value === 'week') {
      start.setDate(start.getDate() - 7);
    } else if (select.value === 'month') {
      start.setMonth(start.getMonth() - 1);
    } else if (select.value === 'year') {
      start.setFullYear(start.getFullYear() - 1);
    }

    if (select.value === 'today' || select.value === 'week' || select.value === 'month' || select.value === 'year') {
      const startValue = start.toISOString().slice(0, 10);
      const endValue = end.toISOString().slice(0, 10);
      window.__mdvQuickDateUpdate = true;
      setInputValue(startInput, startValue);
      setInputValue(endInput, endValue);
      window.__mdvQuickDateUpdate = false;
      setTimeout(() => {
        startInput.blur();
        endInput.blur();
        select.blur();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.body?.click();
      }, 0);
    }
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);

  const labelWrapper = startInput.closest('label');
  if (labelWrapper && labelWrapper.parentElement) {
    wrapper.style.marginTop = '6px';
    labelWrapper.parentElement.insertBefore(wrapper, labelWrapper.nextSibling);
  } else {
    startInput.insertAdjacentElement('afterend', wrapper);
  }

  return true;
}

function startQuickDateFilterWatcher() {
  if (quickDateFilterIntervalId) return;
  quickDateFilterIntervalId = setInterval(() => {
    injectQuickDateFilter();
  }, 500);
}

if (window.self !== window.top) {
  // Pronto vuol dire "ha disegnato qualcosa", non "e' la lista studi".
  //
  // Cercava solo i segni della lista: le colonne Accession e PatientID, o la
  // tabella dei risultati. Una scheda che apre uno STUDIO pero' carica il
  // visualizzatore, dove quei tre non compaiono mai. Il segnale non partiva, e
  // dopo venticinque secondi scattava il timeout con "Errore caricamento
  // studio. Verifica disponibilita studio/token/aetitle" - che manda a cercare
  // un guasto dove non c'e'.
  const readyInterval = setInterval(() => {
    const listaPronta =
      document.querySelector('[title="Accession"]') ||
      document.querySelector('[title="PatientID"]') ||
      document.querySelector('[data-cy="study-list-results"]');
    const visualizzatorePronto =
      document.querySelector('.viewport-element') ||
      document.querySelector('[data-cy="viewport-grid"] canvas');
    if (listaPronta || visualizzatorePronto) {
      clearInterval(readyInterval);
      window.parent.postMessage({ type: 'mdv-iframe-ready' }, '*');
    }
  }, 200);

  startQuickDateFilterWatcher();
}

function injectCssIntoIframe(iframe) {
  const isEmptyIframe = iframe?.id === 'mdv-dynamic-iframe-empty';
  const css = `

   #mdv-tab-container{
      display: none !important;
    }
      .mdv-main-area{
      top: 33px;
      height: calc(-81px + 100vh)!important;
      }
      ${isEmptyIframe ? `
        .logo-container
        {top: 22px; !important;}

        .div-info-paziente{
        display:none
        }
        `
      : ''}
  `;

  // Aspettiamo che l'iframe sia caricato
  iframe.addEventListener("load", () => {
    try {
      console.log("invio css")
      iframe.contentWindow.postMessage(
        {
          type: "injectCss",
          css: css,
        },
        "*"
      );
    } catch (err) {
      console.warn("postMessage CSS failed", err);
    }
  });
}

// ======================================================================
//   PRELOAD DELL’IFRAME VUOTO (MOSTRATO DAL PULSANTE +)
// ======================================================================

function preloadEmptyIframe() {
  if (!isStudyListEnabled) {
    return;
  }
  const iframeId = "mdv-dynamic-iframe-empty";

  // Evita duplicati
  if (document.getElementById(iframeId)) return;

  const iframe = document.createElement("iframe");
  iframe.id = iframeId;

  // URL viewer
  const url = window.location.href
  const params = new URL(url).searchParams;
  const aetitle = params.get("aetitle");
  const urlOriginalePerWorklist = window.location.href
  localStorage.setItem("urlOriginalePerWorklist", urlOriginalePerWorklist);
  if (aetitle) {
    console.log('fisso aetitale')
    localStorage.setItem("aetitle", aetitle);
  }

  // La scheda nuova si apre sulla LISTA STUDI, non sul visualizzatore.
  //
  // Puntava a /viewer/, che nell'installazione ospite era la lista e qui e' la
  // rotta del visualizzatore: senza uno studio nell indirizzo caricava una
  // pagina nera, e il "+" sembrava rotto. La lista sta alla radice, dove la
  // mette routerBasename.
  iframe.src = window.location.origin + ((window.PUBLIC_URL || '/').replace(/\/*$/, '/'));
  iframe.dataset.loaded = 'true';

  iframe.style.position = 'absolute';
  iframe.style.top = '43px';
  iframe.style.left = '0';
  iframe.style.width = '100%';
  iframe.style.height = 'calc(100% - 43px)';
  iframe.style.border = 'none';

  // NASCOSTO MA ATTIVO (NO display:none!)
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = String(PIANI.nascosto);

  document.body.appendChild(iframe);

  injectCssIntoIframe(iframe);

  iframe.addEventListener('load', () => {
    // iframe explorer sempre visibile quando attivo
  });
}

// Chiamalo subito all’avvio
if (window.self === window.top) {
  if (isStudyListEnabled) {
    preloadEmptyIframe();
  }
}


function openRouteInModal(url) {
  const existing = document.getElementById('mdv-modal');
  if (existing) existing.remove();

  let studyId = null;
  try {
    studyId = new URL(url, window.location.origin).searchParams.get('StudyInstanceUIDs');
  } catch (_) {
    studyId = null;
  }
  // Lo studio gia aperto si mostra, non si riapre.
  //
  // Il controllo guardava solo le schede create da qui, e non quella del
  // paziente, che e la prima e non passa da questa funzione. Riaprendo dalla
  // lista lo studio che si stava gia guardando si otteneva una seconda scheda
  // dello stesso studio, indistinguibile dalla prima.
  const studioDellaScheda = window.mdvStudyInstanceUIDs;
  const patientTab = document.getElementById('explorer-tab-btn');
  if (studyId && studioDellaScheda && studyId === studioDellaScheda && patientTab) {
    patientTab.click();
    return;
  }

  const existingTab = studyId ? getExistingTabForStudy(studyId) : null;
  if (existingTab?.dataset?.iframeId) {
    showIframeForTab(existingTab.dataset.iframeId);
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'mdv-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.65)';
  modal.style.backdropFilter = 'blur(4px)';
  modal.style.zIndex = String(PIANI.modale);
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  const box = document.createElement('div');
  box.style.width = '95vw';
  box.style.height = '95vh';
  box.style.background = '#000';
  box.style.borderRadius = '8px';
  box.style.overflow = 'hidden';
  box.style.position = 'relative';
  box.style.boxShadow = '0 0 15px rgba(0,0,0,0.7)';

  const closeBtn = document.createElement('div');
  closeBtn.innerHTML = '✕';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '10px';
  closeBtn.style.right = '15px';
  closeBtn.style.color = '#fff';
  closeBtn.style.fontSize = '28px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.zIndex = '10';
  closeBtn.style.userSelect = 'none';
  closeBtn.addEventListener('click', () => modal.remove());

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  box.appendChild(closeBtn);
  box.appendChild(iframe);
  modal.appendChild(box);
  document.body.appendChild(modal);
}

let activeIframeId = null;
let pendingIframeId = null;
let loadingNotificationTimeoutId = null;
const openStudyTabsById = new Map();

function getExistingTabForStudy(studyId) {
  if (!studyId) {
    return null;
  }
  const existingTab = openStudyTabsById.get(studyId);
  if (!existingTab) {
    return null;
  }

  const iframeId = existingTab.dataset?.iframeId;
  const iframe = iframeId ? document.getElementById(iframeId) : null;
  const tabStillAttached = document.body.contains(existingTab);

  if (!tabStillAttached || !iframeId || !iframe) {
    openStudyTabsById.delete(studyId);
    notifyOpenTabsChange();
    return null;
  }

  return existingTab;
}

if (window.self === window.top) {
  window.mdvIsStudyOpenInTab = studyId => Boolean(getExistingTabForStudy(studyId));
}

function notifyOpenTabsChange() {
  window.postMessage({ type: 'mdv-open-tabs-change' }, '*');
  document.querySelectorAll('iframe').forEach(iframe => {
    try {
      iframe.contentWindow?.postMessage({ type: 'mdv-open-tabs-change' }, '*');
    } catch (_) {
      // ignore cross-frame failures
    }
  });
}

function showLoadingNotification() {
  if (loadingNotificationTimeoutId) {
    clearTimeout(loadingNotificationTimeoutId);
  }

  const uiNotificationService = window?.servicesManager?.services?.uiNotificationService;
  if (uiNotificationService?.show) {
    uiNotificationService.show({
      title: 'Studio',
      message: 'Studio in caricamento...',
      type: 'warning',
    });
    loadingNotificationTimeoutId = setTimeout(() => {
      loadingNotificationTimeoutId = null;
    }, 1500);
    return;
  }

  // Fallback minimal (no service available)
  console.warn('Studio in caricamento');
  loadingNotificationTimeoutId = setTimeout(() => {
    loadingNotificationTimeoutId = null;
  }, 1500);
}

function showFullscreenNotification(message) {
  const uiNotificationService = window?.servicesManager?.services?.uiNotificationService;
  if (uiNotificationService?.show) {
    uiNotificationService.show({
      title: 'Schermo intero',
      message,
      type: 'info',
    });
    return;
  }
  console.warn(message);
}

function isBrowserFullscreen() {
  if (typeof window.fullScreen === 'boolean') {
    return window.fullScreen;
  }
  const widthMatch = Math.abs(window.outerWidth - screen.width) <= 2;
  const heightMatch = Math.abs(window.outerHeight - screen.height) <= 2;
  if (widthMatch && heightMatch) {
    return true;
  }
  return window.innerHeight === screen.height && window.innerWidth === screen.width;
}

function requestExtensionExitFullscreen() {
  window.postMessage({ type: 'fromPage', data: 'Exit fullscreen' }, '*');
  if (window.top && window.top !== window) {
    window.top.postMessage({ type: 'fromPage', data: 'Exit fullscreen' }, '*');
  }
}

function requestExtensionToggleFullscreen() {
  console.log('toggle fullscreen: postMessage to extension');
  window.postMessage({ type: 'fromPage', data: 'Toggle fullscreen' }, '*');
  if (window.top && window.top !== window) {
    window.top.postMessage({ type: 'fromPage', data: 'Toggle fullscreen' }, '*');
  }
}

// ========================
//  INIETTA TABS
// ========================

let tabsInitIntervalId = null;
let tabsInitObserver = null;
let tabsInitTimeoutId = null;
let tabsInitInProgress = false;
let mainAreaHeightSyncInitialized = false;
let mainAreaHeightRafId = null;
let mainAreaHeightResizeObserver = null;
let mainAreaHeightMutationObserver = null;
let visualViewportResizeHandler = null;

function getCurrentViewportHeight() {
  return window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
}

function applyMainAreaViewportHeight() {
  const mainArea = document.querySelector('.mdv-main-area');
  if (!mainArea) {
    return;
  }

  const { top } = mainArea.getBoundingClientRect();
  const viewportHeight = getCurrentViewportHeight();
  const availableHeight = Math.max(0, Math.floor(viewportHeight - Math.max(0, top)));

  if (!availableHeight) {
    return;
  }

  mainArea.style.height = `${availableHeight}px`;
  mainArea.style.maxHeight = `${availableHeight}px`;
}

function scheduleMainAreaHeightSync() {
  if (window.self !== window.top) {
    return;
  }

  if (mainAreaHeightRafId) {
    cancelAnimationFrame(mainAreaHeightRafId);
  }

  mainAreaHeightRafId = requestAnimationFrame(() => {
    mainAreaHeightRafId = null;
    applyMainAreaViewportHeight();
  });
}

function startMainAreaHeightSync() {
  if (window.self !== window.top) {
    return;
  }

  if (!mainAreaHeightSyncInitialized) {
    mainAreaHeightSyncInitialized = true;

    const observeLayoutTarget = selector => {
      const element = document.querySelector(selector);
      if (element && mainAreaHeightResizeObserver) {
        mainAreaHeightResizeObserver.observe(element);
      }
    };

    window.addEventListener('resize', scheduleMainAreaHeightSync);
    window.addEventListener('panelOpen', scheduleMainAreaHeightSync);

    if (window.visualViewport?.addEventListener) {
      visualViewportResizeHandler = () => scheduleMainAreaHeightSync();
      window.visualViewport.addEventListener('resize', visualViewportResizeHandler);
    }

    mainAreaHeightResizeObserver = new ResizeObserver(() => {
      scheduleMainAreaHeightSync();
    });
    observeLayoutTarget('.mdv-bar');
    observeLayoutTarget('#mdv-tab-container');
    observeLayoutTarget('.toolbar-child-flex');
    observeLayoutTarget('.div-info-paziente');

    mainAreaHeightMutationObserver = new MutationObserver(() => {
      observeLayoutTarget('.mdv-bar');
      observeLayoutTarget('#mdv-tab-container');
      scheduleMainAreaHeightSync();
    });
    mainAreaHeightMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  scheduleMainAreaHeightSync();
}

function stopTabsInitWatcher() {
  if (tabsInitIntervalId) {
    clearInterval(tabsInitIntervalId);
    tabsInitIntervalId = null;
  }
  if (tabsInitObserver) {
    tabsInitObserver.disconnect();
    tabsInitObserver = null;
  }
  if (tabsInitTimeoutId) {
    clearTimeout(tabsInitTimeoutId);
    tabsInitTimeoutId = null;
  }
  tabsInitInProgress = false;
}

function tryInitTabs() {
  // Dentro un iframe la barra non si costruisce affatto.
  //
  // Prima veniva costruita e poi nascosta con un display:none iniettato
  // dall'esterno. Se l'iniezione arrivava tardi - o non arrivava - ogni scheda
  // aperta mostrava la propria barra con il proprio "+", e ci si ritrovava con
  // un piu' per ogni studio aperto e le crocette accavallate in alto.
  if (window.self !== window.top) {
    stopTabsInitWatcher();
    return;
  }

  if (document.getElementById('mdv-tab-container')) {
    stopTabsInitWatcher();
    return;
  }

  const targetForInit =
    document.querySelector('[title="Accession"]') ||
    document.querySelector('[title="PatientID"]') ||
    document.querySelector('[data-cy="study-list-results"]') ||
    document.querySelector('[data-cy="viewport-grid"]');
  const layoutPanel = document.getElementById('viewerLayoutResizableViewportGridPanel');
  const mainArea = document.querySelector('.mdv-main-area');

  if (targetForInit && layoutPanel && mainArea) {
    injectTabs(layoutPanel);
    stopTabsInitWatcher();
  }
}

function startTabsInitWatcher() {
  if (tabsInitInProgress) return;
  tabsInitInProgress = true;

  tryInitTabs();

  tabsInitIntervalId = setInterval(tryInitTabs, 250);
  tabsInitObserver = new MutationObserver(tryInitTabs);
  tabsInitObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

  tabsInitTimeoutId = setTimeout(stopTabsInitWatcher, 30000);
}


// ========================
//   CREA CONTAINER + TABS
// ========================


function injectTabs(target) {
  console.log('tabs');

  if (document.getElementById('mdv-tab-container')) return;


  const tabDesc = buildPatientTabDescription();

  // ============ CONTAINER FLEX ============

  const container = document.createElement('div');
  container.id = 'mdv-tab-container';

  container.style.display = 'flex';
  container.style.flexDirection = 'row';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.marginTop = '1px';
  container.style.marginBottom = '2px';

  const layoutPanel = document.getElementById('viewerLayoutResizableViewportGridPanel');

  // ============ TAB PAZIENTE (STATICO) ============

  const patientTab = document.createElement('div');
  patientTab.id = 'explorer-tab-btn';
  patientTab.innerHTML = `
  <span class="patient-title">${tabDesc}</span>
  <span id="close-patient-tab" style="
    margin-left:8px;
    cursor:pointer;
    color:#bbb;
    font-size:12px;
    display:none;   /* inizialmente nascosto */
  ">✕</span>
`;

  patientTab.style.cursor = 'default';
  patientTab.style.padding = '5px 12px';
  patientTab.style.background = 'rgb(7 7 7)';
  patientTab.style.color = '#fff';
  patientTab.style.fontSize = '13px';
  patientTab.style.borderRadius = '4px';
  patientTab.style.border = '1px solid transparent';
  patientTab.style.userSelect = 'none';
  patientTab.style.whiteSpace = 'nowrap';

  patientTab.classList.add('active-tab');
  patientTab.style.background = 'rgb(22 22 22)';
  patientTab.style.border = '1px solid #38bdf8';

  // ============ TAB "+" (APRE MODALE) ============

  const plusTab = document.createElement('div');
  plusTab.id = 'plus-tab-btn';
  plusTab.innerText = '+';

  plusTab.style.cursor = 'pointer';
  plusTab.style.padding = '0px 9px';
  // plusTab.style.background = 'rgb(6 6 6)';
  plusTab.style.color = '#fff';
  plusTab.style.fontSize = '20px';
  plusTab.style.fontWeight = 'bold';
  plusTab.style.borderRadius = '4px';
  plusTab.style.userSelect = 'none';
  plusTab.style.zIndex = String(PIANI.barraSchede);
  plusTab.style.whiteSpace = 'nowrap';

  plusTab.addEventListener('mouseenter', () => {
    plusTab.style.background = 'rgb(35 35 35)';
  });
  plusTab.addEventListener('mouseleave', () => {
    plusTab.style.background = 'rgb(6 6 6)';
  });

  plusTab.addEventListener('click', () => {
    if (!isStudyListEnabled) {
      return;
    }
    const emptyIframe = document.getElementById("mdv-dynamic-iframe-empty");
    if (!emptyIframe) return;

    // Mostra l’iframe precaricato

    if (window.top && window.top !== window) {
      window.top.postMessage({ type: 'mdv-hide-extension-banner' }, '*');
    } else {
      window.postMessage({ type: 'mdv-hide-extension-banner' }, '*');
    }

    // Attiva una tab "vuota"
    showIframeForTab("mdv-dynamic-iframe-empty");
  });


  // MONTA I TABS
  container.appendChild(patientTab);
  container.appendChild(plusTab);

  if (!isStudyListEnabled) {
    plusTab.style.display = 'none';
    plusTab.style.pointerEvents = 'none';
  }

  // INSERISCI container sopra il pannello
  // target.insertAdjacentElement('afterbegin', container);
  //document.body.insertAdjacentElement('beforebegin', container);
  document.querySelector(".mdv-main-area").insertAdjacentElement('beforebegin', container);
  updatePatientTabDescription();
  startPatientTabInfoRefresh();

  if (layoutPanel) {
    const updateContainerLeft = () => {
      const { left: layoutLeft } = layoutPanel.getBoundingClientRect();
      const logoContainer = document.querySelector('.logo-container');
      const logoRect = logoContainer?.getBoundingClientRect();
      const logoRight = logoRect?.right || 0;
      const safeLeft = Math.max(layoutLeft, logoRight + 12);
      container.style.marginLeft = `${Math.max(0, Math.floor(safeLeft))}px`;

      const viewportWidth =
        window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
      if (viewportWidth > 0) {
        //Con lo storico affiancato la barra dei tab deve fermarsi al bordo
        //dell'iframe: lo storico e' allineato in alto e coprirebbe i tab che
        //sconfinano nella sua meta'.
        const iframeStorico = document.getElementById('iframe-storico');
        const bordoStorico = iframeStorico ? iframeStorico.getBoundingClientRect().left : 0;
        const limiteDestro = bordoStorico > safeLeft ? bordoStorico : viewportWidth;
        const maxWidth = Math.max(220, Math.floor(limiteDestro - safeLeft - 12));
        container.style.maxWidth = `${maxWidth}px`;
      }
    };
    updateContainerLeft();
    window.addEventListener('resize', updateContainerLeft);
    window.addEventListener('panelOpen', updateContainerLeft);

    const layoutResizeObserver = new ResizeObserver(updateContainerLeft);
    layoutResizeObserver.observe(layoutPanel);

    const layoutMutationObserver = new MutationObserver(updateContainerLeft);
    layoutMutationObserver.observe(layoutPanel, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const logoContainer = document.querySelector('.logo-container');
    if (logoContainer) {
      const logoResizeObserver = new ResizeObserver(updateContainerLeft);
      logoResizeObserver.observe(logoContainer);

      const logoMutationObserver = new MutationObserver(updateContainerLeft);
      logoMutationObserver.observe(logoContainer, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }
  }

  document.getElementById("close-patient-tab").addEventListener("click", (e) => {
    e.stopPropagation();

    const firstIframeTab = document.querySelector(".mdv-dynamic-tab");
    if (firstIframeTab) {
      showIframeForTab(firstIframeTab.dataset.iframeId);

      // Nascondi la tab principale dopo la "chiusura"
      const patientTab = document.getElementById('explorer-tab-btn');
      patientTab.style.opacity = '0';
      patientTab.style.display = 'none';
      patientTab.style.pointerEvents = 'none';
      patientTab.style.zIndex = String(PIANI.nascosto);
      patientTab.dataset.visible = "false";

      //Se ho chiuso la tab principale e ho solo una tab iframe, nascondo il pulsante chiudi da qui
      const dynamicTabs = document.querySelectorAll(".mdv-dynamic-tab");
      if (dynamicTabs.length === 1) {
        document.querySelector(".close-tab-iframe").style.display = "none"
      }
    }
  });

  startMainAreaHeightSync();

}


// ========================
//  HOOK APERTURA PANNELLI
// ========================

window.addEventListener('panelOpen', function (event) {
  if (!event.detail.isOpen && event.detail.side !== 'left') {
    startTabsInitWatcher();
  }
});

// Fallback: ensure tabs init even if panelOpen doesn't fire
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startTabsInitWatcher);
} else {
  startTabsInitWatcher();
}


function updatePatientCloseButton() {
  const dynamicTabs = document.querySelectorAll(".mdv-dynamic-tab");
  const count = dynamicTabs.length;

  const closeIframeBtn = document.querySelector(".close-tab-iframe");
  const closeBtn = document.getElementById("close-patient-tab");
  const patientTab = document.getElementById('explorer-tab-btn');

  // Mostra/nasconde il pulsante per chiudere una tab iframe
  if (closeIframeBtn) {
    closeIframeBtn.style.display = count > 1 || patientTab.style.display !== 'none' ? "block" : "none";
  }

  // Mostra/nasconde la X della tab principale
  if (closeBtn) {
    closeBtn.style.display = count > 0 ? "inline" : "none";
  }


}


function setPatientTabActive(isActive) {
  const patientTab = document.getElementById('explorer-tab-btn');
  if (!patientTab) return;

  if (isActive) {
    patientTab.classList.add('active-tab');
    patientTab.style.background = "rgb(22 22 22)";
    patientTab.style.border = '1px solid #38bdf8';
    patientTab.style.cursor = 'default';
  } else {
    patientTab.classList.remove('active-tab');
    patientTab.style.background = "rgb(7 7 7)";
    patientTab.style.border = '1px solid transparent';
    patientTab.style.cursor = 'pointer';
  }
}

function setExplorerUiVisibility(isExplorer) {
  const plusTab = document.getElementById('plus-tab-btn');
  if (plusTab) {
    plusTab.style.display = isExplorer ? 'none' : 'block';
  }

  const toolbar = document.querySelector('.toolbar-child-flex');
  if (toolbar) {
    toolbar.style.display = isExplorer ? 'none' : '';
  }
  const infoPazienteDiv = document.querySelector('.div-info-paziente');
  if (infoPazienteDiv) {
    infoPazienteDiv.style.display = isExplorer ? 'none' : '';
  }

  scheduleMainAreaHeightSync();
}

function hidePatientTab() {
  const patientTab = document.getElementById('explorer-tab-btn');
  if (!patientTab) return;
  patientTab.style.opacity = '0';
  patientTab.style.display = 'none';
  patientTab.style.pointerEvents = 'none';
  patientTab.style.zIndex = String(PIANI.nascosto);
  patientTab.dataset.visible = "false";
}

function closeAllTabsAndShowExplorer() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => { });
  }

  const tabs = Array.from(document.querySelectorAll('.mdv-dynamic-tab'));
  tabs.forEach((tab) => {
    removeDynamicTab(tab);
  });

  if (isStudyListEnabled) {
    showIframeForTab('mdv-dynamic-iframe-empty');
    hidePatientTab();
  } else {
    showIframeForTab('none');
  }
  updatePatientCloseButton();
}


// =====================================================================
//   CREA TAB + IFRAME DINAMICO (VERSIONE MIGLIORATA)
// =====================================================================

window.openStudyInInternalTab = function (url, options = {}) {
  const { title = "Studio", tooltip = "" } = options;

  const container = document.getElementById('mdv-tab-container');
  if (!container) return;

  // Chiudi eventuali modali
  const existing = document.getElementById('mdv-modal');
  if (existing) existing.remove();

  let studyId = null;
  try {
    studyId = new URL(url, window.location.origin).searchParams.get('StudyInstanceUIDs');
  } catch (_) {
    studyId = null;
  }
  // Lo studio gia aperto si mostra, non si riapre.
  //
  // Il controllo guardava solo le schede create da qui, e non quella del
  // paziente, che e la prima e non passa da questa funzione. Riaprendo dalla
  // lista lo studio che si stava gia guardando si otteneva una seconda scheda
  // dello stesso studio, indistinguibile dalla prima.
  const studioDellaScheda = window.mdvStudyInstanceUIDs;
  const patientTab = document.getElementById('explorer-tab-btn');
  if (studyId && studioDellaScheda && studyId === studioDellaScheda && patientTab) {
    patientTab.click();
    return;
  }

  const existingTab = studyId ? getExistingTabForStudy(studyId) : null;
  if (existingTab?.dataset?.iframeId) {
    showIframeForTab(existingTab.dataset.iframeId);
    return;
  }

  // ID unico per l’iframe
  const iframeId = "mdv-dynamic-iframe-" + Math.random().toString(36).substring(2);
  document.getElementById("explorer-tab-btn").style.cursor = "pointer"

  // ============================
  // CREA TAB DINAMICA
  // ============================
  const tab = document.createElement('div');
  tab.className = "mdv-dynamic-tab";
  tab.dataset.iframeId = iframeId;
  if (studyId) {
    tab.dataset.studyId = studyId;
    openStudyTabsById.set(studyId, tab);
    notifyOpenTabsChange();
  }

  tab.style.display = 'flex';
  tab.style.alignItems = 'center';
  tab.style.gap = '8px';
  tab.style.padding = '5px 12px';
  tab.style.background = 'rgb(7 7 7)';
  tab.style.color = '#fff';
  tab.style.borderRadius = '4px';
  tab.style.fontSize = '13px';
  tab.style.cursor = 'pointer';
  tab.style.userSelect = 'none';
  tab.style.whiteSpace = 'nowrap';
  tab.style.zIndex = String(PIANI.barraSchede);
  tab.style.transition = 'background 0.2s';
  tab.style.border = '1px solid transparent';


  /* --- TITOLO CON ELLIPSIS --- */
  const titleSpan = document.createElement('span');
  titleSpan.innerText = title;

  // CSS ellipsis
  titleSpan.style.overflow = 'hidden';
  titleSpan.style.whiteSpace = 'nowrap';
  titleSpan.style.textOverflow = 'ellipsis';
  titleSpan.style.maxWidth = '270px';      // ← decide tu la larghezza
  titleSpan.style.display = 'inline-block';
  titleSpan.style.flexShrink = '1';

  // Hover
  tab.addEventListener('mouseenter', () => {
    if (!tab.classList.contains('active-tab'))
      tab.style.background = 'rgb(65 65 65)';
  });
  tab.addEventListener('mouseleave', () => {
    if (!tab.classList.contains('active-tab'))
      tab.style.background = 'rgb(7 7 7)';
  });

  // TITOLO
  const spanTitle = document.createElement('span');
  spanTitle.innerText = title;

  // TOOLTIPS NATIVO
  if (tooltip) tab.title = tooltip;

  // X DI CHIUSURA
  const close = document.createElement('span');
  close.innerHTML = "✕";
  close.style.cursor = "pointer";
  close.style.color = "#ccc";
  close.style.fontSize = "12px";
  close.style.fontWeight = "bold";
  close.className = "close-tab-iframe"

  close.addEventListener('click', (e) => {
    e.stopPropagation();
    removeDynamicTab(tab);
  });

  tab.appendChild(titleSpan);

  /* --- X DI CHIUSURA --- */
  tab.appendChild(close);

  // Inserisci la tab accanto al "+"
  const plusTab = document.getElementById("plus-tab-btn");
  if (plusTab) {
    container.insertBefore(tab, plusTab);
  } else {
    container.appendChild(tab);
  }

  // ============================
  // CREA IFRAME ASSOCIATO
  // ============================

  const iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.src = url;
  iframe.dataset.loaded = 'false';
  iframe.style.position = 'absolute';
  // iframe.style.top = '43px';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '100%';
  // iframe.style.height = 'calc(100% - 43px)';
  iframe.style.height = '100%';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = String(PIANI.contenuto);

  document.body.appendChild(iframe);

  injectCssIntoIframe(iframe);

  const spinner = document.createElement('div');
  spinner.className = 'mdv-tab-spinner';
  spinner.style.width = '12px';
  spinner.style.height = '12px';
  spinner.style.border = '2px solid rgba(255,255,255,0.35)';
  spinner.style.borderTop = '2px solid #fff';
  spinner.style.borderRadius = '50%';
  spinner.style.animation = 'mdv-spin 0.9s linear infinite';
  spinner.style.display = 'inline-block';
  tab.appendChild(spinner);

  if (!document.getElementById('mdv-tab-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'mdv-tab-spinner-style';
    style.innerHTML = `
      @keyframes mdv-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  iframe.addEventListener('load', () => {
    // Attendo il segnale di ready dal contenuto per mostrare l'iframe
  });
  iframeSpinnerById.set(iframeId, spinner);
  startIframeReadyTimeout(iframeId, title);

  // ATTACH CLICK
  tab.addEventListener('click', () => showIframeForTab(iframeId));

  // Attiva quando pronta
  pendingIframeId = iframeId;

  updatePatientCloseButton();

};



// =====================================================================
//   MOSTRA SOLO L'IFRAME ASSOCIATO ALLA TAB
// =====================================================================
function showIframeForTab(iframeId) {
  const resolvedIframeId =
    !isStudyListEnabled && iframeId === 'mdv-dynamic-iframe-empty' ? 'none' : iframeId;
  const iframe = document.getElementById(resolvedIframeId);
  if (iframe && resolvedIframeId !== 'mdv-dynamic-iframe-empty' && iframe.dataset.loaded === 'error') {
    pendingIframeId = null;
    showStudyLoadErrorNotification(
      iframeLoadErrorById.get(resolvedIframeId) ||
      'Impossibile completare il caricamento dello studio.'
    );
    return;
  }
  if (iframe && resolvedIframeId !== 'mdv-dynamic-iframe-empty' && iframe.dataset.loaded !== 'true') {
    pendingIframeId = resolvedIframeId;
    showLoadingNotification();
    return;
  }

  pendingIframeId = null;
  activeIframeId = resolvedIframeId;
  // Nascondi tutti gli iframe dinamici
  document.querySelectorAll('[id^="mdv-dynamic-iframe"]').forEach(ifr => {
    ifr.style.opacity = '0';
    ifr.style.pointerEvents = 'none';
    ifr.style.zIndex = String(PIANI.nascosto);
  });

  // Reset grafico tab dinamiche
  document.querySelectorAll('.mdv-dynamic-tab').forEach(tab => {
    tab.classList.remove('active-tab');
    tab.style.background = "rgb(7 7 7)";
    tab.style.border = '1px solid transparent';
  });

  setPatientTabActive(resolvedIframeId === 'none');
  setExplorerUiVisibility(resolvedIframeId === 'mdv-dynamic-iframe-empty');

  // Tab paziente → nessun iframe visibile
  if (resolvedIframeId === 'none') {
    updatePatientCloseButton();
    return;
  }

  // Mostra iframe selezionato
  if (iframe) {
    if (resolvedIframeId === 'mdv-dynamic-iframe-empty' || iframe.dataset.loaded === 'true') {
      iframe.style.opacity = '1';
      iframe.style.pointerEvents = 'auto';
      iframe.style.zIndex = String(PIANI.contenuto);
    }
  }

  // Evidenzia tab attiva
  const activeTab = [...document.querySelectorAll('.mdv-dynamic-tab')]
    .find(t => t.dataset.iframeId === resolvedIframeId);

  if (activeTab) {
    activeTab.classList.add('active-tab');
    activeTab.style.background = "rgb(22 22 22)";
    activeTab.style.border = "1px solid #38bdf8";
  }

  // Nascondi la tab principale se un iframe è attivo
  const patientTab = document.getElementById('explorer-tab-btn');

  if (resolvedIframeId === 'none') {
    // quando apro la tab principale, deve tornare visibile
    patientTab.style.opacity = '1';
    patientTab.style.display = 'block';
    patientTab.style.pointerEvents = 'auto';
    patientTab.style.zIndex = String(PIANI.schedaPaziente);
    patientTab.dataset.visible = "true";
  } else {
    // Se l’iframe NON è quello del pulsante +, nascondo la tab principale
    // Se sto mostrando un iframe REALE → nascondo la tab principale
    if (resolvedIframeId.startsWith("mdv-dynamic-iframe-") && resolvedIframeId !== "mdv-dynamic-iframe-empty") {

      // patientTab.style.opacity = '0';
      // patientTab.style.pointerEvents = 'none';
      // patientTab.style.zIndex = String(PIANI.nascosto);
      // patientTab.dataset.visible = "false";

    }
    // Se sto mostrando l’iframe del + → NON nascondere la tab principale
    else if (resolvedIframeId === "mdv-dynamic-iframe-empty") {

      patientTab.style.opacity = '1';
      patientTab.style.pointerEvents = 'auto';
      patientTab.style.zIndex = String(PIANI.schedaPaziente);
      patientTab.dataset.visible = "true";

    }
    // Se sto mostrando la tab principale → ovvio, la tab principale deve essere visibile
    else if (resolvedIframeId === 'none') {

      patientTab.style.opacity = '1';
      patientTab.style.pointerEvents = 'auto';
      patientTab.style.zIndex = String(PIANI.schedaPaziente);
      patientTab.dataset.visible = "true";

    }

  }


  updatePatientCloseButton();
}




// =====================================================================
//   CHIUSURA TAB DINAMICA
// =====================================================================
function removeDynamicTab(tab) {
  const iframeId = tab.dataset.iframeId;
  const studyId = tab.dataset.studyId;
  const iframe = document.getElementById(iframeId);

  clearIframeLoadTimeout(iframeId);
  iframeLoadErrorById.delete(iframeId);
  iframeSpinnerById.delete(iframeId);
  if (iframe) iframe.remove();
  tab.remove();
  if (studyId) {
    openStudyTabsById.delete(studyId);
    notifyOpenTabsChange();
  }

  const container = document.getElementById('mdv-tab-container');
  const allTabs = [...container.querySelectorAll('.mdv-dynamic-tab')];

  // Nessuna altra tab → torna a iframe vuoto
  if (allTabs.length === 0) {
    showIframeForTab('none');
    const patientTab = document.getElementById('explorer-tab-btn');
    patientTab.style.opacity = '1';
    patientTab.style.pointerEvents = 'auto';
    patientTab.style.zIndex = String(PIANI.schedaPaziente);
    patientTab.dataset.visible = "true";
    updatePatientCloseButton();
    return;
  }

  // Attiva ultima tab
  const prev = allTabs[allTabs.length - 1];
  showIframeForTab(prev.dataset.iframeId);
  updatePatientCloseButton();
}




// =====================================================================
//   CLICK SU TAB PAZIENTE → NASCONDE TUTTI GLI IFRAME
// =====================================================================
document.addEventListener('click', (e) => {
  const patientTab = document.getElementById('explorer-tab-btn');
  if (!patientTab) return;

  if (e.target === patientTab || patientTab.contains(e.target)) {
    showIframeForTab('none');
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "injectCss") {
    try {
      const style = document.createElement("style");
      style.innerHTML = event.data.css;
      document.head.appendChild(style);
      console.log("CSS ricevuto e applicato dall'iframe");
    } catch (err) {
      console.error("Errore iniezione CSS nell'iframe", err);
    }
  }
  if (event.data?.type === 'mdv-iframe-ready') {
    const iframe = [...document.querySelectorAll('iframe')].find(
      el => el.contentWindow === event.source
    );
    markIframeReady(iframe);
  }
});
