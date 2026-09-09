// ========================
//   MODALE + IFRAME
// ========================

// ======================================================================
//   SENDING CSS INTO THE FRAME OVER POSTMESSAGE
// ======================================================================
if (window.self === window.top) {
  localStorage.removeItem("aetitle");
  localStorage.removeItem("urlOriginalePerWorklist");
}

const isStudyListEnabled = window?.config?.showStudyList !== false;

/**
 * The stacking planes, in one place.
 *
 * Erano numeri sparsi - 99999, 100000, 999999, 9999999 - scelti ciascuno per
 * win against something, with no order written down anywhere. Lowering one was
 * enough to break a relationship nobody knew existed: the tab bar moved under the
 * content made the selected tab disappear behind its own frame, which starts six
 * pixels higher up.
 *
 * The toolbar's tooltips are drawn at 50: anything that has to leave them readable
 * belongs below that number.
 */
const PIANI = {
  nascosto: -1,
  contenuto: 1,
  tabBar: 10,
  patientTab: 11,
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
      title: 'The study could not be loaded',
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
      `"${studyTitle}" could not finish loading. Check that the study is there, and the token and the AE title.`
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
    // A tab that failed should not carry the active tab's border.
    //
    // Repainting the brand red as blue gave this border the same colour that marks
    // the selected tab, and the two were then told apart only by their background.
    // Red here means "it went wrong", and this is one of the places where red stays.
    tab.style.border = '1px solid #fca5a5';
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

/**
 * The accession read off what is drawn, as a last resort.
 *
 * Cerca un elemento il cui title parli di accession e ne legge il testo. Va
 * but kept away from the tab bar: every study tab carries as its title the summary
 * built by the list, and that summary holds an "Accession: ..." line. Without this
 * exclusion the patient tab took the accession of ANOTHER open study, and two
 * different tabs showed the same number. They looked like one study seeing itself,
 * and they were not.
 */
function getAccessionFromDom() {
  const tabBar = document.getElementById('mdv-tab-container');
  const nodesWithTitle = Array.from(document.querySelectorAll('[title]')).filter(
    node => !tabBar || !tabBar.contains(node)
  );
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

/**
 * The patient's identifier, which is there even when the name is not.
 *
 * DICOM may carry no PatientName. LIDC-IDRI-0001 in the demonstration archive has
 * none. PatientID is always filled in. It lives in
 * window.mdvPatientInfo, posato dall intestazione; cercarlo nei parametri
 * of the address, the way this used to, could not work: the viewer's address in this
 * project carries StudyInstanceUIDs and nothing else.
 */
function getPatientIdForTab() {
  return (
    normalizeInfoText(window.mdvPatientInfo?.PatientID) ||
    getQueryParamCaseInsensitive('PatientID', 'patientId', 'mrn')
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

/**
 * The tab's label: who the patient is, and which exam.
 *
 * Those are the two things a study is recognised by on a worklist, and it is the
 * shape of the project this comes from. There used to be a fallback, "Study", which
 * for a study with no patient name (LIDC-IDRI-0001 in the demonstration archive has
 * none) stayed there for good: the tab no longer said which study it was, and two
 * different tabs read identically.
 *
 * The name, when it is missing, gives way to the patient identifier, which is always
 * there and is what the header shows anyway. The dash is written only when there is
 * something to separate: with no accession it used to hang off nothing and pushed the
 * close cross onto a second line.
 */
function buildPatientTabDescription() {
  const patientName = getPatientNameForTab() || getPatientIdForTab();
  const accession = getAccessionForTab();
  return [patientName, accession].filter(Boolean).join(' — ') || 'Studio in apertura';
}

/** Scrive l etichetta, e dice se ormai dice qualcosa. */
function updatePatientTabDescription() {
  const titleNode = document.querySelector('#explorer-tab-btn .patient-title');
  if (!titleNode) {
    return false;
  }
  // The label is always rewritten with the best there is; the return value says
  // whether anything is still worth waiting for.
  //
  // Fermarsi al primo dato utile era troppo presto: nome e accession arrivano
  // at different moments (the accession one React commit earlier), so the name alone
  // was enough to end the loop and the accession never appeared. It stops once it has
  // both of them, or when the time runs out.
  const description = buildPatientTabDescription();
  titleNode.textContent = description;
  // Success means the label is complete: identity and accession.
  // Anything with neither still stops when the time runs out.
  return Boolean(getPatientNameForTab() || getPatientIdForTab()) && Boolean(getAccessionForTab());
}

function clearPatientTabInfoRefresh() {
  if (patientTabInfoRefreshIntervalId) {
    clearInterval(patientTabInfoRefreshIntervalId);
    patientTabInfoRefreshIntervalId = null;
  }
}

function startPatientTabInfoRefresh() {
  clearPatientTabInfoRefresh();
  // The wait has to be measured against how long a study takes to arrive.
  //
  // It was thirty attempts of 350 milliseconds, which is ten and a half seconds. A
  // study from the archive takes twenty or thirty, so the loop ended before the
  // patient's data existed at all, and the label stayed "Study" for good.
  const ATTESA_MASSIMA_MS = 60000;
  const PASSO_MS = 350;
  let attempts = 0;
  patientTabInfoRefreshIntervalId = setInterval(() => {
    attempts += 1;
    const identificato = updatePatientTabDescription();
    if (
      identificato ||
      attempts * PASSO_MS >= ATTESA_MASSIMA_MS ||
      !document.getElementById('explorer-tab-btn')
    ) {
      clearPatientTabInfoRefresh();
    }
  }, PASSO_MS);
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
    { value: 'month', label: 'Last month' },
    { value: 'year', label: 'Last year' },
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
  // Ready means "it has drawn something", not "it is the study list".
  //
  // It used to look only for the list's own marks: the Accession and PatientID
  // columns, or the results table. But a tab that opens a STUDY loads the viewer,
  // where none of those three ever appear. The signal never fired, and after
  // twenty-five seconds the timeout put up "The study could not be loaded. Check
  // that the study is there, and the token and the AE title", which sends somebody
  // looking for a fault that is not there.
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

        .div-patient-info{
        display:none
        }
        `
      : ''}
  `;

  // Wait for the frame to load
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
//   PRELOADING THE EMPTY FRAME, THE ONE THE + BUTTON SHOWS
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

  // A new tab opens on the STUDY LIST, not on the viewer.
  //
  // It used to point at /viewer/, which in the host installation was the list and
  // here is the viewer's own route: with no study in the address it loaded a black
  // page, and the "+" looked broken. The list is at the root, where the
  // mette routerBasename.
  iframe.src = window.location.origin + ((window.PUBLIC_URL || '/').replace(/\/*$/, '/'));

  // Whether it is ready is for the page inside to say, not for us out here.
  //
  // It used to be marked ready the instant the frame is created, before it had
  // loaded anything: pressing "+" revealed a page still drawing itself, and the
  // content arrived in pieces. The real signal is the mdv-iframe-ready message, the
  // same one the study tabs use. The time limit stops a missed signal leaving the
  // "+" waiting for good.
  //
  startIframeReadyTimeout(iframeId, 'Lista studi');

  // The list tab fills the window like every other tab.
  //
  // It was nailed to 43 pixels from the top, because the host page's own bar used to
  // sit above it. That bar now hides itself whenever a tab is open, so forty-three
  // empty pixels were left at the top with the strip of tabs floating over them.
  // That is what looked like the page "arriving in pieces", and it happened every
  // single time.
  iframe.style.position = 'absolute';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  // NASCOSTO MA ATTIVO (NO display:none!)
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = String(PIANI.nascosto);

  document.body.appendChild(iframe);

  injectCssIntoIframe(iframe);

  iframe.addEventListener('load', () => {
    // the explorer frame stays visible whenever it is the active one
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
  // A study already open is shown, not opened again.
  //
  // The check looked only at tabs created here, and not at the patient's tab, which
  // is the first one and does not come through this function. Reopening from the
  // list the study already on screen therefore gave a second tab for the same study,
  // indistinguishable from the first.
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
  // Open also means "it is the one this page is showing".
//
// The list uses this to mark the rows already open. It looked only at tabs created
// here, so the study behind the patient tab did not count as open, and clicking it
// did not do what the row promised, because the de-duplication recognises it and
// brings you back to its own tab.
window.mdvIsStudyOpenInTab = studyId =>
  Boolean(getExistingTabForStudy(studyId)) ||
  Boolean(studyId && studyId === window.mdvStudyInstanceUIDs);
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
      message: 'Loading the study...',
      type: 'warning',
    });
    loadingNotificationTimeoutId = setTimeout(() => {
      loadingNotificationTimeoutId = null;
    }, 1500);
    return;
  }

  // Fallback minimal (no service available)
  console.warn('Loading the study');
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
    observeLayoutTarget('.div-patient-info');

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
  // Inside a frame the bar is not built at all.
  //
  // It used to be built and then hidden with a display:none injected from outside.
  // If that injection arrived late, or never arrived, every open tab showed a bar of
  // its own with a "+" of its own, and you ended up with one plus per open study and
  // the close crosses piled on top of each other.
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
  plusTab.style.zIndex = String(PIANI.tabBar);
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
        // With a prior study alongside, the tab bar has to stop at the frame's edge:
        // the prior is aligned to the top and would cover the tabs that reach into
        // its half.
        const priorsIframe = document.getElementById('priors-iframe');
        const priorsBorder = priorsIframe ? priorsIframe.getBoundingClientRect().left : 0;
        const limiteDestro = priorsBorder > safeLeft ? priorsBorder : viewportWidth;
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

      // Hide the main tab once it has been "closed"
      const patientTab = document.getElementById('explorer-tab-btn');
      patientTab.style.opacity = '0';
      patientTab.style.display = 'none';
      patientTab.style.pointerEvents = 'none';
      patientTab.style.zIndex = String(PIANI.nascosto);
      patientTab.dataset.visible = "false";

      // With the main tab closed and only one frame tab left, hide the close button here
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

  // Shows or hides the main tab's X
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
  const patientInfoDiv = document.querySelector('.div-patient-info');
  if (patientInfoDiv) {
    patientInfoDiv.style.display = isExplorer ? 'none' : '';
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

  // Close eventuali modali
  const existing = document.getElementById('mdv-modal');
  if (existing) existing.remove();

  let studyId = null;
  try {
    studyId = new URL(url, window.location.origin).searchParams.get('StudyInstanceUIDs');
  } catch (_) {
    studyId = null;
  }
  // A study already open is shown, not opened again.
  //
  // The check looked only at tabs created here, and not at the patient's tab, which
  // is the first one and does not come through this function. Reopening from the
  // list the study already on screen therefore gave a second tab for the same study,
  // indistinguishable from the first.
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
  tab.style.zIndex = String(PIANI.tabBar);
  tab.style.transition = 'background 0.2s';
  tab.style.border = '1px solid transparent';


  /* --- TITLE WITH AN ELLIPSIS --- */
  const titleSpan = document.createElement('span');
  titleSpan.innerText = title;

  // CSS ellipsis
  titleSpan.style.overflow = 'hidden';
  titleSpan.style.whiteSpace = 'nowrap';
  titleSpan.style.textOverflow = 'ellipsis';
  titleSpan.style.maxWidth = '270px';      // ← decide tu la width
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
    // Wait for the ready signal from the content before showing the frame
  });
  iframeSpinnerById.set(iframeId, spinner);
  startIframeReadyTimeout(iframeId, title);

  // ATTACH CLICK
  tab.addEventListener('click', () => showIframeForTab(iframeId));

  // Made active once it is ready
  pendingIframeId = iframeId;

  updatePatientCloseButton();

};



// =====================================================================
//   SHOW ONLY THE FRAME BELONGING TO THIS TAB
// =====================================================================
function showIframeForTab(iframeId) {
  const resolvedIframeId =
    !isStudyListEnabled && iframeId === 'mdv-dynamic-iframe-empty' ? 'none' : iframeId;
  const iframe = document.getElementById(resolvedIframeId);
  if (iframe && resolvedIframeId !== 'mdv-dynamic-iframe-empty' && iframe.dataset.loaded === 'error') {
    pendingIframeId = null;
    showStudyLoadErrorNotification(
      iframeLoadErrorById.get(resolvedIframeId) ||
      'The study could not be loaded.'
    );
    return;
  }
  // The "+" tab is shown once it has finished drawing, like the others.
  //
  // It was the only one exempt: revealed at once, so the page went blank and its
  // content arrived in pieces. It now waits for the same signal as the rest, the
  // mdv-iframe-ready message every tab sends when it has drawn, and the swap becomes
  // a single one.
  if (iframe && iframe.dataset.loaded !== 'true') {
    pendingIframeId = resolvedIframeId;
    showLoadingNotification();
    return;
  }

  pendingIframeId = null;
  activeIframeId = resolvedIframeId;

  // Somebody looking at another tab should not see this page's bar.
  //
  // Every tab is a whole viewer in a frame, and this page is itself a viewer: open a
  // tab and there are two identical bars on top of each other, with the controls
  // landing on the one underneath, which is to say on the viewer nobody is looking
  // at.
  const schedaEsterna =
    resolvedIframeId !== 'none' && String(resolvedIframeId).startsWith('mdv-dynamic-iframe-');
  document.body.classList.toggle('mdv-external-tab', schedaEsterna);
  // Hide every dynamic frame
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

  // Tab patient → nessun iframe visibile
  if (resolvedIframeId === 'none') {
    updatePatientCloseButton();
    return;
  }

  // Show the selected frame
  if (iframe) {
    if (iframe.dataset.loaded === 'true') {
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
    // opening the main tab has to bring it back into view
    patientTab.style.opacity = '1';
    patientTab.style.display = 'block';
    patientTab.style.pointerEvents = 'auto';
    patientTab.style.zIndex = String(PIANI.patientTab);
    patientTab.dataset.visible = "true";
  } else {
    // If the frame is NOT the + button's, hide the main tab
    // Se sto mostrando un iframe REALE → nascondo la tab principale
    if (resolvedIframeId.startsWith("mdv-dynamic-iframe-") && resolvedIframeId !== "mdv-dynamic-iframe-empty") {

      // patientTab.style.opacity = '0';
      // patientTab.style.pointerEvents = 'none';
      // patientTab.style.zIndex = String(PIANI.nascosto);
      // patientTab.dataset.visible = "false";

    }
    // If the + button's frame is the one showing, do NOT hide the main tab
    else if (resolvedIframeId === "mdv-dynamic-iframe-empty") {

      patientTab.style.opacity = '1';
      patientTab.style.pointerEvents = 'auto';
      patientTab.style.zIndex = String(PIANI.patientTab);
      patientTab.dataset.visible = "true";

    }
    // If the main tab is the one showing then, plainly, it has to be visible
    else if (resolvedIframeId === 'none') {

      patientTab.style.opacity = '1';
      patientTab.style.pointerEvents = 'auto';
      patientTab.style.zIndex = String(PIANI.patientTab);
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
    patientTab.style.zIndex = String(PIANI.patientTab);
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
//   A CLICK ON THE PATIENT TAB HIDES EVERY FRAME
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
      console.error("Could not inject the CSS into the frame", err);
    }
  }
  if (event.data?.type === 'mdv-iframe-ready') {
    const iframe = [...document.querySelectorAll('iframe')].find(
      el => el.contentWindow === event.source
    );
    markIframeReady(iframe);
  }
});
