/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { riadattaFinestraSuPiuMonitor } from './riadattaFinestraSuPiuMonitor';
import { ripristinoVisualizzazioneSuUnMonitor } from './ripristinoVisualizzazioneSuUnMonitor';

let estensioneMonitorControllata = false;
let versioneEstensioneInstallata = '';
let monitors = [];
let configAttuale;
let abilitaPulsanteEliminazione = true;

const gestioneMonitorInitInterval = () => {
  if (!estensioneMonitorControllata) {
    estensioneMonitorControllata = true;
    isExtensionInstalled();
    // caricaConfigurazioneMonitor();
  }

  const intervalMonitorExt = setInterval(() => {
    if (document.getElementById('trackedMeasurements-btn')) {
      clearInterval(intervalMonitorExt);
      injectMonitorBtn();
    }
  }, 100);

  //A prescindere blocco l'intervallo check dopo un tot per performance
  setTimeout(() => {
    clearInterval(intervalMonitorExt);
  }, 10000);
};

const injectMonitorBtn = () => {
  if (document.getElementById('monitor-btn') || !window.gestioneMultiMonitor) {
    return;
  }
  //Attacco pulsante sotto quello delle misurazioni nel pannello a dx
  document.getElementById('trackedMeasurements-btn').parentElement.insertAdjacentHTML(
    'afterend',
    `
    <div id="monitor-btn"
    class="text-primary-active hover:cursor-pointer">
    <img style="width:22px" src="./assets/monitor.png" />
    </div>
    `
  );
  const gestioneMonitorBtn = document.getElementById('monitor-btn');
  gestioneMonitorBtn.addEventListener('click', monitorMainFunc);
};

// Ogni volta che il pannello si apre/chiude perdo l'estensione creata. Intercetto l'evento apertura/chiusura e ricreo
if (!window.portableVersion) {
  window.addEventListener('panelOpen', function (event) {
    if (!event.detail.isOpen && event.detail.side !== 'left') {
      gestioneMonitorInitInterval();
    }
  });
}

