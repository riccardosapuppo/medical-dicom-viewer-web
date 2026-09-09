// @ts-nocheck
/** @type {AppTypes.Config} */
// @ts-ignore
let prefetch = new URLSearchParams(new URL(window.location.href).search).get('prefetch');
let dicomLoad = new URLSearchParams(new URL(window.location.href).search).get('dicomload');
let hdnDicomLoad = new URLSearchParams(new URL(window.location.href).search).get('fZG');
let useCPURendering = new URLSearchParams(new URL(window.location.href).search).get('usecpu');
/**
 * Does the browser give us a 3D context?
 *
 * Drawing the images goes through WebGL. Where there is none, the viewer asks for the
 * context, gets null, and no viewport ever draws: the opening screen sits at "Almost
 * ready" on 100% and nothing else happens. Asking first, and falling back to the
 * processor, opens the studies anyway.
 *
 * The usual causes are hardware acceleration turned off in the browser, and too many
 * live WebGL contexts across open tabs, which browsers cap.
 * Reconstruction on three planes stays unavailable either way: that one wants the
 * graphics card.
 */
const graphicsContext = (() => {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();

if (!graphicsContext) {
  console.warn(
    'No WebGL context: the images are drawn by the processor. ' +
      'Studies open and the tools work; scrolling a long series ' +
      'is slower, and reconstruction on three planes is unavailable. ' +
      'Turn hardware acceleration on in the browser settings and close the ' +
      'other tabs that are using it.'
  );
}

const modality = new URLSearchParams(new URL(window.location.href).search).get('Modality');
/**
 * What is in the address is read at the moment it is needed.
 *
 * These were six constants worked out here, once, when this file is evaluated. But the
 * viewer navigates INSIDE the page: arriving from the study list the address changes
 * and those constants do not, so they stay as the page was when it opened. And on the
 * study list there is no study, so they stay empty. Thirteen places in the code read
 * them, and with the value stuck each of them went wrong in its own way.
 *
 * They stay writable, and that matters as much as the rest: six places in the hanging
 * protocols put the exam description and the modality here when the address does not
 * carry them, having read them out of the DICOM metadata. Making them read-only made
 * that code throw, and the panel stopped opening.
 *
 * Precedence: the address first, then the last value written. And the written value is
 * forgotten the moment the address changes, or the original problem comes back by
 * another route.
 */
[
  ['mdvStudyInstanceUIDs', 'StudyInstanceUIDs'],
  ['mdvStudyDescription', 'StudyDescription'],
  ['mdvModality', 'Modality'],
  ['mdvAETitle', 'aetitle'],
  ['mdvUsername', 'User'],
  ['mdvToken', 'Token'],
].forEach(([nome, parametro]) => {
  let posato;
  let posatoSu;

  Object.defineProperty(window, nome, {
    get() {
      const daIndirizzo = new URLSearchParams(window.location.search).get(parametro);
      if (daIndirizzo) {
        return daIndirizzo;
      }
      return posatoSu === window.location.href ? posato : null;
    },
    set(valore) {
      posato = valore;
      posatoSu = window.location.href;
    },
    configurable: true,
  });
});
let origin = window.location.origin;

// There is no host page here, and there is no second archive.
//
// Three switches used to live here: one told the viewer it was running inside the
// application that opened it, which decided the origin to ask for things; the other two
// turned on a third tab that looked for the patient's priors in a second archive,
// through a backend. Neither that page nor that backend is part of this repository, so
// the switches are gone and not only their values: leaving them false would keep alive
// code that nobody can turn on, and so nobody can test.
window.portableVersion = false;
window.showFrontendErrors = false //Something went wrong errore

// The demonstration archive, served by Orthanc and reached through the
// development proxy: same origin, so no cross-origin headers to configure on
// the archive and no preflight on hundreds of image requests.
let qidoRoot = '/pacs/dicom-web';
let wadoRoot = '/pacs/dicom-web';

window.qidoUrl = qidoRoot;

// Fixes an old link
if (
  window.location.href.includes('&study=') ||
  window.location.href.includes('&hangingProtocolId=mdvhp')
) {
  let newUrl = window.location.href;
  newUrl = newUrl.replace('&study', '&StudyInstanceUIDs');
  newUrl = newUrl.replace(/&hangingProtocolId=mdvhp/g, '');
  window.location.href = newUrl;
}

if (modality && modality === 'MG') {
  prefetch = 1;
}

const isMobile = () => {

  if (window.matchMedia("(max-width: 768px)").matches) {
    return true
  } else return
};

window.config = {
  name: 'config/default.js',
  routerBasename: '/',
  // routerBasename: '/viewer',
  // routerBasename: `${window.portableVersion ? '/' : '/viewer'}`,
  // whiteLabeling: {},
  extensions: [],
  modes: [],
  customizationService: {},
  viewportOverlayTags: {
    cornerTopLeft: [
      { tag: '0008,0020', format: 'date' }, // StudyDate
      { tag: '0020,0011', prefix: 'S: ' }, // SeriesNumber
      { tag: '0008,103E' }, // SeriesDescription
    ],
    cornerTopRight: [
      { tag: '0010,0010', format: 'pn', suffixTag: '0010,0040' }, // PatientName (+ PatientSex)
      { tag: '0010,0020', prefix: 'ID: ' }, // PatientID
      { tag: '0008,0050' }, // AccessionNumber
    ],
    cornerBottomLeft: [],
    cornerBottomRight: [],
  },
  showStudyList: true,
  // Lets the tools (pan, window level and the rest) work straight away on a viewport
  // that is not the active one: the first drag makes it active AND applies the tool at
  // once, so nobody has to click twice. The OHIF default is true.
  activateViewportBeforeInteraction: false,
  // Shows the SVG cursors that belong to the active tool (window level's green
  // crosshair, pan's hand) on EVERY viewport, so they match the subgrid cells. The OHIF
  // default is false, which gives the system cursor.
  useCursors: true,
  // Scale web workers to CPU cores (capped at 7 to leave 1 core for UI thread).
  // More workers = faster DICOM decode throughput when scrolling large series.
  maxNumberOfWebWorkers: Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 7),
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: false,
  // Off: the upstream product's dialog is titled with that product's name and writes
  // its text in a grey this theme cannot read. The same notice comes from the probe at
  // the top of this file, in the console, and the reconstruction button carries the
  // consequence written on itself.
  showCPUFallbackMessage: false,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  strictZSpacingForVolumeViewport: true,
  useSharedArrayBuffer: `${origin.includes('https') ? 'TRUE' : 'FALSE'}`,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: true,
  useExperimentalUI: true,
  autoImageSliceSync: true,
  // Il parametro nell indirizzo lo forza; altrimenti decide la sonda qui sopra.
  useCPURendering: useCPURendering ? true : !graphicsContext,
  mdvExtensionBrowserUrl: 'https://chrome.google.com/webstore/detail/REPLACE_ME',
  showMissingBrowserExtensionNotice: false,
  // Request slots coordinated by SmartImageLoadManager (global TCP budget).
  // Stack prefetch (nearby images for scroll) is NEVER blocked.
  // Only cross-series prefetch (StudyPrefetcherService) is paused during scroll.
  maxNumRequests: {
    interaction: 12,   // User scroll/click - higher for synced viewports (4 viewports x 3 each)
    thumbnail: 3,      // Study browser thumbnails
    prefetch: 8,       // Stack prefetch nearby images (more slots = smoother scroll + sync)
    compute: 4,        // Post-processing
  },
  // SmartImageLoadManager configuration
  smartLoadManager: {
    globalMaxConcurrent: 20,           // Higher budget for synced viewport scenarios
    scrollIdleMs: 400,                 // Resume cross-series prefetch after 400ms idle
    abortCrossSeriesPrefetchOnScroll: true, // Only kill cross-series prefetch, NOT stack prefetch
    boostNearbyOnScrollStop: 3,        // Boost-load 3 images each side when scroll stops
  },
  // Cache size: 1.5GB for large studies (CT/MR with hundreds of slices)
  maxCacheSize: 1536 * 1024 * 1024,
  // filterQueryParam: false,
  // Defines multi-monitor layouts
  multimonitor: [
    {
      id: 'split',
      test: ({ multimonitor }) => multimonitor === 'split',
      screens: [
        {
          id: 'ohif0',
          screen: null,
          location: {
            screen: 0,
            width: 0.5,
            height: 1,
            left: 0,
            top: 0,
          },
          options: 'location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
        {
          id: 'ohif1',
          screen: null,
          location: {
            width: 0.5,
            height: 1,
            left: 0.5,
            top: 0,
          },
          options: 'location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
      ],
    },

    {
      id: '2',
      test: ({ multimonitor }) => multimonitor === '2',
      screens: [
        {
          id: 'ohif0',
          screen: 0,
          location: {
            width: 1,
            height: 1,
            left: 0,
            top: 0,
          },
          options: 'fullscreen=yes,location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
        {
          id: 'ohif1',
          screen: 1,
          location: {
            width: 1,
            height: 1,
            left: 0,
            top: 0,
          },
          options: 'fullscreen=yes,location=no,menubar=no,scrollbars=no,status=no,titlebar=no',
        },
      ],
    },
  ],
  defaultDataSourceName: 'dicomweb',
  /* Dynamic config allows user to pass "configUrl" query string this allows to load config without recompiling application. The regex will ensure valid configuration source */
  // dangerouslyUseDynamicConfig: {
  //   enabled: true,
  //    // regex will ensure valid configuration source and default is /.*/ which matches any character. To use this, setup your own regex to choose a specific source of configuration only.
  //   //  Example 1, to allow numbers and letters in an absolute or sub-path only.
  //   // regex: /(0-9A-Za-z.]+)(\/[0-9A-Za-z.]+)*/
  //   // Example 2, to restricts to either hosptial.com or othersite.com.
  //   // regex: /(https:\/\/hospital.com(\/[0-9A-Za-z.]+)*)|(https:\/\/othersite.com(\/[0-9A-Za-z.]+)*)/
  //   regex: /.*/,
  // },
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Local DICOMweb archive',
        name: 'aws',
        // qidoRoot: '/pacs/dicom-web',
        qidoRoot: qidoRoot,
        // wadoRoot: '/pacs/dicom-web',
        wadoRoot: wadoRoot,
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        // Lazy load disabled: the PACS server does not support the
        // per-series QIDO-RS metadata queries that lazy load requires.
        enableStudyLazyLoad: false,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
          transform: url => url.replace('/pixeldata.mp4', '/rendered'),
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    // {
    //   namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    //   sourceName: 'dicomweb',
    //   configuration: {
    //     friendlyName: 'AWS S3 Static wado server',
    //     name: 'aws',
    //     wadoUriRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    //     qidoRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    //     wadoRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    //     qidoSupportsIncludeField: false,
    //     imageRendering: 'wadors',
    //     thumbnailRendering: 'wadors',
    //     enableStudyLazyLoad: true,
    //     supportsFuzzyMatching: false,
    //     supportsWildcard: true,
    //     staticWado: true,
    //     singlepart: 'bulkdata,video',
    //     // whether the data source should use retrieveBulkData to grab metadata,
    //     // and in case of relative path, what would it be relative to, options
    //     // are in the series level or study level (some servers like series some study)
    //     bulkDataURI: {
    //       enabled: true,
    //       relativeResolution: 'studies',
    //       transform: url => url.replace('/pixeldata.mp4', '/rendered'),
    //     },
    //     omitQuotationForMultipartRequest: true,
    //   },
    // },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif2',
      configuration: {
        friendlyName: 'AWS S3 Static wado secondary server',
        name: 'aws',
        wadoUriRoot: 'https://dd14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoRoot: 'https://dd14fa38qiwhyfd.cloudfront.net/dicomweb',
        wadoRoot: 'https://dd14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif3',
      configuration: {
        friendlyName: 'AWS S3 Static wado secondary server',
        name: 'aws',
        wadoUriRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
        qidoRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
        wadoRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
        omitQuotationForMultipartRequest: true,
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'local5000',
      configuration: {
        friendlyName: 'Static WADO Local Data',
        name: 'DCM4CHEE',
        qidoRoot: 'http://localhost:5000/dicomweb',
        wadoRoot: 'http://localhost:5000/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: true,
        supportsStow: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'video',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthanc',
      configuration: {
        friendlyName: 'local Orthanc DICOMWeb Server',
        name: 'DCM4CHEE',
        wadoUriRoot: 'http://localhost/pacs/dicom-web',
        qidoRoot: 'http://localhost/pacs/dicom-web',
        wadoRoot: 'http://localhost/pacs/dicom-web',
        qidoSupportsIncludeField: true,
        supportsReject: true,
        dicomUploadEnabled: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: {
          enabled: true,
          // This is an example config that can be used to fix the retrieve URL
          // where it has the wrong prefix (eg a canned prefix).  It is better to
          // just use the correct prefix out of the box, but that is sometimes hard
          // when URLs go through several systems.
          // Example URLS are:
          // "BulkDataURI" : "http://localhost/dicom-web/studies/1.2.276.0.7230010.3.1.2.2344313775.14992.1458058363.6979/series/1.2.276.0.7230010.3.1.3.1901948703.36080.1484835349.617/instances/1.2.276.0.7230010.3.1.4.1901948703.36080.1484835349.618/bulk/00420011",
          // when running on http://localhost:3003 with no server running on localhost.  This can be corrected to:
          // /orthanc/dicom-web/studies/1.2.276.0.7230010.3.1.2.2344313775.14992.1458058363.6979/series/1.2.276.0.7230010.3.1.3.1901948703.36080.1484835349.617/instances/1.2.276.0.7230010.3.1.4.1901948703.36080.1484835349.618/bulk/00420011
          // which is a valid relative URL, and will result in using the http://localhost:3003/orthanc/.... path
          // startsWith: 'http://localhost/',
          // prefixWith: '/orthanc/',
        },
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomwebproxy',
      sourceName: 'dicomwebproxy',
      configuration: {
        friendlyName: 'dicomweb delegating proxy',
        name: 'dicomwebproxy',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
  ],
  httpErrorHandler: error => {
    window.fetchErrors(error);
    // This is 429 when rejected from the public idc sandbox too often.
    console.warn(error.status);

    // Could use services manager here to bring up a dialog/modal if needed.
    // console.warn('test, navigate to https://ohif.org/');
  },
  whiteLabeling: {
    /* Optional: Should return a React component to be rendered in the "Logo" section of the application's Top Navigation bar */
    createLogoComponentFn: function (React) {
      return React.createElement('img', {
        // src: '../assets/logo_mdv.png',
        src: `${isMobile() ? './assets/logo_mdv_mobile.png' : './assets/logo_mdv.png'}`, //Produzione - build
        className: 'logo',
      });
    },
  },
  hotkeys: [
    {
      commandName: 'incrementActiveViewport',
      label: 'Next Viewport',
      keys: ['right'],
    },
    {
      commandName: 'decrementActiveViewport',
      label: 'Previous Viewport',
      keys: ['left'],
    },
    { commandName: 'rotateViewportCW', label: 'Rotate Right', keys: ['r'] },
    { commandName: 'rotateViewportCCW', label: 'Rotate Left', keys: ['l'] },
    { commandName: 'invertViewport', label: 'Invert', keys: ['i'] },
    {
      commandName: 'flipViewportHorizontal',
      label: 'Flip Horizontally',
      keys: ['h'],
    },
    {
      commandName: 'flipViewportVertical',
      label: 'Flip Vertically',
      keys: ['v'],
    },
    { commandName: 'scaleUpViewport', label: 'Zoom In', keys: ['+'] },
    { commandName: 'scaleDownViewport', label: 'Zoom Out', keys: ['-'] },
    { commandName: 'fitViewportToWindow', label: 'Zoom to Fit', keys: ['='] },
    { commandName: 'resetViewport', label: 'Reset', keys: ['space'] },
    { commandName: 'nextImage', label: 'Next Image', keys: ['down'] },
    { commandName: 'previousImage', label: 'Previous Image', keys: ['up'] },
    // {
    //   commandName: 'previousViewportDisplaySet',
    //   label: 'Previous Series',
    //   keys: ['pagedown'],
    // },
    // {
    //   commandName: 'nextViewportDisplaySet',
    //   label: 'Next Series',
    //   keys: ['pageup'],
    // },
    {
      commandName: 'setToolActive',
      commandOptions: { toolName: 'Zoom' },
      label: 'Zoom',
      keys: ['z'],
    },
    // ~ Window level presets
    {
      commandName: 'windowLevelPreset1',
      label: 'W/L Preset 1',
      keys: ['1'],
    },
    {
      commandName: 'windowLevelPreset2',
      label: 'W/L Preset 2',
      keys: ['2'],
    },
    {
      commandName: 'windowLevelPreset3',
      label: 'W/L Preset 3',
      keys: ['3'],
    },
    {
      commandName: 'windowLevelPreset4',
      label: 'W/L Preset 4',
      keys: ['4'],
    },
    {
      commandName: 'windowLevelPreset5',
      label: 'W/L Preset 5',
      keys: ['5'],
    },
    {
      commandName: 'windowLevelPreset6',
      label: 'W/L Preset 6',
      keys: ['6'],
    },
    {
      commandName: 'windowLevelPreset7',
      label: 'W/L Preset 7',
      keys: ['7'],
    },
    {
      commandName: 'windowLevelPreset8',
      label: 'W/L Preset 8',
      keys: ['8'],
    },
    {
      commandName: 'windowLevelPreset9',
      label: 'W/L Preset 9',
      keys: ['9'],
    },
  ],
  tours: [
    {
      id: 'basicViewerTour',
      route: '/viewer',
      // route: '/null',
      steps: [
        {
          id: 'scroll',
          title: 'Scrolling the images',
          text: 'Scroll the images with the mouse wheel or the scrollbar.',
          attachTo: {
            element: '.viewport-element',
            on: 'top',
          },
          advanceOn: {
            selector: '.cornerstone-viewport-element',
            event: 'CORNERSTONE_TOOLS_MOUSE_WHEEL',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        {
          id: 'zoom',
          title: 'Zooming in and out',
          text: 'Zoom with the right mouse button.',
          attachTo: {
            element: '.viewport-element',
            on: 'left',
          },
          advanceOn: {
            selector: '.cornerstone-viewport-element',
            event: 'CORNERSTONE_TOOLS_MOUSE_UP',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        {
          id: 'pan',
          title: "Panning the image",
          text: 'Pan with the middle mouse button.',
          attachTo: {
            element: '.viewport-element',
            on: 'top',
          },
          advanceOn: {
            selector: '.cornerstone-viewport-element',
            event: 'CORNERSTONE_TOOLS_MOUSE_UP',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        {
          id: 'windowing',
          title: 'Adjusting the window level',
          text: 'Change the window level by dragging with the left mouse button.',
          attachTo: {
            element: '.viewport-element',
            on: 'left',
          },
          advanceOn: {
            selector: '.cornerstone-viewport-element',
            event: 'CORNERSTONE_TOOLS_MOUSE_UP',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        {
          id: 'length',
          title: 'Using the measurement tools',
          text: 'Measure a region with the Length tool.',
          attachTo: {
            element: '[data-cy="MeasurementTools-split-button-primary"]',
            on: 'bottom',
          },
          advanceOn: {
            selector: '[data-cy="MeasurementTools-split-button-primary"]',
            event: 'click',
          },
          beforeShowPromise: () =>
            waitForElement('[data-cy="MeasurementTools-split-button-primary"]'),
        },
        {
          id: 'drawAnnotation',
          title: 'Drawing length annotations',
          text: 'Use the Length tool on the viewport to measure a region.',
          attachTo: {
            element: '.viewport-element',
            on: 'right',
          },
          advanceOn: {
            selector: 'body',
            event: 'event::measurement_added',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        {
          id: 'openMeasurementPanel',
          title: 'Opening the measurements panel',
          text: 'Click the measurements button to open the measurements panel.',
          attachTo: {
            element: '#trackedMeasurements-btn',
            on: 'left-start',
          },
          advanceOn: {
            selector: '#trackedMeasurements-btn',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('#trackedMeasurements-btn'),
        },
        {
          id: 'scrollAwayFromMeasurement',
          title: 'Scrolling away from a measurement',
          text: 'Scroll the images with the mouse wheel, away from the measurement.',
          attachTo: {
            element: '.viewport-element',
            on: 'left',
          },
          advanceOn: {
            selector: '.cornerstone-viewport-element',
            event: 'CORNERSTONE_TOOLS_MOUSE_WHEEL',
          },
          beforeShowPromise: () => waitForElement('.viewport-element'),
        },
        // {
        //   id: 'jumpToMeasurement',
        //   title: 'Jumping to a measurement from the panel',
        //   text: 'Click a measurement in the panel to jump to it.',
        //   attachTo: {
        //     element: '[data-cy="measurement-item"]',
        //     on: 'left-start',
        //   },
        //   advanceOn: {
        //     selector: '[data-cy="measurement-item"]',
        //     event: 'click',
        //   },
        //   beforeShowPromise: () => waitForElement('[data-cy="measurement-item"]'),
        // },
        {
          id: 'changeLayout',
          title: 'Changing the layout',
          text: 'Change the layout with the layout button.',
          attachTo: {
            element: '[data-cy="Layout"]',
            on: 'bottom',
          },
          advanceOn: {
            selector: '[data-cy="Layout"]',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('[data-cy="Layout"]'),
        },
        {
          id: 'selectMPRSeries',
          title: 'Select a series that can be reconstructed to apply the MPR layout',
          text: 'Select a series that can be reconstructed to apply the MPR layout',
          attachTo: {
            element: '.mpr-thumbnail',
            on: 'left-start',
          },
          advanceOn: {
            selector: '.mpr-thumbnail',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('.mpr-thumbnail'),
        },
        {
          id: 'selectLayout',
          title: 'Select the MPR layout',
          text: 'Choose the MPR layout to read the images on three planes.',
          attachTo: {
            element: '[data-cy="LayoutMPR"]',
            on: 'left-start',
          },
          advanceOn: {
            selector: '[data-cy="LayoutMPR"]',
            event: 'click',
          },
          beforeShowPromise: () => waitForElement('[data-cy="LayoutMPR"]'),
        },
      ],

      tourOptions: {
        useModalOverlay: true,
        defaultStepOptions: {
          buttons: [
            {
              text: 'Skip all',
              action() {
                this.complete();
              },
              secondary: true,
            },
          ],
        },
      },
    },
  ],
};

function waitForElement(selector, maxAttempts = 20, interval = 25) {
  return new Promise(resolve => {
    let attempts = 0;

    const checkForElement = setInterval(() => {
      const element = document.querySelector(selector);

      if (element || attempts >= maxAttempts) {
        clearInterval(checkForElement);
        resolve();
      }

      attempts++;
    }, interval);
  });
}
