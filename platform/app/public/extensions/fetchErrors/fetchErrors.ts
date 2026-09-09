declare global {
  interface Window {
    fetchErrors: (error: unknown) => void;
    // StudyInstanceUIDs from the URL, filled in by config/default.js
    mdvStudyInstanceUIDs?: string;
    config?: { fetchErrorMessage?: string };
  }
}

/**
 * What to say when the images do not arrive.
 *
 * "Session expired" is true where there is a session: in front of an archive that answers
 * only while a token is still good, a failure on the images is nearly always that. But
 * this same page also runs inside the desktop application, which reads a folder off a
 * disc and has no session to expire, and there the sentence is simply false, written
 * across the whole screen over a study that was visible a moment earlier.
 *
 * So the message is decided by whoever hosts the page, and the default stays what it was.
 */
const DEFAULT_MESSAGE = 'Session expired';

/** The message goes inside HTML, so it does not go in as markup. */
function escaped(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
}

window.fetchErrors = error => {
  const message = typeof error === 'string' ? error : error?.message;
  if (!message) {
    return;
  }
  // The full-screen overlay blocks the session, which only makes sense when what failed
  // is the study actually open. If the error is about a series from the priors, the
  // reader is only browsing, and stopping them would be wrong as well as misleading: a
  // prior study that does not arrive is not an expired session.
  const studyInTheError = message.match(/studies\/([0-9.]+)/);
  if (studyInTheError) {
    const studyOnScreen = `${window.mdvStudyInstanceUIDs || ''}`
      .split(',')
      .map(uid => uid.trim())
      .filter(Boolean);
    if (studyOnScreen.length && !studyOnScreen.includes(studyInTheError[1])) {
      return;
    }
  }

  if (
    message.includes("Couldn't retrieve") &&
    message.includes('frames/')
  ) {
    const message = escaped(window.config?.fetchErrorMessage || DEFAULT_MESSAGE);

    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div id="error-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 2em;
        z-index: 9999;
      ">
        <p>${message}</p>
      </div>
    `
    );
  }
};

export { };
