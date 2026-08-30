/**
 * Whether this browser will give the viewer a 3D context.
 *
 * Image display is built on WebGL. When it is unavailable the rendering
 * library asks for a context, gets null, and then wraps that null in a Proxy,
 * which throws "Cannot create proxy with a non-object as target or handler"
 * over a blank page: an error that says nothing about the cause to anyone who
 * has not read that library. Asking first, and telling the viewer to draw on
 * the CPU instead, means the studies still open. Reformatting in three planes
 * needs the GPU and stays unavailable, which is worth knowing rather than
 * discovering.
 *
 * The usual causes are hardware acceleration turned off in the browser, and
 * too many live WebGL contexts across open tabs, which browsers cap.
 */
const hasWebGL = (() => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
})();

if (!hasWebGL) {
  console.warn(
    "No WebGL context available: drawing on the CPU. " +
      "Three-plane reformatting and volume rendering need the GPU and will stay off. " +
      "Check hardware acceleration in the browser settings, and close other tabs " +
      "using WebGL, since browsers cap how many contexts may be live at once."
  );
}
/**
 * Viewer configuration for this demonstration.
 *
 * The images are served by the Orthanc container in docker-compose.yml. The
 * DICOMweb roots are relative rather than absolute because the development
 * server proxies /pacs/dicom-web through to the archive, which makes every
 * request same-origin: no cross-origin headers to configure, and none of the
 * cache and credential surprises that come with them.
 *
 * @type {AppTypes.Config}
 */
window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  showStudyList: true,
  maxNumberOfWebWorkers: 3,
  showLoadingIndicator: true,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: true,
  strictZSpacingForVolumeViewport: true,

  // Set from the probe above rather than hard-coded: a machine with a GPU keeps
  // the GPU path, and one without still opens the studies.
  useCPURendering: !hasWebGL,

  /**
   * The application carries its own name, in both the study list and the
   * viewer. OHIF is MIT licensed and permits this; what it requires is that the
   * copyright and licence travel with the work, which they do, in
   * THIRD_PARTY_NOTICES.md and in the README, where the viewer this is built on
   * is named in the first sentence. Rebranding the interface is not the same as
   * claiming the authorship, and the documentation is explicit about which is
   * which.
   *
   * The mark is only the name. A longer one was tried and measured at 220px
   * against a toolbar whose buttons start at the left edge of the same bar: it
   * sat underneath them. Anything more than the name belongs in the README,
   * which is where it can actually be read.
   */
  whiteLabeling: {
    createLogoComponentFn: React =>
      React.createElement(
        'span',
        { className: 'rw-wordmark', title: 'Medical DICOM Viewer (Web)' },
        React.createElement('strong', null, 'Medical DICOM Viewer')
      ),
  },
  /**
   * The viewer's own modal warning is turned off, and the same thing is said in
   * the header instead, where it stays visible rather than being dismissed once
   * and forgotten. Turning it off to say nothing would not have been honest;
   * this says it in this application's own words, permanently.
   */
  investigationalUseDialog: {
    option: 'never',
  },

  defaultDataSourceName: 'orthanc',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthanc',
      configuration: {
        friendlyName: 'Demonstration archive',
        name: 'Orthanc',
        wadoUriRoot: '/pacs/dicom-web',
        qidoRoot: '/pacs/dicom-web',
        wadoRoot: '/pacs/dicom-web',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: {
          enabled: true,
        },
      },
    },
  ],
};
