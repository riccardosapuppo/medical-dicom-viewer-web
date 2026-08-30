// installId di questa installazione, condiviso con la pagina per distinguere
// "stessa installazione" da "reinstall". Viene letto dallo storage in modo
// asincrono; le risposte successive a "Info versione" useranno il valore in cache.
let cachedInstallId = "";

// Annuncia subito la presenza dell'estensione alla pagina, così se content.js
// è stato iniettato dopo il caricamento (es. al primo install dell'estensione
// con la tab del viewer già aperta) la pagina può aggiornare lo stato senza refresh.
try {
    chrome.storage.local.get("installId", (result) => {
        cachedInstallId = (result && result.installId) || "";
        window.postMessage(
            { type: "fromExtension", data: { versione: "1.0", installId: cachedInstallId } },
            "*"
        );
        // Chiedi al background le info monitor così la lista compare anche
        // se l'estensione è stata installata mentre la tab era già aperta
        // (in quel caso webNavigation.onCompleted non scatta).
        chrome.runtime.sendMessage({ type: "richiediInfoMonitor" }, () => {
            if (chrome.runtime.lastError) {
                // no-op
            }
        });
    });
} catch (e) {
    console.log("Annuncio versione fallito:", e && e.message);
}

// Riceve un messaggio dal background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "messageToPage") {
        // Invia un messaggio alla pagina web
        window.postMessage({ type: "fromExtension", data: message.data }, "*");
    }
    if (message.type === "monitorInfo") {
        const { monitors } = message.data;

        // Invia il dato alla pagina web
        window.postMessage({ type: "fromExtension", data: { monitors } }, "*");
    }
    if (message.type === "configAttuale") {
        const { configAttuale } = message.data;
        // Invia il dato alla pagina web
        window.postMessage({ type: "fromExtension", data: { configAttuale } }, "*");
    }
    if (message.type === "applicazioneModifiche") {
        const { applicazioneModifiche } = message.data;
        // Invia il dato alla pagina web
        window.postMessage({ type: "fromExtension", data: { applicazioneModifiche } }, "*");
    }
});

// Ascolta messaggi dalla pagina web
window.addEventListener("message", (event) => {
    if (event.source !== window) return; // Ignora messaggi non dalla pagina
    if (event.data.type === "fromPage" && event.data.data) {
        if (event.data.data === 'Info versione') {
            window.postMessage(
                { type: "fromExtension", data: { versione: '1.0', installId: cachedInstallId } },
                "*"
            );
        }
        if (event.data.data === 'Salva configurazione') {
            // Invia il messaggio al background.js
            chrome.runtime.sendMessage({
                type: "salvaConfigurazione",
                payload: event.data // Puoi inviare l'intero oggetto ricevuto
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Errore durante l'invio al background.js:", chrome.runtime.lastError.message);
                    window.postMessage({ type: "fromExtension", data: JSON.stringify(chrome.runtime.lastError.message) }, "*");
                } else {
                    //Configurazione salvata, invio esito al client
                    console.log("Risposta dal background.js:", response);
                    window.postMessage({ type: "fromExtension", data: { success: response.message } }, "*");
                }
            });
        }
        if (event.data.data === 'Elimina configurazione') {
            // invio il messaggio al background.js
            chrome.runtime.sendMessage({
                type: "eliminaConfigurazione",
                payload: event.data // Puoi inviare l'intero oggetto ricevuto
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Errore durante l'invio al background.js:", chrome.runtime.lastError.message);
                    window.postMessage({ type: "fromExtension", data: JSON.stringify(chrome.runtime.lastError.message) }, "*");
                } else {
                    //Configurazione salvata, invio esito al client
                    console.log("Risposta dal background.js:", response);
                    window.postMessage({ type: "fromExtension", data: { success: response.message } }, "*");
                }
            });
        }
        if (event.data.data === 'Exit fullscreen') {
            console.log("content.js: Exit fullscreen ricevuto");
            chrome.runtime.sendMessage({ type: "exitFullscreen" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("content.js: exitFullscreen errore", chrome.runtime.lastError.message);
                } else {
                    console.log("content.js: exitFullscreen response", response);
                }
            });
        }
        if (event.data.data === 'Toggle fullscreen') {
            console.log("content.js: Toggle fullscreen ricevuto");
            chrome.runtime.sendMessage({ type: "toggleFullscreen" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("content.js: toggleFullscreen errore", chrome.runtime.lastError.message);
                } else {
                    console.log("content.js: toggleFullscreen response", response);
                }
            });
        }
        console.log("Ricevuto dalla pagina:", event.data);
    }
});
