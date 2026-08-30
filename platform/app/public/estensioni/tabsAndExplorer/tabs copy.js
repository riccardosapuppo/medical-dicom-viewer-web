// ========================
//   MODALE + IFRAME
// ========================

// ======================================================================
//   FUNZIONE PER INVIARE CSS ALL'IFRAME VIA POSTMESSAGE
// ======================================================================
if (window.self === window.top) {
  localStorage.removeItem("aetitle");
  localStorage.removeItem("urlOriginalePerWorklist");
}

function injectCssIntoIframe(iframe) {
  const css = `

   #mdv-tab-container{
      display: none !important;
    }
  `;

  // Aspettiamo che l'iframe sia caricato
  iframe.addEventListener("load", () => {
    try {
      console.log("invio css")
      iframe.contentWindow.postMessage(
        {
          type: "injectCss",
          css: css,
        },
        "*" // va bene per il tuo caso
      );
    } catch (err) {
      console.warn("postMessage CSS failed", err);
    }
  });
}

// ======================================================================
//   PRELOAD DELL’IFRAME VUOTO (MOSTRATO DAL PULSANTE +)
// ======================================================================

function preloadEmptyIframe() {
  const iframeId = "mdv-dynamic-iframe-empty";

  // Evita duplicati
  if (document.getElementById(iframeId)) return;

  const iframe = document.createElement("iframe");
  iframe.id = iframeId;

  // URL viewer
  const url = window.location.href
  const params = new URL(url).searchParams;
  const aetitle = params.get("aetitle");
  const urlOriginalePerWorklist = window.location.href
  localStorage.setItem("urlOriginalePerWorklist", urlOriginalePerWorklist);
  if (aetitle) {
    console.log('fisso aetitale')
    localStorage.setItem("aetitle", aetitle);
  }

  iframe.src = window.location.origin + `/viewer/`;

  iframe.style.position = 'absolute';
  iframe.style.top = '43px';
  iframe.style.left = '0';
  iframe.style.width = '100%';
  iframe.style.height = 'calc(100% - 43px)';
  iframe.style.border = 'none';

  // NASCOSTO MA ATTIVO (NO display:none!)
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.zIndex = '-1';

  document.body.appendChild(iframe);

  injectCssIntoIframe(iframe);
}

// Chiamalo subito all’avvio
if (window.self === window.top) {
  preloadEmptyIframe();
}


function openRouteInModal(url) {
  const existing = document.getElementById('mdv-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'mdv-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.65)';
  modal.style.backdropFilter = 'blur(4px)';
  modal.style.zIndex = '999999';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  const box = document.createElement('div');
  box.style.width = '95vw';
  box.style.height = '95vh';
  box.style.background = '#000';
  box.style.borderRadius = '8px';
  box.style.overflow = 'hidden';
  box.style.position = 'relative';
  box.style.boxShadow = '0 0 15px rgba(0,0,0,0.7)';

  const closeBtn = document.createElement('div');
  closeBtn.innerHTML = '✕';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '10px';
  closeBtn.style.right = '15px';
  closeBtn.style.color = '#fff';
  closeBtn.style.fontSize = '28px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.zIndex = '10';
  closeBtn.style.userSelect = 'none';
  closeBtn.addEventListener('click', () => modal.remove());

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  box.appendChild(closeBtn);
  box.appendChild(iframe);
  modal.appendChild(box);
  document.body.appendChild(modal);
}


// ========================
//  INIETTA TABS
// ========================

function tabsInitInterval() {
  const interval = setInterval(() => {
    const targetForInit = document.querySelector('[title="Accession"]');
    const target = document.getElementById('viewerLayoutResizableViewportGridPanel');

    if (targetForInit) {
      clearInterval(interval);
      injectTabs(target);
    }
  }, 100);

  setTimeout(() => clearInterval(interval), 10000);
}


// ========================
//   CREA CONTAINER + TABS
// ========================

