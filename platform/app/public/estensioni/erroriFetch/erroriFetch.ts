declare global {
  interface Window {
    erroriFetch: (error: unknown) => void;
    // StudyInstanceUIDs dell'URL, valorizzato in config/default.js
    mdvStudyInstanceUIDs?: string;
  }
}

window.erroriFetch = error => {
  const message = typeof error === 'string' ? error : error?.message;
  if (!message) {
    return;
  }
  // L'overlay a tutto schermo blocca la sessione: ha senso solo se a fallire e' lo studio
  // effettivamente aperto. Se l'errore riguarda una serie dello storico (sul cloud o
  // remoto) l'utente sta solo sfogliando, e bloccarlo sarebbe sbagliato oltre che
  // fuorviante: un centro irraggiungibile non e' una sessione scaduta.
  const studyUIDDallErrore = message.match(/studies\/([0-9.]+)/);
  if (studyUIDDallErrore) {
    const studiPrimari = `${window.mdvStudyInstanceUIDs || ''}`
      .split(',')
      .map(uid => uid.trim())
      .filter(Boolean);
    if (studiPrimari.length && !studiPrimari.includes(studyUIDDallErrore[1])) {
      return;
    }
  }

  if (
    message.includes("Couldn't retrieve") &&
    message.includes('frames/')
  ) {
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
        <p>Sessione scaduta</p>
      </div>
    `
    );
  }
};

export { };
