/**
 * Hiding the text burned over the image.
 *
 * Every viewport carries patient, series and window information in its corners.
 * It is needed nearly always and in the way occasionally: when the finding is
 * at the edge of the image, or when the study is being shown to somebody.
 * Hiding it is a display preference rather than viewer state, so it lives as a
 * class on the document and a rule in the stylesheet, and applies to every
 * viewport at once.
 */

const HIDDEN_CLASS = 'rw-overlays-hidden';

export function isStudyInformationHidden(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains(HIDDEN_CLASS);
}

export function toggleStudyInformation(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.body.classList.toggle(HIDDEN_CLASS);
}