function injectTabs(target) {
  console.log('tabs');

  if (document.getElementById('mdv-tab-container')) return;

  const patientName = window.mdvPatientInfo?.PatientName || 'N/A';
  const accession = document.querySelector('[title="Accession"]')?.textContent || 'N/A';
  const tabDesc = `${patientName} - ${accession}`;

  // ============ CONTAINER FLEX ============

  const container = document.createElement('div');
  container.id = 'mdv-tab-container';

  container.style.display = 'flex';
  container.style.flexDirection = 'row';
  container.style.alignItems = 'center';
  container.style.gap = '6px';
  container.style.marginTop = '1px';
  container.style.marginBottom = '2px';

  // ============ TAB PAZIENTE (STATICO) ============

  const patientTab = document.createElement('div');
  patientTab.id = 'explorer-tab-btn';
  patientTab.innerHTML = `
  <span class="patient-title">${tabDesc}</span>
  <span id="close-patient-tab" style="
    margin-left:8px;
    cursor:pointer;
    color:#bbb;
    font-size:12px;
    display:none;   /* inizialmente nascosto */
  ">✕</span>
`;

  patientTab.style.cursor = 'default';
  patientTab.style.padding = '10px 12px';
  patientTab.style.background = 'rgb(30 30 30)';
  patientTab.style.color = '#fff';
  patientTab.style.fontSize = '13px';
  patientTab.style.borderRadius = '4px';
  patientTab.style.userSelect = 'none';
  patientTab.style.whiteSpace = 'nowrap';

  // ============ TAB "+" (APRE MODALE) ============

  const plusTab = document.createElement('div');
  plusTab.id = 'plus-tab-btn';
  plusTab.innerText = '+';

  plusTab.style.cursor = 'pointer';
  plusTab.style.padding = '5px 14px';
  plusTab.style.background = 'rgb(70 70 70)';
  plusTab.style.color = '#fff';
  plusTab.style.fontSize = '20px';
  plusTab.style.fontWeight = 'bold';
  plusTab.style.borderRadius = '4px';
  plusTab.style.userSelect = 'none';
  plusTab.style.whiteSpace = 'nowrap';

  plusTab.addEventListener('click', () => {
    const emptyIframe = document.getElementById("mdv-dynamic-iframe-empty");
    if (!emptyIframe) return;

    // Mostra l’iframe precaricato
    emptyIframe.style.opacity = '1';
    emptyIframe.style.pointerEvents = 'auto';
    emptyIframe.style.zIndex = '99999';

    // Attiva una tab "vuota"
    showIframeForTab("mdv-dynamic-iframe-empty");
  });


  // MONTA I TABS
  container.appendChild(patientTab);
  container.appendChild(plusTab);

  // INSERISCI container sopra il pannello
  // target.insertAdjacentElement('afterbegin', container);
  document.body.insertAdjacentElement('beforebegin', container);


  document.getElementById("close-patient-tab").addEventListener("click", (e) => {
    e.stopPropagation();

    const firstIframeTab = document.querySelector(".mdv-dynamic-tab");
    if (firstIframeTab) {
      showIframeForTab(firstIframeTab.dataset.iframeId);

      // Nascondi la tab principale dopo la "chiusura"
      const patientTab = document.getElementById('explorer-tab-btn');
      patientTab.style.opacity = '0';
      patientTab.style.display = 'none';
      patientTab.style.pointerEvents = 'none';
      patientTab.style.zIndex = '-1';
      patientTab.dataset.visible = "false";

      //Se ho chiuso la tab principale e ho solo una tab iframe, nascondo il pulsante chiudi da qui
      const dynamicTabs = document.querySelectorAll(".mdv-dynamic-tab");
      if (dynamicTabs.length === 1) {
        document.querySelector(".close-tab-iframe").style.display = "none"
      }
    }
  });

}


// ========================
//  HOOK APERTURA PANNELLI
// ========================

window.addEventListener('panelOpen', function (event) {
  if (!event.detail.isOpen && event.detail.side !== 'left') {
    tabsInitInterval();
  }
});


function updatePatientCloseButton() {
  const dynamicTabs = document.querySelectorAll(".mdv-dynamic-tab");
  const count = dynamicTabs.length;

  const closeIframeBtn = document.querySelector(".close-tab-iframe");
  const closeBtn = document.getElementById("close-patient-tab");
  const patientTab = document.getElementById('explorer-tab-btn');

  // Mostra/nasconde il pulsante per chiudere una tab iframe
  if (closeIframeBtn) {
    closeIframeBtn.style.display = count > 1 || patientTab.style.display !== 'none' ? "block" : "none";
  }

  // Mostra/nasconde la X della tab principale
  if (closeBtn) {
    closeBtn.style.display = count > 0 ? "inline" : "none";
  }



}


