declare global {
  interface Window {
    erroriFetch: (error: unknown) => void;
    // StudyInstanceUIDs dell'URL, valorizzato in config/default.js
    mdvStudyInstanceUIDs?: string;
    config?: { fetchErrorMessage?: string };
  }
}

/**
 * Che cosa dire quando le immagini non arrivano.
 *
 * "Sessione scaduta" e' vero dove c'e' una sessione: qui davanti a un archivio
 * che risponde solo a chi ha ancora un token, un fallimento sulle immagini e'
 * quasi sempre quello. Ma questa stessa pagina gira anche dentro
 * l'applicazione desktop, che legge una cartella da un disco e non ha nessuna
 * sessione da far scadere — e li' quella frase e' semplicemente falsa, scritta
 * a tutto schermo sopra uno studio che un attimo prima si vedeva.
 *
 * Cosi' il messaggio lo decide chi ospita la pagina, e il valore predefinito
 * resta quello di prima.
 */
const MESSAGGIO_PREDEFINITO = 'Sessione scaduta';

/** Il messaggio finisce dentro dell'HTML, quindi non ci entra come markup. */
function testo(valore: string): string {
  return valore
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
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
    const messaggio = testo(window.config?.fetchErrorMessage || MESSAGGIO_PREDEFINITO);

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
        <p>${messaggio}</p>
      </div>
    `
    );
  }
};

export { };
