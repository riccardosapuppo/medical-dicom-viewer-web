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
      // The second name is the one an older host page sends, and it is still
      // accepted: this address is built by whatever page embeds the viewer.
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
// LINING THE PRIOR STUDY UP VERTICALLY WHEN IT SITS ALONGSIDE
//
// The prior's frame is a float inserted AFTER the main study's tab bar, so it starts
// the whole height of that bar lower down; and inside it there is a patient label of
// its own, which therefore ended up well below the main study's and pushed the prior's
// grid down with it.
// Rather than chase fixed numbers, since the height depends on the header, the
// extension banner and the browser's zoom, this measures at run time: the frame is
// pulled up with a negative margin until its label sits at the same height as the main
// one, and its viewport area is closed off exactly at the bottom of the main study's.
// That holds for any configuration.
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
 * Lines the prior's frame up with the main study.
 * @returns {boolean} true when the measurements were there and it was applied.
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
    return false; // The frame is not reachable yet
  }
  const priorsArea = priorsDocument?.querySelector('.mdv-main-area');
  if (!priorsArea) {
    return false;
  }

  // What to line up on at the top: the patient label when both sides have one, since
  // that is what a reader sees; otherwise the viewport area.
  const mainTabBar = document.getElementById('mdv-tab-container');
  const priorsTabBar = priorsDocument.getElementById('mdv-tab-container');
  const tabBarUse = Boolean(mainTabBar && priorsTabBar);
  const mainRef = tabBarUse ? mainTabBar : mainArea;
  const priorsRef = tabBarUse ? priorsTabBar : priorsArea;

  // 1) The prior's label at the same height as the main one.
  iframe.style.marginTop = '0px';
  const scarto = Math.round(
    iframe.getBoundingClientRect().top +
      priorsRef.getBoundingClientRect().top -
      mainRef.getBoundingClientRect().top
  );
  if (scarto > 0) {
    iframe.style.marginTop = `-${scarto}px`;
  }

  // 2) The prior's frame and grid closed off at the bottom of the main one.
  //    The .priors-same-tab CSS rules are !important, so these computed heights
  //    have to be as well.
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
 * Starts the alignment. The tab bar inside the frame is created asynchronously, so
 * this retries until the measurements are there, for about ten seconds.
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

// Resizing the window changes the height of the header and of the tab bar.
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
  // The preloader used to take the right-hand half. Only now is the frame in its own
  // place, and only now is it worth measuring to line it up with the main study.
  startPriorsAlignment();
}

function startPriorsLoadingWatch(preloader) {
  clearPriorsLoadingState();
  priorsPendingPreloader = preloader;

  priorsReadyTimeoutId = setTimeout(() => {
    showPriorsLoadingError();
  }, PRIORS_IFRAME_READY_TIMEOUT_MS);
}

