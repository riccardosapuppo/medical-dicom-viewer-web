// Su quali pagine l'estensione fa qualcosa.
//
// Il pezzo di indirizzo era scritto tre volte piu' sotto: qui e' un punto
// solo, cosi' chi installa il visualizzatore su un altro percorso cambia
// una riga. A falso, l'estensione lavora su qualunque scheda.
const soloSulVisualizzatore = true;
const percorsoVisualizzatore = '/viewer';
// Opzione: fullscreen automatico. Default disattivo, configurabile via storage.
let aperturaAutomaticaFullScreen = false

async function caricaOpzioni() {
  const result = await chrome.storage.local.get("aperturaAutomaticaFullScreen")
  if (typeof result.aperturaAutomaticaFullScreen === "boolean") {
    aperturaAutomaticaFullScreen = result.aperturaAutomaticaFullScreen
  }
}

caricaOpzioni().catch(() => {})

const APPLICAZIONE_COOLDOWN_MS = 3000
const POS_TOLLERANZA_PX = 20

const lastApplyByTabId = new Map()

function registraApplicazione(tabId) {
  if (typeof tabId !== "number") {
    return
  }
  lastApplyByTabId.set(tabId, Date.now())
}

function applicazioneRecent(tabId) {
  if (typeof tabId !== "number") {
    return false
  }
  const last = lastApplyByTabId.get(tabId)
  if (!last) {
    return false
  }
  return Date.now() - last < APPLICAZIONE_COOLDOWN_MS
}

function quasiUguale(a, b, tolleranza = POS_TOLLERANZA_PX) {
  if (typeof a !== "number" || typeof b !== "number") {
    return false
  }
  return Math.abs(a - b) <= tolleranza
}

// salvo la posizione e le dimensioni della finestra corrente
async function salvaFinestra() {
  const currentWindow = await chrome.windows.getCurrent();
  const finestraData = {
    left: currentWindow.left,
    top: currentWindow.top,
    width: currentWindow.width,
    height: currentWindow.height
  };

  // salvo i dati nel chrome.storage
  await chrome.storage.local.set({ finestraData });
  console.log("Preferenze finestra salvate:", finestraData);
}

async function eliminaConfigurazione() {
  await chrome.storage.local.remove('finestraData');
  console.log("Configurazione eliminata");
}


//Invio info monitor
async function getInfoMonitor() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs.length > 0) {
      const monitorInfo = await chrome.system.display.getInfo()
      console.log(monitorInfo)
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "monitorInfo",
        data: { monitors: JSON.stringify(monitorInfo) }
      });
    }
  });
}

// ripristino la posizione e le dimensioni salvate
async function ripristinaFinestra() {

  // Ottengo la scheda attualmente attiva
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab) {
    console.log("Nessuna scheda del visualizzatore in primo piano.");
    return;
  }

  if (applicazioneRecent(activeTab.id)) {
    console.log("Ripristino finestra saltato: applicazione recente.");
    return;
  }

  if (soloSulVisualizzatore && activeTab.url && !activeTab.url.includes(percorsoVisualizzatore)) {
    console.log("Nessuna scheda del visualizzatore in primo piano.");
    return;
  }
  // recupero i dati salvati
  chrome.storage.local.get("finestraData", (result) => {
    if (!result.finestraData) { //Nessuna configurazione salvata
      return console.log("Nessuna posizione e dimensioni salvate trovate.");
    }

    //invio al client la configurazione attuale salvata
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "configAttuale",
          data: { configAttuale: result.finestraData }
        });
      }
    });

    const { left, top, width, height } = result.finestraData;

    // Ottengo i dettagli della finestra attiva
    chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
      const currentLeft = currentWindow.left;
      const currentTop = currentWindow.top;
      const currentWidth = currentWindow.width;
      const currentHeight = currentWindow.height;

      // Verifico se le dimensioni e la posizione corrispondono a quelle salvate, se fosse così non è necessario applicare alcuna modifica
      if (
        quasiUguale(currentLeft, left) &&
        quasiUguale(currentTop, top) &&
        quasiUguale(currentWidth, width) &&
        quasiUguale(currentHeight, height)
      ) {
        console.log("La finestra attiva ha già la configurazione desiderata.");
        return;
      }

      //Devo applicare le modifiche, creo una nuova finestra con la scheda attuale
      chrome.windows.create({ tabId: activeTab.id }, async (newWindow) => {
        registraApplicazione(activeTab.id);
        console.log("Scheda spostata in una nuova finestra:", newWindow);

        // controllo se la finestra è massimizzata
        if (newWindow.state === "maximized") {
          // Prima di applicare le dimensioni, ripristino lo stato normale
          chrome.windows.update(newWindow.id, { state: "normal" }, () => {
            // Applico dimensioni e posizione
            chrome.windows.update(newWindow.id, { left, top, width, height }, () => {
              console.log("Posizione e dimensioni ripristinate:", result.finestraData);
              if (aperturaAutomaticaFullScreen) {
                chrome.windows.update(newWindow.id, { state: "fullscreen" });
              }
            });
          });
        } else {
          // Se non è massimizzata applico direttamente le dimensioni e la posizione
          chrome.windows.update(newWindow.id, { left, top, width, height }, () => {
            console.log("Posizione e dimensioni ripristinate:", result.finestraData);
            if (aperturaAutomaticaFullScreen) {
              chrome.windows.update(newWindow.id, { state: "fullscreen" });
            }
          });
        }
        //Invio alla pagina web avvenuta modifica
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: "applicazioneModifiche",
              data: { applicazioneModifiche: 'ok' }
            });
          }
        });
      })
    });
  })
}