async function monitorMainFunc() {
  const monitorToolsHtml = `
    <div id="monitor-tools">
        <div id="intestazione">
        <img id="chiudi-monitor-button" style="width:22px" src="./assets/right-arrow.png" />
        <p>Gestione monitor</p>
        </div>
           <div id="main-area-monitor">
           <p style="${versioneEstensioneInstallata !== '' ? 'display:block' : 'display:none'}" id="info-versione-estensione">Versione estensione del browser: ${versioneEstensioneInstallata}</p>
            <p id="avvisi-gestione-monitor"></p>
            <a id="scarica-estensione-btn" href="/extension" style="display:${versioneEstensioneInstallata === '' ? 'block' : 'none'}">Scarica estensione</a>
            <div id="tutorial-installazione" style="display:${versioneEstensioneInstallata === '' ? 'block' : 'none'}">
              <p class="tutorial-titolo">Come installarla:</p>
              <ol>
                <li>Decomprimi lo zip scaricato in una cartella sul computer</li>
                <li>Copia <code class="tutorial-url" data-url="chrome://extensions">chrome://extensions</code> (o <code class="tutorial-url" data-url="edge://extensions">edge://extensions</code> su Edge) e incollalo nella barra degli indirizzi</li>
                <li>Attiva la <b>Modalità sviluppatore</b> (interruttore in alto a destra)</li>
                <li>Clicca su <b>Carica estensione non pacchettizzata</b></li>
                <li>Seleziona la cartella decompressa al passo 1 — l'estensione si attiverà subito, senza ricaricare la pagina</li>
              </ol>
            </div>
            <button id="checkMonitorButton">Rileva monitor</button>
            <button id="salvaConfigMonitor">Salva visualizzazione attuale</button>
        </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', monitorToolsHtml);
  const scaricaEstensioneBtn = document.getElementById('scarica-estensione-btn');
  if (scaricaEstensioneBtn) {
    scaricaEstensioneBtn.addEventListener('click', e => {
      e.preventDefault();
      const url = scaricaEstensioneBtn.getAttribute('href');
      let iframe = document.getElementById('scarica-estensione-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'scarica-estensione-iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }
      iframe.src = url;
    });
  }
  document.querySelectorAll('#tutorial-installazione .tutorial-url').forEach(el => {
    el.addEventListener('click', () => {
      const testo = el.dataset.url || el.textContent;
      const originale = el.textContent;
      const mostraOk = () => {
        el.textContent = 'Copiato!';
        setTimeout(() => {
          el.textContent = originale;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(testo).then(mostraOk).catch(() => {});
      }
    });
  });
  if (versioneEstensioneInstallata === '') {
    showWarning(
      "Estensione da installare"
    );
    // showWarning(
    //   "La gestione della visualizzazione su più schermi è una funzionalità avanzata che richiede l'installazione della nostra estensione Chrome. Installala da qui e ricarica la pagina"
    // );
  }

  if (monitors.length > 1) {
    disegnaMonitorInterfaccia(monitors);
  } else if (versioneEstensioneInstallata !== '') {
    showWarning('Rilevato un solo monitor');
  }

  // await window.checkMonitor();

  // document.getElementById('checkMonitorButton').addEventListener('click', async () => {
  //   await window.checkMonitor();
  // });

  document.getElementById('salvaConfigMonitor').addEventListener('click', () => {
    window.salvaConfigMonitor();
  });

  //Animazione comparsa monitor-tools
  setTimeout(() => {
    document.getElementById('monitor-tools').style.left =
      `${window.sonoUnoStorico ? '60%' : '80%'}`;
    //Adatto la larghezza della griglia in base all'apertura del nuovo pannello
    if (
      document.body.classList.contains('storico-injected-iframe') ||
      document.body.classList.contains('storico-same-tab')
    ) {
      return;
    } //Non applico riadattamento se cìè uno storico sulla destra
    setTimeout(() => {
      const widthPannelloSx = parseFloat(
        window.getComputedStyle(document.querySelector('.mdv-new-panel')).width
      );
      const leftPositionMonitorPanel = parseFloat(
        window.getComputedStyle(document.getElementById('monitor-tools')).left
      );
      const valoreDefinitivo = leftPositionMonitorPanel - widthPannelloSx;
      document.querySelector('[data-cy="viewport-grid"]').style.width = `${valoreDefinitivo}px`;
    }, 350);
  }, 0);

  document.getElementById('chiudi-monitor-button').addEventListener('click', () => {
    document.querySelector('[data-cy="viewport-grid"]').style.width = '100%';
    document.getElementById('monitor-tools').style.left = '100%';
    fermaPingEstensione();
    setTimeout(() => {
      document.getElementById('monitor-tools').remove();
    }, 300);
  });

  avviaPingEstensione();
}

let permissionStatus = null;
let screenDetails = null;
let schermi = null;

window.checkMonitor = async () => {
  permissionStatus = await navigator.permissions.query({ name: 'window-management' }).catch(e => {
    console.error(e);
    showWarning(e.message);
  });
  if ('getScreenDetails' in self) {
    if (
      !screenDetails &&
      ((permissionStatus && permissionStatus.state === 'granted') ||
        (permissionStatus && permissionStatus.state === 'prompt'))
    ) {
      screenDetails = await window.getScreenDetails().catch(e => {
        console.error(e);
        if (e.message) {
          showWarning(e.message);
        }
      });
      // if (screenDetails) {
      //   screenDetails.addEventListener('screenschange', () => {
      //     updateScreens(/*requestPermission=*/ false);
      //     setScreenListeners();
      //   });
      //   setScreenListeners();
      // }
    }
    if (screenDetails && screenDetails.screens.length > 1) {
      showWarning();
    } // Clear any warning.
    else if (screenDetails && screenDetails.screens.length == 1) {
      showWarning('Rilevato un solo monitor');
    } else if (permissionStatus && permissionStatus.state === 'denied') {
      showWarning('Devi abilitare i permessi del browser sulla gestione delle finestre');
    }

    if (screenDetails) {
      // console.log("INFO: Detected " + screenDetails.screens.length + " screens:");
      // for (let i = 0; i < screenDetails.screens.length; ++i) {
      //   const s = screenDetails.screens[i];
      //   console.log(`[${i}] "${s.label}" ` +
      //               `[${s.left},${s.top} ${s.width}x${s.height}] ` +
      //               `(${s.availLeft},${s.availTop} ${s.availWidth}x${s.availHeight}) ` +
      //               `devicePixelRatio:${s.devicePixelRatio} colorDepth:${s.colorDepth} ` +
      //               `isExtended:${s.isExtended} isPrimary:${s.isPrimary} isInternal:${s.isInternal}`);
      // }
      schermi = screenDetails.screens;
    }
  } else {
    schermi = [window.screen];
  }

  if (schermi && schermi.length > 1) {
    disegnaMonitorInterfaccia(schermi);
  }

  leggiConfigurazioneAttuale();
};

function isExtensionInstalled() {
  //Mi serve per capire se l'estensione è installata/attiva/funzionante oltre che ricevere il numero versione
  window.postMessage({ type: 'fromPage', data: 'Info versione' }, '*');
}

function disegnaMonitorInterfaccia(schermi) {
  //Aggiorno ogni volta rimuovendo il precedente se presente
  if (document.getElementById('monitor-rilevati')) {
    document.getElementById('monitor-rilevati').remove();
  }
  if (document.getElementById('lista-monitor')) {
    document.getElementById('lista-monitor').remove();
  }
  if (document.getElementById('configurazione-div')) {
    document.getElementById('configurazione-div').remove();
  }
  if (document.getElementById('imposta-configurazione-div')) {
    document.getElementById('imposta-configurazione-div').remove();
  }
  document.getElementById('info-versione-estensione').insertAdjacentHTML(
    'afterend',
    `
    <div id="monitor-rilevati">

              </div>
    `
  );
  const sezioneMonitorRilevati = document.getElementById('monitor-rilevati');
  document
    .getElementById('info-versione-estensione')
    .insertAdjacentHTML(
      'afterend',
      `<p id="lista-monitor">Monitor presenti: ${schermi.length}</p>`
    );
  sezioneMonitorRilevati.style.display = 'grid';
  for (let i = 0; i < schermi.length; i++) {
    const isPrimaryScreen = schermi[i].isPrimary;

    // Creazione dell'HTML base
    const monitorDiv = document.createElement('div');
    // monitorDiv.className = `monitor-div ${isPrimaryScreen ? 'monitor-attuale-div' : ''}`;
    monitorDiv.className = 'monitor-div';
    monitorDiv.innerHTML = `
        <label style="display:none">Monitor corrente</label>
        <p style="font-weight: 800;">[${i + 1}] - ${schermi[i].name} ${schermi[i].isPrimary ? '- PRIMARIO' : ''}</p>
        <p>${isPrimaryScreen ? 'Monitor primario' : ''}</p>
        <p>ID: ${schermi[i].id}</p>
        <p>${schermi[i].bounds.left},${schermi[i].bounds.top}  ${schermi[i].bounds.width}x${schermi[i].bounds.height}</p>
        <p>dpiX: ${schermi[i].dpiX}, dpiY: ${schermi[i].dpiY}</p>
    `;

    // Aggiunta del pulsante

    // if (!isPrimaryScreen) {
    //   const button = document.createElement('button');
    //   button.className = 'sposta-su-monitor-btn';
    //   button.textContent = 'Sposta qui';
    //   button.addEventListener('click', async () => spostaVisualizzatoreSuMonitor(schermi[i]));
    //   monitorDiv.appendChild(button);
    // }

    // Inserimento nella sezione
    sezioneMonitorRilevati.appendChild(monitorDiv);
  }
  //Parte HTML Lettura Configurazione

  const configurazioneDiv = document.createElement('div');
  configurazioneDiv.id = 'configurazione-div';
  if (!configAttuale) {
    configurazioneDiv.innerHTML = `
        <label>Configurazione attuale:</label>
        <p class="nessuna-configurazione-salvata">Nessuna configurazione salvata</p>
    `;
  } else {
    //In base alla larghezza e alle coordinate della finestra salvata, indico su quali monitor è attiva
    const testoCalcoloMonitorOccupati = calcoloMonitorOccupati();
    configurazioneDiv.innerHTML = `
    <label>Configurazione attuale:</label>
    <p style="font-size: 0.8rem; color: #b4f1d1">Visualizzazione in ${configAttuale.width}x${configAttuale.height} / left: ${configAttuale.left}, top: ${configAttuale.top}</p>
    <p style="display:none;font-size: 0.8rem; color: #b4f1d1">${testoCalcoloMonitorOccupati}</p>
`;
    // Aggiungo un pulsante per rimuovere eventualmente la configurazione attuale
    aggiungiPulsanteEliminaConfigurazione();
  }

  const mainMonitorAreaDiv = document.getElementById('main-area-monitor');
  mainMonitorAreaDiv.appendChild(configurazioneDiv);

  //Parte HTML Imposta una Configurazione

  // const impostaConfigurazioneDiv = document.createElement('div');
  // impostaConfigurazioneDiv.id = 'imposta-configurazione-div';
  // impostaConfigurazioneDiv.innerHTML = `
  // <label>Monitor predefinito per apertura Visualizzatore:</label>
  //   <select id="select-monitor">
  //   </select>
  //   <p id="configurazione-salvata">Configurazione salvata</p>
  // `;
  // mainMonitorAreaDiv.appendChild(impostaConfigurazioneDiv);

  // const selectMonitor = document.getElementById('select-monitor');

  // const placeholderOption = document.createElement('option');
  // placeholderOption.value = ''; // Valore vuoto
  // placeholderOption.textContent = 'Seleziona un monitor';
  // placeholderOption.disabled = true; // Rende l'opzione non selezionabile
  // placeholderOption.selected = true; // Imposta come opzione predefinita
  // selectMonitor.appendChild(placeholderOption);

  // for (let i = 0; i < schermi.length; i++) {
  //   const option = document.createElement('option');
  //   option.value = `${i}`;
  //   option.textContent = `Monitor ${i + 1}: ${schermi[i].label}`;
  //   selectMonitor.appendChild(option);
  // }
}

