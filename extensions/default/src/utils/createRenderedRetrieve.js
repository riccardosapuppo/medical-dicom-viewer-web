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

    // L'aetitle sceglie la partizione dell'archivio, e non fa parte di DICOMweb:
    // lo aggiunge questo fork. Interpolarlo sempre significava spedire
    // "?aetitle=undefined" ogni volta che la pagina non lo porta - una stringa
    // letterale, non un parametro vuoto, che un archivio partizionato prende per
    // il nome di una partizione e va a cercare. Se non c'e', l'indirizzo resta
    // quello che chiede lo standard.
    return window.mdvAETitle ? `${base}?aetitle=${window.mdvAETitle}` : base;
  }
};

export default createRenderedRetrieve;
