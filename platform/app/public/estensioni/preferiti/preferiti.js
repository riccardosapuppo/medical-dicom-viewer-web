/* eslint-disable default-case */
import saveHP from '../saveHP';

/*
======================================================
= POPUP PER VISUALIZZARE LE IMMAGINI DEI PREFERITI
======================================================
*/
window.viewPreferitoPopup = imgSrc => {
  const w = window.innerWidth * 0.8;
  const h = window.innerHeight * 0.8;
  const popup = window.open('', '_blank', `width=${w},height=${h}`);
  popup.document.write(`
    <img src="${imgSrc}" style="width:100%;height:auto;background:#000;margin:0;">
  `);
  popup.document.close();
};

/*
======================================================
= FUNZIONE GLOBALE PER RIMUOVERE UN PREFERITO
======================================================
*/
window.rimuoviPreferito = sopUID => {
  if (!window.preferiti) return;

  // Rimuovi dalla lista globale
  window.preferiti = window.preferiti.filter(p => p.SOPInstanceUID !== sopUID);
  window.dispatchEvent(new Event('mdv-preferiti-updated'));

  // Aggiorna pannello se aperto
  const area = document.getElementById('area-lista-preferiti');
  if (area) {
    area.innerHTML = '';

    window.preferiti.forEach(p => {
      area.insertAdjacentHTML(
        'beforeend',
        `
        <div style="margin-bottom:10px;border-bottom:1px solid #374151;padding-bottom:10px;">
          <img src="${p.DataUrl}"
                onclick="window.viewPreferitoPopup('${p.DataUrl}')"
                style="width:100%;max-height:180px;object-fit:contain;cursor:pointer;">
          <p>Serie ${p.NumeroSerie} - ${p.DescrizioneSerie}</p>
          <p>N° Istanza: ${p.NumeroIstanza}</p>

          <button onclick="window.rimuoviPreferito('${p.SOPInstanceUID}')"
                  style="margin-top:6px;padding:0px 10px;background:#b91c1c;
                         color:white;border:none;border-radius:4px;cursor:pointer;">
             Rimuovi preferito
          </button>
        </div>
        `
      );
    });
  }
};

/*
======================================================
= VARIABILI GLOBALI DELLA MODALE STIMULSOFT
======================================================
*/
let stimulsoftLoaded = false;
let stimulsoftModal = null;
let stimulsoftIframe = null;
const isPrintBuilderEnabled = window?.config?.enablePrintBuilder !== false;