function calcoloMonitorOccupati() {
  if (monitors.length < 2) {
    return 'Rilevato un solo monitor';
  }
  let testoCalcolo = '';
  let monitorOccupati = 0;
  const idMonitorOccupati = [];

  for (const monitor of monitors) {
    // Controlla se la finestra interseca l'area del monitor
    const windowRight = configAttuale.left + configAttuale.width;
    const windowBottom = configAttuale.top + configAttuale.height;

    const monitorRight = monitor.bounds.left + monitor.bounds.width;
    const monitorBottom = monitor.bounds.top + monitor.bounds.height;

    const isOverlapping =
      configAttuale.left < monitorRight &&
      windowRight > monitor.bounds.left &&
      configAttuale.top < monitorBottom &&
      windowBottom > monitor.bounds.top;

    if (isOverlapping) {
      monitorOccupati++;
      idMonitorOccupati.push(monitor.id);
    }
  }
  if (monitorOccupati === 1) {
    testoCalcolo = `La finestra viene visualizzata automaticamente nel monitor ${idMonitorOccupati[0]}`;
  } else if (monitorOccupati > 1) {
    testoCalcolo = `La finestra viene visualizzata su ${monitorOccupati} monitor e viene estesa automaticamente dal monitor ${idMonitorOccupati[0]} al monitor ${idMonitorOccupati[idMonitorOccupati.length - 1]}`;
  }
  return testoCalcolo;
}

