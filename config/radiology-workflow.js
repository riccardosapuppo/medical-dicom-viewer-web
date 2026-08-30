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

  /**
   * The application carries its own name, in both the study list and the
   * viewer. OHIF is MIT licensed and permits this; what it requires is that the
   * copyright and licence travel with the work, which they do, in
   * THIRD_PARTY_NOTICES.md and in the README, where the viewer this is built on
   * is named in the first sentence. Rebranding the interface is not the same as
   * claiming the authorship, and the documentation is explicit about which is
   * which.
   */
  whiteLabeling: {
    createLogoComponentFn: React =>
      React.createElement(
        'div',
        { className: 'flex items-center gap-3' },
        React.createElement(
          'span',
          { className: 'rw-wordmark' },
          React.createElement('strong', null, 'Medical DICOM Viewer'),
          React.createElement('span', null, 'Web')
        ),
        React.createElement(
          'span',
          { className: 'rw-disclaimer hidden md:inline' },
          'Demonstration on public research images. Not a medical device.'
        )
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