async function impostaFullScreenCorrente() {
  if (!aperturaAutomaticaFullScreen) {
    return;
  }
  chrome.windows.getCurrent((currentWindow) => {
    if (currentWindow.state !== "fullscreen") {
      chrome.windows.update(currentWindow.id, { state: "fullscreen" });
    }
  });
}

chrome.action.onClicked.addListener(() => {
  salvaFinestra();
});

// Al primo install, inietta content.js in tutte le tab già aperte
// così la pagina del viewer rileva l'estensione senza dover ricaricare.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") {
    return;
  }

  // Genero un installId univoco per QUESTA installazione (sopravvive al
  // disable/enable, viene azzerato dall'uninstall che svuota lo storage).
  // La pagina lo userà per sapere se mostrare la modale di benvenuto a ogni
  // install/reinstall, ma non a ogni refresh.
  try {
    const newInstallId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await chrome.storage.local.set({ installId: newInstallId });
    console.log("installId generato:", newInstallId);
  } catch (e) {
    console.error("Errore generazione installId:", e);
  }

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (typeof tab.id !== "number" || !tab.url) {
        continue;
      }
      if (!/^https?:\/\//.test(tab.url)) {
        continue; // skip chrome://, edge://, file://, ecc.
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"]
        });
        console.log("content.js iniettato in tab", tab.id, tab.url);
      } catch (err) {
        console.log("Iniezione content.js fallita su tab", tab.id, err && err.message);
      }
    }
  } catch (err) {
    console.error("Errore iniezione automatica all'install:", err);
  }
});