async function spostaVisualizzatoreSuMonitor(monitorInfo) {
  console.log(monitorInfo);
  window.moveTo(monitorInfo.availLeft, monitorInfo.availTop);
  setTimeout(async () => {
    window.resizeTo(monitorInfo.availWidth, monitorInfo.avaiHeight);
  }, 100);

  setTimeout(async () => {
    await window.checkMonitor();
  }, 100);

  // const nuovaFinestra = window.open(
  //   window.location.href, // URL della finestra
  //   '_blank', // Target: nuova finestra (_blank)
  //   `toolbar=no,scrollbars=no,resizable=no,status=no,menubar=no,width=${monitorInfo.width + 100},height=${monitorInfo.height + 100},top=${monitorInfo.top},left=${monitorInfo.left}` // Parametri della finestra
  // );
  // // Chiudi la finestra corrente
  // if (nuovaFinestra) {
  //   // reindirizzo a una pagina vuota
  //   // window.location.href = 'about:blank';
  //   //La finestra si chiuderà solo se aperta a sua volta con window.open o comunque con _blank (se aperta dal pacs avrà effetto)
  //   window.close();
  // }
}

function leggiConfigurazioneAttuale() {
  if (!localStorage.getItem('configurazioneMonitor')) {
    return;
  }
  let configAttuale = localStorage.getItem('configurazioneMonitor');
  configAttuale = JSON.parse(configAttuale);
  const { label } = configAttuale;

  const { colorDepth } = configAttuale;
  const { devicePixelRatio } = configAttuale;
  const { height } = configAttuale;
  const { left } = configAttuale;
  const { numeroMonitor } = configAttuale;
  const { top } = configAttuale;
  const { width } = configAttuale;

  document.querySelector('.nessuna-configurazione-salvata').innerHTML = `
  <p>Apertura automatica sul monitor #${numeroMonitor}</p>
  <p>${label}</p>
  <p>${width}x${height} - ${left},${top} </p>
  <p>Color depth: ${colorDepth}</p>
  <p>Device Pixel Ratio: ${devicePixelRatio}</p>
  `;
  document.querySelector('.nessuna-configurazione-salvata').className = 'warning';
}

