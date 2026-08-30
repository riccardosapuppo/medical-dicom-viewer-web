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
= AGGANCIO DEL PULSANTE ALLA BARRA
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

      <div id="area-lista-preferiti"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const panel = document.getElementById('preferiti-tools');
  const area = document.getElementById('area-lista-preferiti');

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