// =====================================================================
//   CREA TAB + IFRAME DINAMICO (VERSIONE MIGLIORATA)
// =====================================================================

window.openStudyInInternalTab = function (url, options = {}) {
  const { title = "Studio", tooltip = "" } = options;

  const container = document.getElementById('mdv-tab-container');
  if (!container) return;

  // Chiudi eventuali modali
  const existing = document.getElementById('mdv-modal');
  if (existing) existing.remove();

  // ID unico per l’iframe
  const iframeId = "mdv-dynamic-iframe-" + Math.random().toString(36).substring(2);
  document.getElementById("explorer-tab-btn").style.cursor = "pointer"

  // ============================
  // CREA TAB DINAMICA
  // ============================
  const tab = document.createElement('div');
  tab.className = "mdv-dynamic-tab";
  tab.dataset.iframeId = iframeId;

  tab.style.display = 'flex';
  tab.style.alignItems = 'center';
  tab.style.gap = '8px';
  tab.style.padding = '8px 12px';
  tab.style.background = 'rgb(45 45 45)';
  tab.style.color = '#fff';
  tab.style.borderRadius = '4px';
  tab.style.fontSize = '13px';
  tab.style.cursor = 'pointer';
  tab.style.userSelect = 'none';
  tab.style.whiteSpace = 'nowrap';
  tab.style.transition = 'background 0.2s';

  /* --- TITOLO CON ELLIPSIS --- */
  const titleSpan = document.createElement('span');
  titleSpan.innerText = title;

  // CSS ellipsis
  titleSpan.style.overflow = 'hidden';
  titleSpan.style.whiteSpace = 'nowrap';
  titleSpan.style.textOverflow = 'ellipsis';
  titleSpan.style.maxWidth = '270px';      // ← decide tu la larghezza
  titleSpan.style.display = 'inline-block';
  titleSpan.style.flexShrink = '1';

  // Hover
  tab.addEventListener('mouseenter', () => {
    if (!tab.classList.contains('active-tab'))
      tab.style.background = 'rgb(65 65 65)';
  });
  tab.addEventListener('mouseleave', () => {
    if (!tab.classList.contains('active-tab'))
      tab.style.background = 'rgb(45 45 45)';
  });

  // TITOLO
  const spanTitle = document.createElement('span');
  spanTitle.innerText = title;

  // TOOLTIPS NATIVO
  if (tooltip) tab.title = tooltip;

  // X DI CHIUSURA
  const close = document.createElement('span');
  close.innerHTML = "✕";
  close.style.cursor = "pointer";
  close.style.color = "#ccc";
  close.style.fontSize = "12px";
  close.style.fontWeight = "bold";
  close.className = "close-tab-iframe"

  close.addEventListener('click', (e) => {
    e.stopPropagation();
    removeDynamicTab(tab);
  });

  tab.appendChild(titleSpan);

  /* --- X DI CHIUSURA --- */
  tab.appendChild(close);

  // Inserisci la tab accanto al "+"
  const plusTab = document.getElementById("plus-tab-btn");
  container.insertBefore(tab, plusTab);

  // ============================
  // CREA IFRAME ASSOCIATO
  // ============================

  const iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.src = url;
  iframe.style.position = 'absolute';
  iframe.style.top = '43px';
  iframe.style.left = '0';
  iframe.style.width = '100%';
  iframe.style.height = 'calc(100% - 43px)';
  iframe.style.border = 'none';
  iframe.style.zIndex = '99999';

  document.body.appendChild(iframe);

  injectCssIntoIframe(iframe);


  // ATTACH CLICK
  tab.addEventListener('click', () => showIframeForTab(iframeId));

  // Attiva subito questa tab
  showIframeForTab(iframeId);

  updatePatientCloseButton();

};