// window.salvaConfigMonitor = () => {
//   const opzioneSelezionata = document.getElementById('select-monitor').value;
//   const monitorSelezionato = schermi[opzioneSelezionata];
//   const objMonitorSelezionato = {
//     label: monitorSelezionato.label,
//     numeroMonitor: Number(opzioneSelezionata) + 1,
//     width: monitorSelezionato.width,
//     height: monitorSelezionato.height,
//     left: monitorSelezionato.left,
//     top: monitorSelezionato.top,
//     colorDepth: monitorSelezionato.colorDepth,
//     devicePixelRatio: monitorSelezionato.devicePixelRatio,
//   };

//   const strMonitorSelezionato = JSON.stringify(objMonitorSelezionato);
//   localStorage.setItem('configurazioneMonitor', strMonitorSelezionato);
//   document.getElementById('configurazione-salvata').style.display = 'block';
// };

window.salvaConfigMonitor = () => {
  window.postMessage({ type: 'fromPage', data: 'Salva configurazione' }, '*');
  abilitaPulsanteEliminazione = true;
};

function aggiungiPulsanteEliminaConfigurazione() {
  if (!document.getElementById('deleteConfigMonitor') && abilitaPulsanteEliminazione) {
    document.getElementById('salvaConfigMonitor').insertAdjacentHTML(
      'beforebegin',
      `
    <button id="deleteConfigMonitor">Elimina configurazione</button>
    `
    );
    const deleteConfigBtn = document.getElementById('deleteConfigMonitor');
    deleteConfigBtn.addEventListener('click', deleteConfigMonitor);
  }
}

function deleteConfigMonitor() {
  window.postMessage({ type: 'fromPage', data: 'Elimina configurazione' }, '*');
  abilitaPulsanteEliminazione = false; //Una volta che la configurazione viene eliminata, non faccio più ricomparire il pulsante elimina alla riapetura della funzione monitor,
  //tranne nel caso in cui venga salvata nuovamente una configurazione
}