const openPriors = (e, mode, studyInstanceUID, options = {}) => {
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

  if (mode === 'sameTab') {
    const priorsIframe = document.getElementById('priors-iframe');
    const isAlreadyActive = e.currentTarget?.classList?.contains('active');
    if (priorsIframe && isAlreadyActive) {
      window.postMessage('close-priors-iframe', '*');
      return;
    }

    // Colour the clicked icon of that particular study
    for (const a of document.querySelectorAll('#priors-same-window')) {
      a.classList.remove('active');
    }
    e.currentTarget.classList.add('active');
    split2Studies(newUrl, context.studyInstanceUID);
  } else if (mode === 'newTab') {
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
  // Turn reformatting off and on again, keeping the series that is open
  saveSeriesToClickAgain();
  document.querySelector('[data-cy="LayoutMPR"]').click(); //Disattivo MPR
  // A spinner rather than the grid rearranging itself in front of the reader.
  document.body.classList.add('loading-spinner-into-grid');

  setTimeout(() => {
    document.querySelector('[data-cy="LayoutMPR"]').click(); //Riattivo MPR
  }, 0);
  setTimeout(() => {
    document.body.classList.remove('loading-spinner-into-grid');

    // window.instanceUIDMPRToClick = null;

    // Once the fix is done, always come back to the prior's tab this started from
    document.querySelector('.storicosulcloud').click();
  }, 500);
};

function split2Studies(urlToOpen) {
  clearPriorsLoadingState({ removePreloader: true });
  stopPriorsAlignment();
  if (document.getElementById('priors-iframe')) {
    document.getElementById('priors-iframe').remove(); // Always replaced, never reused
  }
  // With MPR on, turn it off and back on once the screen is already split: resizing
  // the window throws it out at random, while enabling it on an already split screen does not
  if (document.body.classList.contains('hp-mpr-active')) {
    fixlayoutViewportsMPR();
  }
  document.body.classList.add('priors-injected-iframe');
  document.body.classList.remove('second-mpr-active');
  const mainArea = document.querySelector('.mdv-main-area');
  mainArea.style.width = '50%';
  mainArea.style.float = 'left'; // Floated, so the prior sits beside it

  // Make a new frame
  const iframe = document.createElement('iframe');
  const iframeUrl = new URL(urlToOpen, window.location.origin);
  iframeUrl.searchParams.set('priors', 'same-tab');
  iframe.src = iframeUrl.toString();
  iframe.id = 'priors-iframe';
  iframe.dataset.loaded = 'false';

  // Style the frame
  iframe.style.width = '50%'; // Half the width, for the study and its prior
  iframe.style.height = '100vh'; // The full height of the view
  iframe.style.border = 'none';
  iframe.style.float = 'left';
  iframe.style.position = 'relative';
  iframe.style.zIndex = '19';

  // A spinner while it loads
  const preloader = createPreloader();

  mainArea.parentNode.insertBefore(preloader, mainArea.nextSibling);
  // return;

  // Put the frame in after the main area
  preloader.parentNode.insertBefore(iframe, preloader.nextSibling);
  startPriorsLoadingWatch(preloader);
  // mainArea.parentNode.insertBefore(iframe, mainArea.nextSibling);
  // Add a listener to wait for the frame to load
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
  // Now start a listener for any messages the frame's own listener sends
  ascoltoMessaggiIframeFiglio();
}

// If this is itself a prior, mark it as one
if (window.location.href.includes('priors=same-tab')) {
  document.body.classList.add('priors-same-tab');
  // Add the close button, so the frame can be removed
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

  // Start the listener for messages from the parent
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
// COMMAND BRIDGE: the main study to the prior's frame
//
// In "prior alongside" mode the frame's toolbar is hidden with CSS and commands come
// from the main study over postMessage. This used to simulate clicks on the buttons
// (data-cy plus nested setTimeouts), which was fragile and failed for everything living
// inside a dropdown (Reset and the other "MoreTools") and for every tool with no case
// written for it (Scale, reference cursors, Link images, Zoom 1:1, and so on).
// The message is now resolved to a toolbar button id and handed to
// toolbarService.recordInteraction, which is the exact path a real click takes: it runs
// the commands with their options and updates the button's state. So every toolbar tool
// stays in step without anyone writing a case for it in here.
// ---------------------------------------------------------------------------

// Older messages, which carry command names, mapped to the matching toolbar button id.
// Every other message is already a button id ('ScaleOverlay', 'Pan', and the like).
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

// Advanced 3D and MPR presets: the layout selector also marks them as a class on the body.
const PRIORS_PRESET_BODY_CLASSES = ['fourUp', 'main3D', 'primaryAxial', 'only3D', 'primary3D'];

function getPriorsServices() {
  return window.servicesManager?.services || null;
}

/**
 * Runs inside the frame the same interaction a click on a toolbar button would:
 * recordInteraction fires the button's commands with its options, itemId included,
 * which the toggles such as Scale and reference lines cannot do without, and updates
 * the toolbar's state.
 * @returns {boolean} true when the button exists, meaning the command was handled.
 */
function runToolbarItemOnPriors(itemId) {
  const services = getPriorsServices();
  const toolbarService = services?.toolbarService;
  const buttonProps = toolbarService?.getButtonProps?.(itemId);
  if (!buttonProps) {
    return false;
  }

  // When the button is disabled in the prior (crosshairs outside MPR, say) nothing
  // runs, exactly as a real click would do nothing.
  if (buttonProps.disabled === true) {
    return true;
  }

  toolbarService.recordInteraction(
    { ...buttonProps, itemId },
    { refreshProps: { viewportId: services?.viewportGridService?.getActiveViewportId?.() } }
  );
  return true;
}

/** Runs a plain OHIF command, from the structured messages the parent sends. */
function runCommandOnPriors(commandName, commandOptions = {}) {
  if (!commandName || !window.commandsManager?.run) {
    return false;
  }
  window.commandsManager.run({ commandName, commandOptions });
  return true;
}

/** The grid layout the parent chose ('layout-common-2x3', 'custom2x3'). */
function applyGridLayoutOnPriors(numRows, numCols) {
  if (!numRows || !numCols) {
    return false;
  }
  // Like the layout selector: changing the grid cancels an MPR that came from a hanging protocol.
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

  // Remember the active series so it can be clicked again once the preset is applied,
  // which is what the main study's layout selector does.
  let activeDisplaySetInstanceUID = null;
  try {
    const { activeViewportId, viewports } = services.viewportGridService.getState();
    activeDisplaySetInstanceUID = viewports.get(activeViewportId)?.displaySetInstanceUIDs?.[0];
  } catch (_) {
    /* the viewport is not ready yet */
  }

  // A loading mask, as in the main study's layout selector.
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
    // A structured message: an OHIF command with options, a subgrid r by c for instance.
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

    // Grid layout: 'layout-common-2x3' for Standard, 'custom2x3' for Custom.
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

    // Not a toolbar button, so one last try as an advanced layout preset.
    if (applyHangingProtocolOnPriors(command)) {
      return;
    }

    console.warn('Priors: command not handled ->', command);
  } catch (err) {
    console.error('Could not pass the command to the frame: ', err);
  }
}

// MAIN: messages coming in from the frame
function listenerEvent(event) {
  if (event.origin !== window.location.origin) {
    console.warn('A message arrived from an origin that is not trusted:', event.origin);
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
    document.body.classList.remove('second-mpr-active');
    document.getElementById('priors-iframe')?.remove();
    const mainArea = document.querySelector('.mdv-main-area');
    if (mainArea) {
      mainArea.style.width = '100%';
    }

    for (const a of document.querySelectorAll('#priors-same-window')) {
      a.classList.remove('active');
    }
    // 3D MPR fix: going from a split screen to full screen with a 3D view active cut it
    // off. Apply the MPR preset first, then put the previous 3D preset back
    const preset3DNames = ['fourUp', 'main3D', 'only3D', 'primary3D'];

    preset3DNames.forEach(preset3D => {
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
      document.body.classList.remove('second-mpr-active');
      break;
  }
}

function ascoltoMessaggiIframeFiglio() {
  // Remove the previous event listener, if there is one
  window.removeEventListener('message', listenerEvent);

  // Add the event listener
  window.addEventListener('message', listenerEvent);
}

export default openPriors;