// =====================================================================
//   MOSTRA SOLO L'IFRAME ASSOCIATO ALLA TAB
// =====================================================================
function showIframeForTab(iframeId) {
  // Nascondi tutti gli iframe dinamici
  document.querySelectorAll('[id^="mdv-dynamic-iframe"]').forEach(ifr => {
    ifr.style.opacity = '0';
    ifr.style.pointerEvents = 'none';
    ifr.style.zIndex = '-1';
  });

  // Reset grafico tab dinamiche
  document.querySelectorAll('.mdv-dynamic-tab').forEach(tab => {
    tab.classList.remove('active-tab');
    tab.style.background = "rgb(45 45 45)";
  });

  // Tab paziente → nessun iframe visibile
  if (iframeId === 'none') {
    updatePatientCloseButton();
    return;
  }

  // Mostra iframe selezionato
  const iframe = document.getElementById(iframeId);
  if (iframe) {
    iframe.style.opacity = '1';
    iframe.style.pointerEvents = 'auto';
    iframe.style.zIndex = '99999';
  }

  // Evidenzia tab attiva
  const activeTab = [...document.querySelectorAll('.mdv-dynamic-tab')]
    .find(t => t.dataset.iframeId === iframeId);

  if (activeTab) {
    activeTab.classList.add('active-tab');
    activeTab.style.background = "rgb(90 90 90)";
  }

  // Nascondi la tab principale se un iframe è attivo
  const patientTab = document.getElementById('explorer-tab-btn');

  if (iframeId === 'none') {
    // quando apro la tab principale, deve tornare visibile
    patientTab.style.opacity = '1';
    patientTab.style.display = 'block';
    patientTab.style.pointerEvents = 'auto';
    patientTab.style.zIndex = '100000';
    patientTab.dataset.visible = "true";
  } else {
    // Se l’iframe NON è quello del pulsante +, nascondo la tab principale
    // Se sto mostrando un iframe REALE → nascondo la tab principale
    if (iframeId.startsWith("mdv-dynamic-iframe-") && iframeId !== "mdv-dynamic-iframe-empty") {

      // patientTab.style.opacity = '0';
      // patientTab.style.pointerEvents = 'none';
      // patientTab.style.zIndex = '-1';
      // patientTab.dataset.visible = "false";

    }
    // Se sto mostrando l’iframe del + → NON nascondere la tab principale
    else if (iframeId === "mdv-dynamic-iframe-empty") {

      patientTab.style.opacity = '1';
      patientTab.style.pointerEvents = 'auto';
      patientTab.style.zIndex = '100000';
      patientTab.dataset.visible = "true";

    }
    // Se sto mostrando la tab principale → ovvio, la tab principale deve essere visibile
    else if (iframeId === 'none') {

      patientTab.style.opacity = '1';
      patientTab.style.pointerEvents = 'auto';
      patientTab.style.zIndex = '100000';
      patientTab.dataset.visible = "true";

    }

  }


  updatePatientCloseButton();
}




// =====================================================================
//   CHIUSURA TAB DINAMICA
// =====================================================================
function removeDynamicTab(tab) {
  const iframeId = tab.dataset.iframeId;
  const iframe = document.getElementById(iframeId);

  if (iframe) iframe.remove();
  tab.remove();

  const container = document.getElementById('mdv-tab-container');
  const allTabs = [...container.querySelectorAll('.mdv-dynamic-tab')];

  // Nessuna altra tab → torna a iframe vuoto
  if (allTabs.length === 0) {
    showIframeForTab('none');
    const patientTab = document.getElementById('explorer-tab-btn');
    patientTab.style.opacity = '1';
    patientTab.style.pointerEvents = 'auto';
    patientTab.style.zIndex = '100000';
    patientTab.dataset.visible = "true";
    updatePatientCloseButton();
    return;
  }

  // Attiva ultima tab
  const prev = allTabs[allTabs.length - 1];
  showIframeForTab(prev.dataset.iframeId);
  updatePatientCloseButton();
}




// =====================================================================
//   CLICK SU TAB PAZIENTE → NASCONDE TUTTI GLI IFRAME
// =====================================================================
document.addEventListener('click', (e) => {
  const patientTab = document.getElementById('explorer-tab-btn');
  if (!patientTab) return;

  if (e.target === patientTab || patientTab.contains(e.target)) {
    showIframeForTab('none');
  }
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "injectCss") {
    try {
      const style = document.createElement("style");
      style.innerHTML = event.data.css;
      document.head.appendChild(style);
      console.log("✔ CSS ricevuto e applicato dall’iframe");
    } catch (err) {
      console.error("Errore iniezione CSS nell'iframe", err);
    }
  }
});