// Ascolta messaggi dall'estensione
window.addEventListener('message', event => {
  if (event.source !== window) {
    return;
  } // Ignora messaggi non dall'estensione
  if (event.data.type === 'fromExtension' && event.data.data) {
    const messaggio = event.data.data;
    if (messaggio.versione) {
      console.log('Versione estensione: ', messaggio.versione);
      // Pong del ping di liveness: l'estensione è viva
      if (pingEstensioneTimeout) {
        clearTimeout(pingEstensioneTimeout);
        pingEstensioneTimeout = null;
      }
      const eraVuotaPrima = versioneEstensioneInstallata === '';
      versioneEstensioneInstallata = messaggio.versione;

      // Modale di benvenuto solo al cambio di installId (install/reinstall),
      // non al refresh con estensione già installata.
      const installIdRicevuto = messaggio.installId || '';
      if (installIdRicevuto) {
        const installIdSalvato = localStorage.getItem('mdvExtensionInstallId') || '';
        if (installIdRicevuto !== installIdSalvato) {
          localStorage.setItem('mdvExtensionInstallId', installIdRicevuto);
          mostraBenvenutoEstensione();
        }
      }

      // Se il pannello "Gestione monitor" è già aperto e prima l'estensione
      // mancava (avviso "Estensione da installare"), aggiorno la UI senza refresh.
      if (eraVuotaPrima && document.getElementById('monitor-tools')) {
        const versionInfo = document.getElementById('info-versione-estensione');
        if (versionInfo) {
          versionInfo.textContent = `Versione estensione del browser: ${versioneEstensioneInstallata}`;
          versionInfo.style.display = 'block';
        }
        const downloadBtn = document.getElementById('scarica-estensione-btn');
        if (downloadBtn) {
          downloadBtn.style.display = 'none';
        }
        const tutorial = document.getElementById('tutorial-installazione');
        if (tutorial) {
          tutorial.style.display = 'none';
        }
        showWarning('');
        const salvaBtn = document.getElementById('salvaConfigMonitor');
        if (salvaBtn) {
          salvaBtn.style.display = '';
        }
        // #checkMonitorButton resta nascosto come da CSS di default
      }

      //Al caricamento iniziale o ad ogni cambio di winsow.layout eseguo le correzioni
      // e avvio funzione di trasformazione per riadattare eventualmente la griglia al caricamento su più monitor

      let previousLayout = null; // Per memorizzare il precedente stato di window.layout
      let mprChanged = null;

      function monitorLayoutChanges() {
        calcolaLarghezzaFinestraSuPiuMonitor();
        requestAnimationFrame(monitorLayoutChanges);
      }

      // Effettuo correzioni continue
      monitorLayoutChanges();
    }
    if (messaggio.monitors) {
      monitors = JSON.parse(messaggio.monitors);
      console.log('Info monitor: ', monitors);
      // Se il pannello è aperto, aggiorno la sezione monitor anche se la
      // lista è arrivata DOPO l'apertura (caso install live).
      if (
        document.getElementById('monitor-tools') &&
        versioneEstensioneInstallata !== ''
      ) {
        if (monitors.length > 1) {
          showWarning('');
          disegnaMonitorInterfaccia(monitors);
        } else if (monitors.length === 1) {
          showWarning('Rilevato un solo monitor');
        }
      }
    }
    if (messaggio.configAttuale) {
      configAttuale = messaggio.configAttuale;
      console.log('Config attuale: ', configAttuale);
    }
    if (
      messaggio.applicazioneModifiche &&
      !document.body.classList.contains('storico-injected-iframe')
    ) {
      console.log("L'estensione ha spostato la finestra seguendo la configurazione salvata");
      //Se l'estensione ha applicato le modifiche ovvero ha spostato e/o ridimensionato la finestra significa che al caricamento non aveva le caratteristiche previste dalla
      //configurazione salvata. Capita però che se la finestra si trovava in un monitor verticale o comunque con una risoluzione completamente diversa e l'estensione
      //sposta la finestra su altri monitor, questa non avrà la larghezza corretta, per cui risolvo con un ricaricamento pagina che avverrà sul monitor in questione riportando
      //la larghezza corretta a quel punto MA SOLO SE NON HO UNO STORICO IFRAME.
      window.location.reload();
    }

    if (messaggio.success && messaggio.success === 'Configurazione salvata!') {
      console.log('Salvataggio riuscito');
      const salvataggioBtn = document.getElementById('salvaConfigMonitor');
      salvataggioBtn.textContent = 'Salvataggio riuscito!';
      salvataggioBtn.style.pointerEvents = 'none';
      salvataggioBtn.style.background = '#4caf50';

      setTimeout(() => {
        salvataggioBtn.textContent = 'Salva visualizzazione attuale';
        salvataggioBtn.style.pointerEvents = 'all';
        salvataggioBtn.style.background = '#607d8b';
        //A questo punto se non era presente, aggiungo il pulsante per eliminare la configurazione appena salvata
        abilitaPulsanteEliminazione = true;
        aggiungiPulsanteEliminaConfigurazione();
      }, 3000);
    }
    if (messaggio.success && messaggio.success === 'Configurazione eliminata!') {
      console.log('Configurazione eliminata');
      const deleteBtn = document.getElementById('deleteConfigMonitor');
      deleteBtn.textContent = 'Configurazione eliminata';
      deleteBtn.style.pointerEvents = 'none';

      setTimeout(() => {
        deleteBtn.remove();
      }, 3000);
    }

    console.log("Messaggio ricevuto dall'estensione:", event.data);
  }
});


