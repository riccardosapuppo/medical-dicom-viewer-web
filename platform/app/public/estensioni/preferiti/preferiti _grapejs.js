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
= CREA IFRAME GRAPESJS ISOLATO
======================================================
*/
const openGrapesIframe = async () => {
  // Rimuove eventuale iframe precedente
  const old = document.getElementById('gjs-iframe-wrapper');
  if (old) old.remove();

  // Wrapper semi-trasparente
  const wrapper = document.createElement('div');
  wrapper.id = 'gjs-iframe-wrapper';
  wrapper.style.cssText = `
    position: fixed;
    top:0; left:0;
    width:100%; height:100%;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    z-index: 99999999;
    display:flex;
    justify-content:center;
    align-items:center;
  `;

  // Bottone chiudi
  const closeBtn = document.createElement('div');
  closeBtn.innerHTML = 'Chiudi';
  closeBtn.style.cssText = `
    position:absolute;
    top:20px;
    right:20px;
    padding:8px 14px;
    background:#000;
    color:#fff;
    cursor:pointer;
    border-radius:4px;
    font-size:14px;
    z-index:999999999;
  `;
  closeBtn.onclick = () => wrapper.remove();
  wrapper.appendChild(closeBtn);

  // Iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'gjs-iframe';
  iframe.style.cssText = `
    width: 90%;
    height: 90%;
    border-radius: 6px;
    border: none;
    box-shadow:0 0 25px rgba(0,0,0,0.4);
    background:white;
  `;
  wrapper.appendChild(iframe);

  document.body.appendChild(wrapper);

  /*
  ======================================================
  = SCRIVIAMO IL DOCUMENTO HTML DENTRO L’IFRAME
  ======================================================
  */
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`
<!DOCTYPE html>
<html>
  <head>
    <title>Layout Builder</title>

    <link rel="stylesheet" href="https://unpkg.com/grapesjs/dist/css/grapes.min.css">

    <style>
      html, body {
        margin:0;
        padding:0;
        height:100%;
        overflow:hidden;
        background:white;
        font-family: sans-serif;
      }

      #container-root {
        display:flex;
        height:100%;
        width:100%;
      }

      #blocks {
        width:260px;
        background:#f4f4f4;
        border-right:1px solid #ccc;
        overflow:auto;
        padding:10px;
        box-sizing:border-box;
      }

      #editor {
        flex:1;
        height:100%;
        overflow:auto;
        background:#e5e7eb;
      }

      #layout-toolbar {
        margin-bottom:10px;
        padding-bottom:10px;
        border-bottom:1px solid #ccc;
      }

      #layout-toolbar h4 {
        margin:0 0 6px 0;
        font-size:13px;
        font-weight:bold;
      }

      #layout-toolbar button {
        display:block;
        width:100%;
        margin-bottom:4px;
        padding:4px 6px;
        font-size:12px;
        cursor:pointer;
        border:1px solid #ccc;
        border-radius:3px;
        background:#fff;
      }

      #print-btn {
        display:block;
        width:100%;
        margin-bottom:8px;
        padding:6px 8px;
        font-size:12px;
        cursor:pointer;
        border:1px solid #16a34a;
        border-radius:3px;
        background:#22c55e;
        color:#fff;
        font-weight:bold;
      }

      /* Il foglio vero e proprio */
      #print-page {
        background:#fff;
      }
    </style>
  </head>

  <body>
    <div id="container-root">
      <div id="blocks"></div>
      <div id="editor"></div>
    </div>

    <script src="https://unpkg.com/grapesjs"></script>
    <script src="https://unpkg.com/grapesjs-blocks-basic"></script>
  </body>
</html>
  `);
  doc.close();

  /*
  ======================================================
  = QUANDO L’IFRAME È PRONTO → INIZIALIZZO GRAPESJS
  ======================================================
  */
  iframe.onload = () => {
    const w = iframe.contentWindow;

    const FORMATS = {
      'A4 Verticale': { width: 2480, height: 3508, pageCss: 'A4 portrait' },
      'A4 Orizzontale': { width: 3508, height: 2480, pageCss: 'A4 landscape' },
      'A3 Verticale': { width: 3508, height: 4961, pageCss: 'A3 portrait' },
      'A3 Orizzontale': { width: 4961, height: 3508, pageCss: 'A3 landscape' }
    };

    const editor = w.grapesjs.init({
      container: '#editor',
      height: '100%',
      storageManager: false,

      // Usiamo il plugin solo per le feature, ma SENZA blocchi base
      plugins: ['gjs-blocks-basic'],
      pluginsOpts: {
        'gjs-blocks-basic': {
          flexGrid: true,
          blocks: [] // nessun blocco base visibile
        }
      },

      blockManager: {
        appendTo: w.document.getElementById('blocks')
      },

      deviceManager: {
        devices: [
          {
            name: 'A4 Verticale',
            width: FORMATS['A4 Verticale'].width + 'px',
            height: FORMATS['A4 Verticale'].height + 'px'
          },
          {
            name: 'A4 Orizzontale',
            width: FORMATS['A4 Orizzontale'].width + 'px',
            height: FORMATS['A4 Orizzontale'].height + 'px'
          },
          {
            name: 'A3 Verticale',
            width: FORMATS['A3 Verticale'].width + 'px',
            height: FORMATS['A3 Verticale'].height + 'px'
          },
          {
            name: 'A3 Orizzontale',
            width: FORMATS['A3 Orizzontale'].width + 'px',
            height: FORMATS['A3 Orizzontale'].height + 'px'
          }
        ]
      }
    });

    const bm = editor.BlockManager;
    const blocksContainer = w.document.getElementById('blocks');

    /*
    ======================================================
    = CREO IL CONTENITORE PAGINA (A4 DI DEFAULT)
    ======================================================
    */
    const wrapperComp = editor.DomComponents.getWrapper();

    let pageComp = wrapperComp.find('#print-page')[0];
    if (!pageComp) {
      const addedPage = wrapperComp.append({
        tagName: 'div',
        attributes: { id: 'print-page' },
        style: {
          width: FORMATS['A4 Verticale'].width + 'px',
          height: FORMATS['A4 Verticale'].height + 'px',
          margin: '20px auto',
          background: '#fff',
          border: '1px solid #ccc',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }
      });
      pageComp = Array.isArray(addedPage) ? addedPage[0] : addedPage;
    }

    // Aggiorna dimensioni del foglio quando cambia device
    editor.on('change:device', () => {
      const current = editor.getDevice();
      const fmt = FORMATS[current];
      if (fmt && pageComp) {
        pageComp.addStyle({
          width: fmt.width + 'px',
          height: fmt.height + 'px'
        });
      }
    });

    /*
    ======================================================
    = PULSANTE STAMPA (SOLO #print-page)
    ======================================================
    */
    const printBtn = w.document.createElement('button');
    printBtn.id = 'print-btn';
    printBtn.textContent = 'Stampa';
    printBtn.onclick = () => {
      const pageEl = w.document.getElementById('print-page');
      if (!pageEl) {
        w.alert('Nessuna pagina da stampare.');
        return;
      }

      const current = editor.getDevice();
      const fmt = FORMATS[current] || FORMATS['A4 Verticale'];
      const pageSizeCss = fmt.pageCss || 'A4';

      const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>Stampa</title>
    <style>
      @page {
        size: ${pageSizeCss};
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
      }
      #print-page-wrapper {
        width: 100vw;
        min-height: 100vh;
        display:flex;
        justify-content:center;
        align-items:flex-start;
        background:#fff;
      }
      #print-page-wrapper > div {
        margin:0;
      }
    </style>
  </head>
  <body>
    <div id="print-page-wrapper">
      ${pageEl.outerHTML}
    </div>
  </body>
