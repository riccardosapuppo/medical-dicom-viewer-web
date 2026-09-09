/**
 * Generates the rendered URL that can be used for direct retrieve of the pixel data binary stream.
 *
 * @param {object} config - The configuration object.
 * @param {string} config.wadoRoot - The root URL for the WADO service.
 * @param {object} params - The parameters object.
 * @param {string} params.tag - The tag name of the URL to retrieve.
 * @param {string} params.defaultPath - The path for the pixel data URL.
 * @param {object} params.instance - The instance object that the tag is in.
 * @param {string} params.defaultType - The mime type of the response.
 * @param {string} params.singlepart - The type of the part to retrieve.
 * @param {string} params.fetchPart - Unknown parameter.
 * @param {string} params.url - Unknown parameter.
 * @returns {string|Promise<string>} - An absolute URL to the binary stream.
 */
const createRenderedRetrieve = (config, params) => {
  const { wadoRoot } = config;
  const { instance, tag = 'PixelData' } = params;
  const { StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID } = instance;
  const bulkDataURI = instance[tag]?.BulkDataURI ?? '';

  if (bulkDataURI?.indexOf('?') !== -1) {
    // The value instance has parameters, so it should not revert to the rendered
    return;
  }

  if (tag === 'PixelData' || tag === 'EncapsulatedDocument') {
    const base = `${wadoRoot}/studies/${StudyInstanceUID}/series/${SeriesInstanceUID}/instances/${SOPInstanceUID}/rendered`;

    // The AE title picks the archive's partition, and it is not part of DICOMweb: this
    // fork adds it. Interpolating it always meant sending "?aetitle=undefined" whenever
    // the page did not carry one. That is a literal string, not an empty parameter, and a
    // partitioned archive takes it for a partition's name and goes looking for it. When
    // there is none, the address stays what the standard asks for.
    return window.mdvAETitle ? `${base}?aetitle=${window.mdvAETitle}` : base;
  }
};

export default createRenderedRetrieve;