//Al caricamento pagina
chrome.webNavigation.onCompleted.addListener((details) => {
  if (!soloSulVisualizzatore || details.url.includes(percorsoVisualizzatore)) {
    console.log("Pagina caricata:", details.url);
    getInfoMonitor()
    ripristinaFinestra();
    impostaFullScreenCorrente();
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("background: message ricevuto", message, "sender", sender?.tab?.id, sender?.tab?.windowId);
  if (message.type === "setAutoFullscreen") {
    aperturaAutomaticaFullScreen = !!message.enabled;
    chrome.storage.local
      .set({ aperturaAutomaticaFullScreen })
      .then(() => {
        sendResponse({ status: "success", enabled: aperturaAutomaticaFullScreen });
      })
      .catch((error) => {
        sendResponse({ status: "error", error: error.message });
      });
    return true;
  }
  if (message.type === "toggleAutoFullscreen") {
    aperturaAutomaticaFullScreen = !aperturaAutomaticaFullScreen;
    chrome.storage.local
      .set({ aperturaAutomaticaFullScreen })
      .then(() => {
        sendResponse({ status: "success", enabled: aperturaAutomaticaFullScreen });
      })
      .catch((error) => {
        sendResponse({ status: "error", error: error.message });
      });
    return true;
  }
  if (message.type === "exitFullscreen" || message.type === "toggleFullscreen") {
    const handleWindow = (win) => {
      if (!win) {
        console.log("toggleFullscreen: finestra non trovata");
        sendResponse({ status: "error", message: "Finestra non trovata" });
        return;
      }
      console.log("toggleFullscreen: stato attuale", win.state, "id", win.id);
      if (message.type === "toggleFullscreen") {
        const nextState = win.state === "fullscreen" ? "normal" : "fullscreen";
        chrome.windows.update(win.id, { state: nextState }, () => {
          if (chrome.runtime.lastError) {
            console.log("toggleFullscreen: errore update", chrome.runtime.lastError.message);
            sendResponse({ status: "error", message: chrome.runtime.lastError.message });
            return;
          }
          chrome.windows.get(win.id, (updated) => {
            console.log("toggleFullscreen: stato dopo update", updated?.state);
            sendResponse({ status: "success", state: updated?.state });
          });
        });
        return;
      }
      if (win.state === "fullscreen") {
        chrome.windows.update(win.id, { state: "normal" }, () => {
          if (chrome.runtime.lastError) {
            console.log("exitFullscreen: errore update", chrome.runtime.lastError.message);
            sendResponse({ status: "error", message: chrome.runtime.lastError.message });
            return;
          }
          chrome.windows.get(win.id, (updated) => {
            console.log("exitFullscreen: stato dopo update", updated?.state);
            sendResponse({ status: "success", state: updated?.state });
          });
        });
      } else {
        sendResponse({ status: "ignored", message: "Finestra non in fullscreen" });
      }
    };

    if (sender?.tab?.id) {
      console.log("toggleFullscreen: tabId da sender", sender.tab.id);
      chrome.tabs.get(sender.tab.id, (tab) => {
        if (chrome.runtime.lastError) {
          console.log("toggleFullscreen: errore tabs.get", chrome.runtime.lastError.message);
          chrome.windows.getCurrent(handleWindow);
          return;
        }
        console.log("toggleFullscreen: windowId da tab", tab?.windowId);
        if (typeof tab?.windowId === "number") {
          chrome.windows.get(tab.windowId, handleWindow);
        } else {
          chrome.windows.getCurrent(handleWindow);
        }
      });
    } else {
      console.log("toggleFullscreen: tabId non disponibile, uso getCurrent");
      chrome.windows.getCurrent(handleWindow);
    }
    return true;
  }
  if (message.type === "salvaConfigurazione") {
    salvaFinestra().then(() => {
      sendResponse({ status: "success", message: "Configurazione salvata!" });
    }).catch((error) => {
      sendResponse({ status: "error", error: error.message });
    });

    // Indica che la risposta sarà inviata in modo asincrono
    return true;
  }

  if (message.type === "eliminaConfigurazione") {
    eliminaConfigurazione().then(() => {
      sendResponse({ status: "success", message: "Configurazione eliminata!" });
    }).catch((error) => {
      sendResponse({ status: "error", error: error.message });
    });

    // indico che la risposta sarà inviata in modo asincrono
    return true;
  }

  if (message.type === "sendToPage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "messageToPage",
        data: message.data
      });
    });
    sendResponse({ status: "success" });
  }

  if (message.action === "salva") {
    salvaFinestra();
  }
  if (message.action === "ripristina") {
    ripristinaFinestra();
    impostaFullScreenCorrente();
  }
  if (message.type === "saveWindowPreferences") {
    salvaFinestra().then(() => {
      sendResponse({ status: "success" });  // Risposta di successo
    }).catch((error) => {
      sendResponse({ status: "error", error: error.message });  // Risposta con errore
    });

    // Importante: restituire true per indicare che la risposta sarà inviata in modo asincrono
    return true;
  }

  if (message.type === "richiediInfoMonitor") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (typeof tabId === "number") {
      chrome.system.display.getInfo().then((monitorInfo) => {
        chrome.tabs
          .sendMessage(tabId, {
            type: "monitorInfo",
            data: { monitors: JSON.stringify(monitorInfo) }
          })
          .catch(() => { /* tab chiusa o senza content script: ignoro */ });
      });
    }
    sendResponse({ status: "ok" });
    return true;
  }

  if (message.type === "applyWindowPreferences") {
    // Recupera e applica le preferenze
    chrome.storage.local.get("finestraData", (result) => {
      if (result.finestraData) {
        const { left, top, width, height } = result.finestraData;
        chrome.windows.getCurrent((currentWindow) => {
          chrome.windows.update(currentWindow.id, { left, top, width, height }, () => {
            console.log("Preferenze della finestra applicate:", result.finestraData);
            sendResponse({ status: "success", message: "Preferenze applicate!" });
          });
        });
      } else {
        sendResponse({ status: "error", message: "Nessuna preferenza trovata!" });
      }
    });
    return true; // indico che la risposta sarà asincrona
  }
});