</html>`;

      const printWin = w.open('', '_blank');
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      printWin.print();
    };

    blocksContainer.prepend(printBtn);

    /*
    ======================================================
    = TOOLBAR LAYOUT (1x1 → 4x1, 1x2 → 1x4)
    ======================================================
    */
    const layoutToolbar = w.document.createElement('div');
    layoutToolbar.id = 'layout-toolbar';
    layoutToolbar.innerHTML = `
      <h4>Layout automatico</h4>
      <button data-layout-id="row-1x1">Riga 1 x 1</button>
      <button data-layout-id="row-2x1">Riga 2 x 1</button>
      <button data-layout-id="row-3x1">Riga 3 x 1</button>
      <button data-layout-id="row-4x1">Riga 4 x 1</button>
      <button data-layout-id="col-1x2">Colonna 1 x 2</button>
      <button data-layout-id="col-1x3">Colonna 1 x 3</button>
      <button data-layout-id="col-1x4">Colonna 1 x 4</button>
    `;
    blocksContainer.appendChild(layoutToolbar);

    /*
    ======================================================
    = FUNZIONI PER LAYOUT AUTO-POPOLATO
    ======================================================
    */

    let layoutInitialized = false;

    const getDefaultLayoutId = count => {
      if (count <= 1) return 'row-1x1';
      if (count === 2) return 'row-2x1';
      if (count === 3) return 'row-3x1';
      return 'row-4x1'; // 4 o più
    };

    const applyLayout = (layoutId, askConfirm = false) => {
      const preferiti = (window.preferiti || []).slice(); // ordine originale

      if (!preferiti.length) {
        w.alert('Non ci sono preferiti da posizionare.');
        return;
      }

      if (askConfirm && layoutInitialized) {
        const proceed = w.confirm(
          `Cambiare layout cancellerà la disposizione corrente.