/*
======================================================
= CREA MODALE + IFRAME ALL’AVVIO (PRECARICATO)
======================================================
*/
function createStimulsoftModalAtStartup() {
  if (!isPrintBuilderEnabled) {
    return;
  }
  if (stimulsoftModal) return; // evitare doppie creazioni

  // --- MODALE ---
  stimulsoftModal = document.createElement('div');
  stimulsoftModal.id = 'stimulsoft-modal';
  stimulsoftModal.style = `
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(4px);
    z-index: 99999999;
    display: none;
    flex-direction: column;
    opacity: 0;
    transition: opacity .25s;
  `;

  // --- HEADER ---
  const header = document.createElement('div');
  header.style = `
    height: 48px;
    background: #000;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 15px;
    border-bottom: 1px solid #282828;
  `;
  header.innerHTML = `
    <span style="font-size:15px;">Editor di Stampa</span>
    <span id="close-stimulsoft-modal" style="cursor:pointer;font-size:22px;">✕</span>
  `;

  // --- LOADER UNA SOLA VOLTA ---
  const spinner = document.createElement('div');
  spinner.id = 'loader-stimulsoft';
  spinner.style = `
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    border: 6px solid #ffffff30;
    border-top: 6px solid #fff;
    border-radius: 50%;
    width: 45px; height: 45px;
    animation: spin 0.6s linear infinite;
    z-index: 10;
  `;

  // --- IFRAME PRECARICATO ---
  stimulsoftIframe = document.createElement('iframe');
  stimulsoftIframe.id = "stimulsoft-iframe";
  stimulsoftIframe.src = "/viewer/print/builder.html";
  stimulsoftIframe.style = `
    flex: 1;
    width: 100%;
    height: calc(100% - 48px);
    border: none;
    background: #000;
  `;

  stimulsoftIframe.onload = () => {
    stimulsoftLoaded = true;
    spinner.style.display = "none";
  };

  // compongo modale
  stimulsoftModal.appendChild(header);
  stimulsoftModal.appendChild(spinner);
  stimulsoftModal.appendChild(stimulsoftIframe);
  document.body.appendChild(stimulsoftModal);

  // --- CHIUSURA ---
  document.getElementById('close-stimulsoft-modal').onclick = () => {
    stimulsoftModal.style.opacity = 0;
    setTimeout(() => (stimulsoftModal.style.display = 'none'), 200);
  };

  // keyframes
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes spin {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// PRELOAD "SU USO" DELLA MODALE STIMULSOFT
// ------------------------------------------------------------
// `builder.html` carica ~12 MB di JavaScript Stimulsoft. Per evitare
// del tutto di rallentare l'esperienza utente durante la normale
// navigazione DICOM, NON precarichiamo Stimulsoft a window.load.
// Aspettiamo invece il SEGNALE CONCRETO che l'utente sta per usare
// la stampa: il PRIMO salvataggio di un preferito. Solo a quel punto
// schedule del preload con idle callback.
//
// Flow:
//  1) Default.js: enablePrintBuilder=false → NIENTE viene mai caricato
//  2) Default.js: enablePrintBuilder=true + utente non salva preferiti
//     → NIENTE Stimulsoft viene caricato (zero overhead)
//  3) Utente clicca stellina per salvare il primo preferito
//     → scatta l'evento mdv-preferiti-updated con lista non vuota
//     → partiamo con idle preload (se il browser è idle) o 1s fallback
//  4) Utente clicca "Apri Editor di Stampa" PRIMA che il preload finisca
//     → lazy fallback in openStimulsoftDesigner lo crea on-demand
//
// Il bottone "Apri Editor di Stampa" nella sidebar compare solo se
// hasPreferiti, quindi il flusso "salva → apri editor" è naturalmente
// ordinato: quando cliccano "Apri Editor", il preload è già partito
// dal save del preferito.
// ============================================================
function schedulePreloadStimulsoftModal() {
  if (!isPrintBuilderEnabled) return;
  if (stimulsoftModal) return; // già creato

  const start = () => {
    if (stimulsoftModal) return;
    createStimulsoftModalAtStartup();
  };

  if ('requestIdleCallback' in window) {
    // Carica solo quando il browser è davvero idle, con timeout
    // di 15s come safety net (se l'utente sta usando l'app
    // intensamente, alla fine carichiamo comunque)
    window.requestIdleCallback(start, { timeout: 15000 });
  } else {
    // Safari/old browsers: fallback su un piccolo delay
    setTimeout(start, 1000);
  }
}

// Trigger: il PRIMO mdv-preferiti-updated che porta la lista a >= 1
// preferito. Dopo il primo trigger, rimuoviamo il listener: il preload
// parte una sola volta per sessione.
if (isPrintBuilderEnabled) {
  const onFirstPreferitoSet = () => {
    const list = window.preferiti;
    if (!Array.isArray(list) || list.length === 0) {
      // Evento arrivato ma la lista è vuota (es. rimozione): aspettiamo
      // il prossimo add.
      return;
    }
    window.removeEventListener('mdv-preferiti-updated', onFirstPreferitoSet);
    schedulePreloadStimulsoftModal();
  };
  window.addEventListener('mdv-preferiti-updated', onFirstPreferitoSet);
}

// ============================================================
// BRIDGE: mdv-preferiti-updated → refresh-preferiti sull'iframe
// ------------------------------------------------------------
// Quando `window.preferiti` cambia (aggiunta/rimozione preferito, OPPURE
// ri-cattura automatica a seguito di modifiche alle annotazioni), vogliamo
// che l'editor di stampa (se aperto) ricomponga subito le celle con i
// nuovi PNG. Il builder ascolta solo `postMessage({type:"refresh-preferiti"})`
// dall'iframe, quindi facciamo noi da bridge: catturiamo l'evento globale
// `mdv-preferiti-updated` e lo inoltriamo all'iframe.
//
// Debounce 300ms: un burst di eventi (es. molti ANNOTATION_MODIFIED durante
// un drag) genera un solo refresh al termine.
if (isPrintBuilderEnabled) {
  let bridgeTimer = null;
  window.addEventListener('mdv-preferiti-updated', () => {
    if (!stimulsoftLoaded || !stimulsoftIframe || !stimulsoftIframe.contentWindow) {
      return;
    }
    if (bridgeTimer) clearTimeout(bridgeTimer);
    bridgeTimer = setTimeout(() => {
      try {
        stimulsoftIframe.contentWindow.postMessage({ type: 'refresh-preferiti' }, '*');
      } catch (_) {
        /* iframe non pronto o distrutto: ignora */
      }
    }, 300);
  });
}

/*
======================================================
= APERTURA EDITOR DI STAMPA
======================================================
*/
const openStimulsoftDesigner = () => {
  if (!isPrintBuilderEnabled) {
    console.warn('Stampa disabilitata: apertura editor annullata');
    return;
  }

  // LAZY FALLBACK: se l'idle preload non è ancora partito (l'utente
  // ha cliccato troppo in fretta), creiamo la modale on-demand qui.
  // Lo spinner della modale rimarrà visibile finché l'iframe finisce
  // di caricare i pack Stimulsoft.
  if (!stimulsoftModal) {
    createStimulsoftModalAtStartup();
  }
  if (!stimulsoftModal) {
    console.error('Impossibile creare la modale di stampa');
    return;
  }

  // I dati (in particolare 'preferiti' con DataUrl base64) possono superare la quota
  // di localStorage (~5MB). L'iframe è same-origin, quindi il builder può leggere
  // direttamente da window.parent.preferiti / mdvPatientInfo / mdvStudyInfo.
  // Niente serializzazione, niente quota.

  if (stimulsoftLoaded) {
    stimulsoftIframe.contentWindow.postMessage({ type: "refresh-preferiti" }, "*");
  }

  stimulsoftModal.style.display = "flex";
  requestAnimationFrame(() => (stimulsoftModal.style.opacity = 1));
};

// Esposto per il pulsante "Stampa" della toolbar (comando apriEditorStampa in
// commandsModule). Apre l'editor anche senza preferiti: il selettore interno
// (Preferiti/Serie/Studio) ripiega automaticamente su Serie quando la lista
// preferiti è vuota.
window.openStimulsoftDesigner = openStimulsoftDesigner;

/*
======================================================
= MESSAGGI DAL BUILDER
======================================================
*/
window.addEventListener('message', e => {
  if (e.data?.type === "refresh-preferiti") {
    const favList = document.getElementById('fav-list');
    if (!favList) return;

    favList.innerHTML = '';
    const pref = Array.isArray(window.preferiti) ? window.preferiti : [];

    pref.forEach(p => {
      const img = document.createElement('img');
      img.src = p.DataUrl;
      img.style = "width:100%;margin-bottom:10px;border:1px solid #333;cursor:pointer;";
      favList.appendChild(img);
    });
  }
});

/*
======================================================
= INIT BUTTON SU OHIF
======================================================
*/
const preferitiInitInterval = () => {
  const intv = setInterval(() => {
    const btn = document.getElementById('trackedMeasurements-btn');
    if (btn) {
      clearInterval(intv);
      injectPreferitiBtn();
    }
  }, 100);
  setTimeout(() => clearInterval(intv), 10000);
};

const injectPreferitiBtn = () => {
  if (document.getElementById('preferiti-btn')) return;

  const tracked = document.getElementById('trackedMeasurements-btn');

  tracked.parentElement.insertAdjacentHTML(
    'afterend',
    `<div id="preferiti-btn" class="text-primary-active hover:cursor-pointer">
        <img style="width:22px" src="./assets/preferiti.png" />
     </div>`
  );

  document.getElementById('preferiti-btn').addEventListener('click', createPreferitiFunc);
};

/*
======================================================
= PANNELLO PREFERITI LATERALE
======================================================
*/
const createPreferitiFunc = () => {
  if (document.getElementById('preferiti-tools')) return;

  const hasPreferiti = window.preferiti && window.preferiti.length > 0;

  const html = `
    <div id="preferiti-tools" style="
      position:fixed;
      top:0; left:100%;
      width:${window.sonoUnoStorico ? '40%' : '20%'};
      height:100%;
      background:#111;
      color:#fff;
      z-index:99998;
      transition:left .25s ease-out;
      padding:10px;
      overflow-y:auto;
    ">

      <div style="display:flex;gap:10px;align-items:center;">
        <img id="chiudi-button" src="./assets/right-arrow.png"
             style="width:22px;cursor:pointer;">
        <p>${window.sonoUnoStorico ? 'Preferiti storico' : 'Preferiti'}</p>
      </div>

      ${hasPreferiti && isPrintBuilderEnabled
      ? `<button id="btn-open-stimulsoft"
                   style="margin:10px 0; padding:8px 12px;
                          background:#e5e7eb; color:#111;
                          border:none; border-radius:4px; cursor:pointer;">
                Apri Editor di Stampa
           </button>`
      : (!hasPreferiti
        ? `<p style="margin:15px 0; color:#aaa; font-size:13px;">
               Aggiungi almeno un preferito per abilitarne la stampa.
             </p>`
        : '')
    }

      <div id="area-lista-preferiti"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const panel = document.getElementById('preferiti-tools');
  const area = document.getElementById('area-lista-preferiti');

  if (hasPreferiti && isPrintBuilderEnabled) {
    document.getElementById('btn-open-stimulsoft').onclick = openStimulsoftDesigner;
  }

  if (hasPreferiti) {
    window.preferiti.forEach(p => {
      area.insertAdjacentHTML(
        'beforeend',
        `
        <div style="margin-bottom:10px;border-bottom:1px solid #374151;padding-bottom:10px;">
          <img src="${p.DataUrl}"
               onclick="window.viewPreferitoPopup('${p.DataUrl}')"
               style="width:100%;max-height:180px;object-fit:contain;cursor:pointer;">
          <p>Serie ${p.NumeroSerie} - ${p.DescrizioneSerie}</p>
          <p>N° Istanza: ${p.NumeroIstanza}</p>

          <button onclick="window.rimuoviPreferito('${p.SOPInstanceUID}')"
                  style="margin-top:6px;padding:0px 10px;
                         background:#b91c1c;color:white;
                         border:none;border-radius:4px;
                         cursor:pointer;">
             Rimuovi preferito
          </button>
        </div>
        `
      );
    });
  }

  // animazione apertura
  setTimeout(() => {
    panel.style.left = window.sonoUnoStorico ? '60%' : '80%';
  }, 10);

  document.getElementById('chiudi-button').onclick = () => {
    panel.style.left = '100%';
    setTimeout(() => panel.remove(), 250);
  };
};

/*
======================================================
= RE-INIT SU EVENTI OHIF
======================================================
*/
if (!window.portableVersion) {
  window.addEventListener('panelOpen', e => {
    if (!e.detail.isOpen && e.detail.side !== 'left') {
      preferitiInitInterval();
    }
  });
}