// Ping di liveness dell'estensione mentre il pannello "Gestione monitor" è
// aperto: ogni N secondi mando "Info versione"; se non arriva risposta entro
// il timeout considero l'estensione rimossa/disattivata e aggiorno la UI.
let pingEstensioneInterval = null;
let pingEstensioneTimeout = null;
const PING_ESTENSIONE_INTERVAL_MS = 3000;
const PING_ESTENSIONE_TIMEOUT_MS = 1500;

function avviaPingEstensione() {
  if (pingEstensioneInterval) {
    return;
  }
  pingEstensioneInterval = setInterval(() => {
    if (pingEstensioneTimeout) {
      return; // ping precedente ancora in volo
    }
    window.postMessage({ type: 'fromPage', data: 'Info versione' }, '*');
    pingEstensioneTimeout = setTimeout(() => {
      pingEstensioneTimeout = null;
      if (versioneEstensioneInstallata !== '') {
        console.log('Estensione non risponde al ping, marco come rimossa');
        gestisciEstensioneRimossa();
      }
    }, PING_ESTENSIONE_TIMEOUT_MS);
  }, PING_ESTENSIONE_INTERVAL_MS);
}

function fermaPingEstensione() {
  if (pingEstensioneInterval) {
    clearInterval(pingEstensioneInterval);
    pingEstensioneInterval = null;
  }
  if (pingEstensioneTimeout) {
    clearTimeout(pingEstensioneTimeout);
    pingEstensioneTimeout = null;
  }
}

function gestisciEstensioneRimossa() {
  versioneEstensioneInstallata = '';
  monitors = [];
  configAttuale = undefined;
  estensioneMonitorControllata = false;

  if (!document.getElementById('monitor-tools')) {
    return;
  }

  const versionInfo = document.getElementById('info-versione-estensione');
  if (versionInfo) {
    versionInfo.style.display = 'none';
    versionInfo.textContent = '';
  }
  const downloadBtn = document.getElementById('scarica-estensione-btn');
  if (downloadBtn) {
    downloadBtn.style.display = 'block';
  }
  const tutorial = document.getElementById('tutorial-installazione');
  if (tutorial) {
    tutorial.style.display = 'block';
  }

  ['monitor-rilevati', 'lista-monitor', 'configurazione-div', 'imposta-configurazione-div', 'deleteConfigMonitor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.remove();
    }
  });

  showWarning('Estensione da installare');
}

function mostraBenvenutoEstensione() {
  // Il caller decide se chiamare questa funzione (in base al cambio di
  // installId). Qui solo la guardia anti-doppia-istanza.
  if (document.getElementById('estensione-welcome-modale')) {
    return;
  }

  const modale = document.createElement('div');
  modale.id = 'estensione-welcome-modale';
  modale.innerHTML = `
    <div class="estensione-welcome-backdrop"></div>
    <div class="estensione-welcome-card" role="dialog" aria-modal="true" aria-labelledby="estensione-welcome-titolo">
      <div class="estensione-welcome-check">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h2 id="estensione-welcome-titolo">Estensione installata!</h2>
      <p>L'estensione del browser è ora attiva. Puoi gestire più monitor, salvare layout di visualizzazione e usare le funzionalità avanzate del visualizzatore.</p>
      <button class="estensione-welcome-close" type="button">Ho capito</button>
    </div>
  `;
  document.body.appendChild(modale);

  const chiudi = () => {
    modale.classList.remove('visibile');
    modale.classList.add('uscita');
    setTimeout(() => {
      if (modale.parentNode) {
        modale.parentNode.removeChild(modale);
      }
    }, 300);
  };

  modale.querySelector('.estensione-welcome-close').addEventListener('click', chiudi);
  modale.querySelector('.estensione-welcome-backdrop').addEventListener('click', chiudi);

  // Trigger animazione di entrata al frame successivo
  requestAnimationFrame(() => {
    modale.classList.add('visibile');
  });
}

