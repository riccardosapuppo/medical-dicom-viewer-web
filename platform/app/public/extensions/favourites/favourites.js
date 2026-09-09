/* eslint-disable default-case */
import saveHP from '../saveHP';

/*
======================================================
= POPUP PER VISUALIZZARE LE IMMAGINI DEI PREFERITI
======================================================
*/
window.viewFavouritePopup = imgSrc => {
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
window.removeFavourite = sopUID => {
  if (!window.favourites) return;

  // Remove dalla lista globale
  window.favourites = window.favourites.filter(p => p.SOPInstanceUID !== sopUID);
  window.dispatchEvent(new Event('mdv-favourites-updated'));

  // Aggiorna pannello se aperto
  const area = document.getElementById('favourites-list-area');
  if (area) {
    area.innerHTML = '';

    window.favourites.forEach(p => {
      area.insertAdjacentHTML(
        'beforeend',
        `
        <div style="margin-bottom:10px;border-bottom:1px solid #374151;padding-bottom:10px;">
          <img src="${p.DataUrl}"
                onclick="window.viewFavouritePopup('${p.DataUrl}')"
                style="width:100%;max-height:180px;object-fit:contain;cursor:pointer;">
          <p>Series ${p.NumeroSerie} - ${p.SeriesDescription}</p>
          <p>N° Istanza: ${p.NumeroIstanza}</p>

          <button onclick="window.removeFavourite('${p.SOPInstanceUID}')"
                  style="margin-top:6px;padding:0px 10px;background:#b91c1c;
                         color:white;border:none;border-radius:4px;cursor:pointer;">
             Remove favourite
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
const favouritesInitInterval = () => {
  const intv = setInterval(() => {
    const btn = document.getElementById('trackedMeasurements-btn');
    if (btn) {
      clearInterval(intv);
      injectFavouritesBtn();
    }
  }, 100);
  setTimeout(() => clearInterval(intv), 10000);
};

const injectFavouritesBtn = () => {
  if (document.getElementById('favourites-btn')) return;

  const tracked = document.getElementById('trackedMeasurements-btn');

  tracked.parentElement.insertAdjacentHTML(
    'afterend',
    `<div id="favourites-btn" class="text-primary-active hover:cursor-pointer">
        <img style="width:22px" src="./assets/favourites.png" />
     </div>`
  );

  document.getElementById('favourites-btn').addEventListener('click', createFavourites);
};

/*
======================================================
= PANNELLO PREFERITI LATERALE
======================================================
*/
const createFavourites = () => {
  if (document.getElementById('favourites-tools')) return;

  const hasFavourites = window.favourites && window.favourites.length > 0;

  const html = `
    <div id="favourites-tools" style="
      position:fixed;
      top:0; left:100%;
      width:${window.iAmAPrior ? '40%' : '20%'};
      height:100%;
      background:#111;
      color:#fff;
      z-index:99998;
      transition:left .25s ease-out;
      padding:10px;
      overflow-y:auto;
    ">

      <div style="display:flex;gap:10px;align-items:center;">
        <img id="close-button" src="./assets/right-arrow.png"
             style="width:22px;cursor:pointer;">
        <p>${window.iAmAPrior ? 'Favourites on priors' : 'Favourites'}</p>
      </div>

      <div id="favourites-list-area"></div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  const panel = document.getElementById('favourites-tools');
  const area = document.getElementById('favourites-list-area');

  if (hasFavourites) {
    window.favourites.forEach(p => {
      area.insertAdjacentHTML(
        'beforeend',
        `
        <div style="margin-bottom:10px;border-bottom:1px solid #374151;padding-bottom:10px;">
          <img src="${p.DataUrl}"
               onclick="window.viewFavouritePopup('${p.DataUrl}')"
               style="width:100%;max-height:180px;object-fit:contain;cursor:pointer;">
          <p>Series ${p.NumeroSerie} - ${p.SeriesDescription}</p>
          <p>N° Istanza: ${p.NumeroIstanza}</p>

          <button onclick="window.removeFavourite('${p.SOPInstanceUID}')"
                  style="margin-top:6px;padding:0px 10px;
                         background:#b91c1c;color:white;
                         border:none;border-radius:4px;
                         cursor:pointer;">
             Remove favourite
          </button>
        </div>
        `
      );
    });
  }

  // animazione apertura
  setTimeout(() => {
    panel.style.left = window.iAmAPrior ? '60%' : '80%';
  }, 10);

  document.getElementById('close-button').onclick = () => {
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
      favouritesInitInterval();
    }
  });
}