Le immagini verranno reinserite automaticamente.

Vuoi continuare?`
        );
        if (!proceed) return;
      }

      // Svuoto SOLO il contenuto del foglio, non il wrapper intero
      pageComp.components().reset([]);

      let rowOrColComp;
      const cells = [];

      if (layoutId.startsWith('row-')) {
        const cols = parseInt(layoutId.split('-')[1][0], 10); // 1x1, 2x1, 3x1, 4x1
        const added = pageComp.append({
          tagName: 'div',
          style: {
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            minHeight: '150px',
            border: '1px dashed #aaa',
            boxSizing: 'border-box'
          }
        });
        rowOrColComp = Array.isArray(added) ? added[0] : added;

        for (let i = 0; i < cols; i++) {
          const addedCell = rowOrColComp.append({
            tagName: 'div',
            style: {
              flex: '1',
              padding: '10px',
              boxSizing: 'border-box'
            }
          });
          const cellComp = Array.isArray(addedCell) ? addedCell[0] : addedCell;
          cells.push(cellComp);
        }
      } else if (layoutId.startsWith('col-')) {
        const rows = parseInt(layoutId.split('-')[1][2], 10); // 1x2, 1x3, 1x4
        const added = pageComp.append({
          tagName: 'div',
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            minHeight: '200px',
            border: '1px dashed #aaa',
            boxSizing: 'border-box'
          }
        });
        rowOrColComp = Array.isArray(added) ? added[0] : added;

        for (let i = 0; i < rows; i++) {
          const addedCell = rowOrColComp.append({
            tagName: 'div',
            style: {
              flex: '1',
              padding: '10px',
              boxSizing: 'border-box'
            }
          });
          const cellComp = Array.isArray(addedCell) ? addedCell[0] : addedCell;
          cells.push(cellComp);
        }
      } else {
        console.warn('Layout non riconosciuto:', layoutId);
        return;
      }

      // Inserisco le immagini nell’ordine dei preferiti
      const maxSlots = cells.length;
      const toUse = preferiti.slice(0, maxSlots);

      toUse.forEach((p, idx) => {
        const cell = cells[idx];
        cell.append({
          type: 'image',
          attributes: {
            src: p.DataUrl
          },
          style: {
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
            display: 'block'
          }
        });
      });

      layoutInitialized = true;
    };

    // Listener per i bottoni layout
    layoutToolbar
      .querySelectorAll('[data-layout-id]')
      .forEach(btn => {
        btn.addEventListener('click', () => {
          const layoutId = btn.getAttribute('data-layout-id');
          applyLayout(layoutId, true);
        });
      });

    /*
    ======================================================
    = AUTO-LAYOUT INIZIALE BASATO SUI PREFERITI
    ======================================================
    */
    if (window.preferiti && window.preferiti.length) {
      const defLayout = getDefaultLayoutId(window.preferiti.length);
      applyLayout(defLayout, false);
    }

    /*
    ======================================================
    = CATEGORIA PREFERITI NEL BLOCK MANAGER
    ======================================================
    */
    bm.add('cat-pref', {
      label: '— Immagini Preferiti —',
      content: '',
      category: 'Immagini Preferiti'
    });

    /*
    ======================================================
    = BLOCCO IMMAGINI PREFERITI (TRASCINABILI EXTRA)
    ======================================================
    */
    if (window.preferiti?.length) {
      window.preferiti.forEach((p, idx) => {
        bm.add(`pref-img-${idx}`, {
          label: `
            <div style="display:flex;align-items:center;gap:4px;font-size:12px;">
              <img src="${p.DataUrl}"
                   style="width:30px;height:30px;object-fit:cover;border:1px solid #aaa">
              <span>${p.NumeroSerie}</span>
            </div>
          `,
          category: 'Immagini Preferiti',
          content: {
            type: 'image',
            attributes: { src: p.DataUrl },
            style: { width: '100%', height: 'auto', objectFit: 'contain' }
          }
        });
      });
    }
  };
};


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

  document
    .getElementById('preferiti-btn')
    .addEventListener('click', createPreferitiFunc);
};


/*
======================================================
= PANNELLO PREFERITI
======================================================
*/
const createPreferitiFunc = () => {
  if (document.getElementById('preferiti-tools')) return;

  const html = `
    <div id="preferiti-tools" style="
      position:fixed;
      top:0; left:100%;
      width:${window.sonoUnoStorico ? '40%' : '20%'};
      height:100%;
      background:#111827;
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

      <button id="btn-open-iframe"
        style="margin:10px 0; padding:8px 12px;
               background:#e5e7eb; color:#111;
               border:none; border-radius:4px; cursor:pointer;">
        Apri Layout Builder
      </button>

      <div id="area-lista-preferiti"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const panel = document.getElementById('preferiti-tools');
  const area = document.getElementById('area-lista-preferiti');

  // Popola lista preferiti
  if (window.preferiti?.length) {
    window.preferiti.forEach(p => {
      area.insertAdjacentHTML(
        'beforeend',
        `
        <div style="margin-bottom:10px;
                    border-bottom:1px solid #374151;
                    padding-bottom:10px;">
          <img src="${p.DataUrl}"
               onclick="window.viewPreferitoPopup('${p.DataUrl}')"
               style="width:100%;max-height:180px;object-fit:contain;cursor:pointer;">
          <p>Serie ${p.NumeroSerie} - ${p.DescrizioneSerie}</p>
          <p>N° Istanza: ${p.NumeroIstanza}</p>
        </div>
      `
      );
    });
  }

  // Animazione apertura
  setTimeout(() => {
    panel.style.left = window.sonoUnoStorico ? '60%' : '80%';
  }, 10);

  // Chiudi pannello
  document.getElementById('chiudi-button').onclick = () => {
    panel.style.left = '100%';
    setTimeout(() => panel.remove(), 250);
  };

  // Apri iframe builder
  document.getElementById('btn-open-iframe').onclick = openGrapesIframe;
};


/*
======================================================
= RE-INIT PER OHIF PANEL EVENTI
======================================================
*/
if (!window.portableVersion) {
  window.addEventListener('panelOpen', e => {
    if (!e.detail.isOpen && e.detail.side !== 'left') {
      preferitiInitInterval();
    }
  });
}