function showWarning(text) {
  //Se ho un qualsiasi errore nascondo a prescindere i pulsanti in basso rileva monitor e salva configurazione
  if (text && text.trim() !== '' && document.querySelectorAll('#main-area-monitor button')) {
    document.querySelectorAll('#main-area-monitor button').forEach(element => {
      element.style.display = 'none';
    });
  }
  const avvisiGestioneMonitor = document.getElementById('avvisi-gestione-monitor');
  if (text && text.length > 0) {
    avvisiGestioneMonitor.style.display = 'block';
    if (text === 'Permission denied.') {
      text = 'Devi abilitare i permessi del browser sulla gestione delle finestre';
    }
    if (text.includes('is not a valid value for enumeration ')) {
      text =
        'Il browser in uso non supporta la gestione di più monitor. I browser che supportano questa funzione sono Chrome, Edge ed Opera.';
    }
    avvisiGestioneMonitor.textContent = text;
  } else {
    avvisiGestioneMonitor.style.display = 'none';
  }
}

///////////////////////////////

function calcolaLarghezzaFinestraSuPiuMonitor() {
  if (versioneEstensioneInstallata === '') {
    return;
  }

  // Con un solo monitor il ricalcolo "multi-monitor" non ha senso: la finestra
  // non può estendersi su un secondo schermo. Misure incoerenti
  // (window.screenX/innerWidth vs screen.width) unite allo scaling DPI di
  // Windows possono però produrre una falsa "eccedenza" (larghezzaFuoriMonitor)
  // che ricalcola le larghezze delle viewport in PIXEL → colonne disuguali
  // (destra più stretta). Su monitor singolo ripristiniamo sempre il layout
  // uniforme e non applichiamo mai il ricalcolo multi-monitor.
  if (!Array.isArray(monitors) || monitors.length < 2) {
    ripristinoVisualizzazioneSuUnMonitor();
    return;
  }

  let fromLeftToRight = true;

  // Coordinate e dimensioni della finestra
  const finestraLeft = window.screenX;
  const finestraWidth = window.innerWidth;

  // Dimensioni e coordinate del monitor attuale
  const monitorLeft = screen.availLeft;
  const monitorWidth = screen.width;

  // Calcola la larghezza sovrapposta al monitor attuale
  const sovrapposizioneLarghezza = Math.max(
    0,
    Math.min(finestraLeft + finestraWidth, monitorLeft + monitorWidth) -
    Math.max(finestraLeft, monitorLeft)
  );

  // Calcola la larghezza fuori dal monitor attuale (eccedenza a destra o sinistra)
  let larghezzaFuoriMonitor = 0;
  if (finestraLeft < monitorLeft) {
    fromLeftToRight = false;
    // Eccedenza a sinistra del monitor attuale
    larghezzaFuoriMonitor = Math.abs(finestraLeft - monitorLeft);
  } else if (finestraLeft + finestraWidth > monitorLeft + monitorWidth) {
    fromLeftToRight = true;
    // Eccedenza a destra del monitor attuale
    larghezzaFuoriMonitor = finestraLeft + finestraWidth - (monitorLeft + monitorWidth);
  }

  // console.log(`Larghezza sovrapposta al monitor attuale: ${sovrapposizioneLarghezza}px`);
  // console.log(`Larghezza fuori dal monitor attuale: ${larghezzaFuoriMonitor}px`);

  if (larghezzaFuoriMonitor > 8) {
    riadattaFinestraSuPiuMonitor(sovrapposizioneLarghezza, larghezzaFuoriMonitor, fromLeftToRight);
  } else {
    ripristinoVisualizzazioneSuUnMonitor();
  }
}
