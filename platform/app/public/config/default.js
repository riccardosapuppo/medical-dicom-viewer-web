// @ts-nocheck
/** @type {AppTypes.Config} */
// @ts-ignore
let prefetch = new URLSearchParams(new URL(window.location.href).search).get('prefetch');
let dicomLoad = new URLSearchParams(new URL(window.location.href).search).get('dicomload');
let hdnDicomLoad = new URLSearchParams(new URL(window.location.href).search).get('fZG');
let useCPURendering = new URLSearchParams(new URL(window.location.href).search).get('usecpu');
const modality = new URLSearchParams(new URL(window.location.href).search).get('Modality');
window.mdvStudyInstanceUIDs = new URLSearchParams(new URL(window.location.href).search).get(
  'StudyInstanceUIDs'
);
window.mdvStudyDescription = new URLSearchParams(new URL(window.location.href).search).get(
  'StudyDescription'
);
window.mdvModality = new URLSearchParams(new URL(window.location.href).search).get('Modality');
window.mdvAETitle = new URLSearchParams(new URL(window.location.href).search).get('aetitle');
window.mdvUsername = new URLSearchParams(new URL(window.location.href).search).get('User');
window.mdvToken = new URLSearchParams(new URL(window.location.href).search).get('Token');
let origin = window.location.origin;

window.isSuite = true;
// Attenzione: in build di produzione webpack forza window.isSuite = false ANCHE sul deploy
// della suite (li' basta l'origin deployata). Per capire a runtime se siamo davvero nella
// suite serve quindi guardare l'hostname, non il solo flag di build.
window.isSuiteRuntime = window.isSuite || /(^|\.)suite\./i.test(window.location.hostname);
// Tab "Storico remoto": ha senso solo dalla suite, dove lo storico del paziente puo' essere
// ancora sul PACS del centro. Sull'installazione del centro la tab non serve.
window.storicoRemoto = window.isSuiteRuntime;
window.portableVersion = false;
window.gestioneMultiMonitor = true;
window.mostraErroriFrontend = false //Qualcosa è andato storto errore

// The demonstration archive, served by Orthanc and reached through the
// development proxy: same origin, so no cross-origin headers to configure on
// the archive and no preflight on hundreds of image requests.
let qidoRoot = '/pacs/dicom-web';
let wadoRoot = '/pacs/dicom-web';

window.qidoUrl = qidoRoot;

//Fix vecchio link
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
  showStudyList: false,
  enablePrintBuilder: true,
  // Permette di usare gli strumenti (Pan/WindowLevel/ecc.) direttamente su una
  // viewport non attiva: il primo trascinamento la rende attiva E applica subito
  // lo strumento, evitando il doppio click (attiva-poi-usa). Default OHIF: true.
  activateViewportBeforeInteraction: false,
  // Mostra i cursori SVG specifici dello strumento attivo (es. il mirino verde
  // del Window Level, la manina del Pan) su TUTTE le viewport, per coerenza con
  // le celle della Sottogriglia. Default OHIF: false (cursore di sistema).
  useCursors: true,
  // Scale web workers to CPU cores (capped at 7 to leave 1 core for UI thread).
  // More workers = faster DICOM decode throughput when scrolling large series.
  maxNumberOfWebWorkers: Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 2), 7),
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  strictZSpacingForVolumeViewport: true,
  useSharedArrayBuffer: `${origin.includes('https') ? 'TRUE' : 'FALSE'}`,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: true,
  useExperimentalUI: true,
  autoImageSliceSync: true,
  useCPURendering: useCPURendering ? true : false,
  mdvExtensionBrowserUrl: 'https://chrome.google.com/webstore/detail/REPLACE_ME',
  mostraavvisoEstensioneMdvBrowserNonInstallata: false,
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
        friendlyName: 'AWS S3 Static wado server',
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
    window.erroriFetch(error);
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
          title: 'Scorrere le Immagini',
          text: 'Puoi scorrere le immagini utilizzando la rotellina del mouse o la barra di scorrimento',
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
          title: 'Zoomare In e Out',
          text: 'Puoi zoomare sulle immagini utilizzando il clic destro del mouse.',
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
          title: "Spostare l'Immagine",
          text: 'Puoi spostare le immagini utilizzando il clic centrale del mouse.',
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
          title: 'Regolare il Livello della Finestra',
          text: 'Puoi modificare il livello della finestra utilizzando il clic sinistro del mouse.',
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
          title: 'Utilizzo degli Strumenti di Misurazione',
          text: 'Puoi misurare la lunghezza di una regione utilizzando lo strumento Lunghezza.',
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
          title: 'Disegnare Annotazioni di Lunghezza',
          text: 'Usa lo strumento lunghezza sul viewport per misurare la lunghezza di una regione.',
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
          title: 'Aprire il Pannello delle Misurazioni',
          text: 'Clicca sul pulsante delle misurazioni per aprire il pannello delle misurazioni.',
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
          title: 'Scorrere Lontano da una Misurazione',
          text: 'Scorri le immagini usando la rotellina del mouse lontano dalla misurazione.',
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
        //   title: 'Saltare alle Misurazioni nel Pannello',
        //   text: 'Clicca sulla misurazione nel pannello delle misurazioni per saltare ad essa.',
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
          title: 'Cambiare il Layout',
          text: 'Puoi cambiare il layout del visualizzatore usando il pulsante di layout.',
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
          title: 'Selezionare una serie ricostruibile per appicare il Layout MPR',
          text: 'Selezionare una serie ricostruibile per appicare il Layout MPR',
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
          title: 'Selezionare il Layout MPR',
          text: 'Seleziona il layout MPR per visualizzare le immagini in modalità MPR.',
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
              text: 'Salta tutto',
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
