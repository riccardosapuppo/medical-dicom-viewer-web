/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable default-case */
import saveHP from '../saveHP'; //Funzione per salvare lo stato attuale della griglia, istanze ecc.

function formatPN(name) {
  if (!name) {
    return;
  }

  let nameToUse = name.Alphabetic ?? name;
  if (typeof nameToUse === 'object') {
    nameToUse = '';
  }

  // Convert the first ^ to a ', '. String.replace() only affects
  // the first appearance of the character.
  const commaBetweenFirstAndLast = nameToUse.replace('^', ', ');

  // Replace any remaining '^' characters with spaces
  const cleaned = commaBetweenFirstAndLast.replace(/\^/g, ' ');

  // Trim any extraneous whitespace
  return cleaned.trim();
}

const printInitInterval = () => {
  const intervalPrintExt = setInterval(() => {
    if (document.getElementById('trackedMeasurements-btn')) {
      clearInterval(intervalPrintExt);
      injectPrintBtn();
    }
  }, 100);

  //A prescindere blocco l'intervallo check dopo un tot per performance
  setTimeout(() => {
    clearInterval(intervalPrintExt);
  }, 10000);
};

const injectPrintBtn = () => {
  //Attacco pulsante sotto quello delle misurazioni nel pannello a dx
  document.getElementById('trackedMeasurements-btn').parentElement.insertAdjacentHTML(
    'afterend',
    `
    <div id="print-btn"
    class="text-primary-active hover:cursor-pointer">
    <img style="width:22px" src="./assets/printer.png" />
    </div>
    `
  );
  const printBtn = document.getElementById('print-btn');
  printBtn.addEventListener('click', createPrint);
  // printBtn.addEventListener('click', createIframePrint);
};

const createPrint = () => {
  //L'area di anteprima stampa è a dimensioni fisse in base al formato (es. a4 width: 210mm;height: 297mm) ma in base al monitor mi può venire tagliato quindi lo scalo
  //dinamicamente in base all'altezza del monitor
  //Salvo lo stato attuale della griglia e serie così da ripristinarlo se esco dalla stampa
  document.querySelector('[data-cy="storeState"]').click();

  // scalableElement.style.transform = `scale(${scaleFactor})`;
  //Di default attivo sempre lo strumento WL
  document.querySelector('[data-cy="WindowLevel"]').click();
  document.body.className = 'bg-black overflow-hidden iframe-stampa a3';
  document.body.classList.remove('nomore-stampa');
  const nomePaziente = window.mdvInstance.PatientName
    ? formatPN(window.mdvInstance.PatientName.Alphabetic)
    : null;
  const descrizioneStudio = window.mdvInstance.StudyDescription;
  const dataStudio = window.mdvInstance.StudyDate;

  const printToolsHtml = `
    <div id="info-studio">
      <p>${nomePaziente}, ${descrizioneStudio} del ${dataStudio}</p>
     </div>

    <div id="print-tools">

    <div class="riquadro-strumenti" id="strumenti-modifica-immagine">
      <div class="col active wl-print-btn">
      <img src="./assets/tool-window-level.png" />
    </div>
   <div class="col move-print-btn">
      <img src="./assets/tool-move.png" />
     </div>
    </div>

    <div class="riquadro-strumenti" id="intestazione">
    <label for="intestazioneInput">Mostra intestazione pagina</label><br>
    <input type="checkbox" id="intestazioneInput" name="intestazioneInput" checked>
    </div>

    <div class="riquadro-strumenti" id="misurazioni">
    <label for="misurazioniInput">Mostra misurazioni effettuate</label><br>
    <input type="checkbox" id="misurazioniInput" name="misurazioniInput" checked>
    </div>

     <div class="riquadro-strumenti" id="formato-carta">
        <label for="formatoCartaSelect">Formato carta</label>
        <select name="formatoCartaSelect" id="formatoCartaSelect">
          <option value="a3" selected>A3</option>
          <option value="a4">A4</option>
        </select>
    </div>

     <div class="riquadro-strumenti" id="orientamento-carta">
        <label for="orientamentoCartaSelect">Orientamento</label>
        <select name="orientamentoCartaSelect" id="orientamentoCartaSelect">
          <option value="verticale" selected>Verticale</option>
          <option value="orizzontale">Orizzontale</option>
        </select>
    </div>

    <div class="riquadro-strumenti" id="cosa-stampare">
  <fieldset>
  <legend>Seleziona per la stampa:</legend>

  <div>
    <input type="radio" id="immagineattuale" name="cosastampare" value="immagineattuale" checked />
    <label for="immagineattuale">Immagine attuale</label>
  </div>

  <div>
    <input type="radio" id="serieattuale" name="cosastampare" value="serieattuale" />
    <label for="serieattuale">Serie attuale</label>
  </div>

  <div>
    <input type="radio" id="studioattuale" name="cosastampare" value="studioattuale"  />
    <label for="studioattuale">Studio attuale</label>
  </div>

  <div>
    <input type="radio" id="preferiti" name="cosastampare" value="preferiti"  />
    <label for="preferiti">Preferiti</label>
  </div>
    </fieldset>

    </div>

    <div class="riquadro-strumenti" id="disposizione">
   <label for="disposizione">Disposizione</label>
  <select name="disposizione" id="disposizioneSelect">
    <option value="1x1">1x1</option>
    <option value="1x2" selected>1x2</option>
    <option value="1x3">1x3</option>

    <option value="2x1">2x1</option>
    <option value="2x2">2x2</option>
    <option value="2x3">2x3</option>

     <option value="3x1">3x1</option>
    <option value="3x2">3x2</option>
    <option value="3x3">3x3</option>

     <option value="4x1">4x1</option>
    <option value="4x2">4x2</option>
    <option value="4x3">4x3</option>
  </select>
  </div>
    <div>
      <button id="annulla-button">Annulla</button>
      <button id="print-button">Stampa</button>
    </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', printToolsHtml);
  //Di default do sempre Immagine attuale che non è altro che la viewport attiva a pieno schermo
  const viewportAttiva = document.querySelector('.mdv-selected');
  //Nascondo riquadro disposizione di default
  document.getElementById('disposizione').style.display = 'none';
  viewportAttiva.classList.add('viewport-primo-piano');

  //Cosa stampare radio buttons change
  const radioBtnCosaStampare = document.querySelectorAll('[name="cosastampare"]');
  radioBtnCosaStampare.forEach(radio => {
    radio.addEventListener('change', cosaStampareFunc);
  });
  function cosaStampareFunc(e) {
    const valueRadio = e.target.value;
    const riquadroDisposizione = document.getElementById('disposizione');
    const viewportAttiva = document.querySelector('.mdv-selected');
    //Nascondo riquadro disposizione di default
    if (valueRadio === 'immagineattuale') {
      riquadroDisposizione.style.display = 'none';
      //Eseguo doppio click sulla viewport mdv-selected così da avere quella attuale in primo piano
      viewportAttiva.classList.add('viewport-primo-piano');
    } else if (valueRadio === 'preferiti') {
      //Salvo gli attuali preferiti di window.preferiti come hanging protocol così da visualizzarli nella griglia
      saveHP();
      riquadroDisposizione.style.display = 'flex';
      viewportAttiva.classList.remove('viewport-primo-piano');
      //Applico hangingProtocol dei preferiti
      document.querySelector('[data-cy="Layout"]').click();
      setTimeout(() => {
        document.querySelector('.Preferiti').click();
      }, 0);
    } else {
      //Metto il layout griglia di default 1x2 se selezionato
      if (document.getElementById('disposizioneSelect').value === '1x2') {
        document.querySelector('[data-cy="Layout"]').click();
        setTimeout(() => {
          document.querySelector('[data-cy="Layout-0-1"]').click();
        }, 0);
      }
      viewportAttiva.classList.remove('viewport-primo-piano');
      riquadroDisposizione.style.display = 'flex';
    }
  }

  //Strumenti WL e Move
  const toolImagePrintBtns = document.querySelectorAll('#strumenti-modifica-immagine .col');
  toolImagePrintBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      for (const a of toolImagePrintBtns) {
        a.classList.remove('active');
      }
      btn.classList.add('active');
      if (btn.classList.contains('wl-print-btn')) {
        document.querySelector('[data-cy="WindowLevel"]').click();
      } else if (btn.classList.contains('move-print-btn')) {
        document.querySelector('[data-cy="Pan"]').click();
      }
    });
  });

  //Mostra o meno intestazione
  document.getElementById('intestazioneInput').addEventListener('click', e => {
    console.log(e.target.checked);
    if (!e.target.checked) {
      document.body.classList.add('nascondi-intestazione-stampa');
    } else {
      document.body.classList.remove('nascondi-intestazione-stampa');
    }
  });

  //Mostra o meno misurazioni
  document.getElementById('misurazioniInput').addEventListener('click', e => {
    console.log(e.target.checked);
    if (!e.target.checked) {
      document.body.classList.add('nascondi-misurazioni-stampa');
    } else {
      document.body.classList.remove('nascondi-misurazioni-stampa');
    }
  });

  //Formato carta
  document.getElementById('formatoCartaSelect').addEventListener('change', e => {
    //Al change riporto orientamento sempre su verticale
    document.getElementById('orientamentoCartaSelect').value = 'verticale';
    const valueFormato = e.target.value;
    if (valueFormato === 'a3') {
      document.body.className = 'bg-black overflow-hidden iframe-stampa a3';
    } else if (valueFormato === 'a4') {
      document.body.className = 'bg-black overflow-hidden iframe-stampa a4';
    }
  });

  //Orientamento carta
  document.getElementById('orientamentoCartaSelect').addEventListener('change', e => {
    const valueFormato = document.getElementById('formatoCartaSelect').value;
    const valueOrientamento = e.target.value;
    if (valueOrientamento === 'verticale') {
      document.body.className = `bg-black overflow-hidden iframe-stampa ${valueFormato}`;
    } else if (valueOrientamento === 'orizzontale') {
      document.body.className = `bg-black overflow-hidden iframe-stampa ${valueFormato}-orizzontale`;
    }
  });

  //Layout griglia stampa
  document.getElementById('disposizione').addEventListener('change', cambiaGrigliaStampa);
  function cambiaGrigliaStampa(e) {
    const layout = e.target.value;
    document.querySelector('[data-cy="Layout"]').click();
    setTimeout(() => {
      switch (layout) {
        case '1x1':
          document.querySelector('[data-cy="Layout-0-0"]').click();
          break;
        case '1x2':
          document.querySelector('[data-cy="Layout-0-1"]').click();
          break;
        case '1x3':
          document.querySelector('[data-cy="Layout-0-2"]').click();
          break;
        case '2x1':
          document.querySelector('[data-cy="Layout-1-0"]').click();
          break;
        case '2x2':
          document.querySelector('[data-cy="Layout-1-1"]').click();
          break;
        case '2x3':
          document.querySelector('[data-cy="Layout-1-2"]').click();
          break;
        case '3x1':
          document.querySelector('[data-cy="Layout-2-0"]').click();
          break;
        case '3x2':
          document.querySelector('[data-cy="Layout-2-1"]').click();
          break;
        case '3x3':
          document.querySelector('[data-cy="Layout-2-2"]').click();
          break;
        case '4x1':
          document.querySelector('[data-cy="Layout-3-0"]').click();
          break;
        case '4x2':
          document.querySelector('[data-cy="Layout-3-1"]').click();
          break;
        case '4x3':
          document.querySelector('[data-cy="Layout-3-2"]').click();
          break;
      }
    }, 0);
  }

  document.getElementById('annulla-button').addEventListener('click', () => {
    //Ripristino stato precedente griglia e serie
    document.querySelector('[data-cy="restoreState"]').click();
    document.body.classList.remove('iframe-stampa');
    document.body.classList.remove('nascondi-intestazione-stampa');
    document.body.classList.remove('nascondi-misurazioni-stampa');
    document.body.classList.add('nomore-stampa');
    document.getElementById('print-tools').remove();
  });

  document.getElementById('print-button').addEventListener('click', () => {
    const scalableElement = document.querySelector('.mdv-main-area');
    const cornerstoneViewport = document.querySelectorAll('.cornerstone-canvas');
    // for (const a of cornerstoneViewport) {
    //   a.style.width = '210mm';
    //   a.style.height = '297mm';
    //   setTimeout(() => {
    //     a.style.minWidth = 'unset';
    //     a.style.minHeight = 'unset';
    //   }, 1000);
    // }
    window.print();
  });
};

const createIframePrint = () => {
  //Verifico se c'è già l'iframe, se c'è è stato sicuramente nascosto
  if (document.getElementById('iframe-print')) {
    document.getElementById('iframe-print').classList.remove('hide');
    return;
  }
  // window.print();
  //Creo un iframe dell'indirizzo attuale così da poter modificare il tutto nell'iframe e non nello studio attuale visualizzato
  const iframe = document.createElement('iframe');

  // Imposta l'attributo src dell'iframe all'indirizzo attuale
  iframe.src = window.location.href + '&print=ok';
  iframe.id = 'iframe-print';
  iframe.style.cssText = `
  border: none;
    height: 100vh;
    width: 100%;
    z-index: 9999999;
    position: fixed;
    top: 0;
    bottom: 0;
    left:0%;
  iframe.style.border = 'none';
  `;

  // Appendi l'iframe al body
  document.body.appendChild(iframe);
};

// Ogni volta che il pannello si apre/chiude perdo l'estensione creata. Intercetto l'evento apertura/chiusura e ricreo
window.addEventListener('panelOpen', function (event) {
  if (!event.detail.isOpen && event.detail.side !== 'left') {
    console.log(event.target);
    printInitInterval();
  }
});

//Ascolto i messaggi dall'iframe così da inviare il comando chiudi e rimuovere l'iframe chiedendolo lui stesso

function riceviMessaggioFromIframe(event) {
  if (event.data === 'REMOVE_PRINT_IFRAME') {
    const iframe = document.getElementById('iframe-print');
    if (iframe) {
      iframe.classList.add('hide');
    }
  }
}

window.addEventListener('message', riceviMessaggioFromIframe, false);
/***********************************************************************************************************************************/

/********  PARTE 2 - SONO NELL'IFRAME DI STAMPA ******************************/

// Se sono all'interno dell'iframe stampa (creato al click della relativa icona), eseguo determinate azioni
if (window.location.href.includes('&print=ok')) {
  //Verifico che il frame sia caricato del tutto prima di poterlo manipolare
  const isIframeReady = setInterval(() => {
    if (document.querySelector('[data-cy="side-panel-header-right"]')) {
      clearInterval(isIframeReady);
      sistemoIframeStampa();
    }
  }, 500);
  //A prescindere blocco l'intervallo check dopo un tot per performance
  setTimeout(() => {
    clearInterval(isIframeReady);
  }, 10000);

  const sistemoIframeStampa = () => {
    document.body.classList.add('iframe-stampa');

    const printToolsHtml = `
      <div id="print-tools">

      <div class="riquadro-strumenti" id="cosa-stampare">
      <fieldset>
    <legend>Seleziona per la stampa:</legend>

    <div>
      <input type="radio" id="immagineattuale" name="cosastampare" value="immagineattuale" checked />
      <label for="immagineattuale">Immagine attuale</label>
    </div>

    <div>
      <input type="radio" id="serieattuale" name="cosastampare" value="serieattuale" />
      <label for="serieattuale">Serie attuale</label>
    </div>

      <div>
      <input type="radio" id="studioattuale" name="cosastampare" value="studioattuale"  />
      <label for="studioattuale">Studio attuale</label>
      </div>
      </fieldset>

      </div>

      <div class="riquadro-strumenti" id="misurazioni">
      <label for="misurazioniInput">Mostra misurazioni effettuate</label><br>
      <input type="checkbox" id="misurazioniInput" name="misurazioniInput" checked>
      </div>

      <div class="riquadro-strumenti" id="disposizione">
     <label for="disposizione">Disposizione</label>
    <select name="disposizione" id="disposizioneSelect">
      <option value="1x1">1x1</option>
      <option value="1x2" selected>1x2</option>
      <option value="1x3">1x3</option>

      <option value="2x1">2x1</option>
      <option value="2x2">2x2</option>
      <option value="2x3">2x3</option>

       <option value="3x1">3x1</option>
      <option value="3x2">3x2</option>
      <option value="3x3">3x3</option>

       <option value="4x1">4x1</option>
      <option value="4x2">4x2</option>
      <option value="4x3">4x3</option>
    </select>
    </div>
      <div>
        <button id="annulla-button">Annulla</button>
        <button id="print-button">Stampa</button>
      </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', printToolsHtml);

    //Cosa stampare radio buttons change
    const radioBtnCosaStampare = document.querySelectorAll('[name="cosastampare"]');
    radioBtnCosaStampare.forEach(radio => {
      radio.addEventListener('change', cosaStampareFunc);
    });
    function cosaStampareFunc(e) {
      const valueRadio = e.target.value;
      const riquadroDisposizione = document.getElementById('disposizione');
      const viewportAttiva = document.querySelector('.mdv-selected');
      //Nascondo riquadro disposizione di default
      if (valueRadio === 'immagineattuale') {
        riquadroDisposizione.style.display = 'none';
        //Eseguo doppio click sulla viewport mdv-selected così da avere quella attuale in primo piano
        viewportAttiva.classList.add('viewport-primo-piano');
      } else {
        viewportAttiva.classList.remove('viewport-primo-piano');
        riquadroDisposizione.style.display = 'flex';
      }
    }

    //Mostra o meno misurazioni
    document.getElementById('misurazioniInput').addEventListener('click', e => {
      console.log(e.target.checked);
      if (!e.target.checked) {
        document.body.classList.add('nascondi-misurazioni-stampa');
      } else {
        document.body.classList.remove('nascondi-misurazioni-stampa');
      }
    });

    //Layout griglia stampa
    document.getElementById('disposizione').addEventListener('change', cambiaGrigliaStampa);
    function cambiaGrigliaStampa(e) {
      const layout = e.target.value;
      document.querySelector('[data-cy="Layout"]').click();
      setTimeout(() => {
        switch (layout) {
          case '1x1':
            document.querySelector('[data-cy="Layout-0-0"]').click();
            break;
          case '1x2':
            document.querySelector('[data-cy="Layout-0-1"]').click();
            break;
          case '1x3':
            document.querySelector('[data-cy="Layout-0-2"]').click();
            break;
          case '2x1':
            document.querySelector('[data-cy="Layout-1-0"]').click();
            break;
          case '2x2':
            document.querySelector('[data-cy="Layout-1-1"]').click();
            break;
          case '2x3':
            document.querySelector('[data-cy="Layout-1-2"]').click();
            break;
          case '3x1':
            document.querySelector('[data-cy="Layout-2-0"]').click();
            break;
          case '3x2':
            document.querySelector('[data-cy="Layout-2-1"]').click();
            break;
          case '3x3':
            document.querySelector('[data-cy="Layout-2-2"]').click();
            break;
          case '4x1':
            document.querySelector('[data-cy="Layout-3-0"]').click();
            break;
          case '4x2':
            document.querySelector('[data-cy="Layout-3-1"]').click();
            break;
          case '4x3':
            document.querySelector('[data-cy="Layout-3-2"]').click();
            break;
        }
      }, 0);
    }

    document.getElementById('annulla-button').addEventListener('click', () => {
      window.parent.postMessage('REMOVE_PRINT_IFRAME', '*');
    });

    // document.getElementById('annulla-button').addEventListener('click', () => {
    //   document.body.classList.remove('iframe-stampa');
    //   document.getElementById('print-tools').style.display = 'none';

    // });

    document.getElementById('print-button').addEventListener('click', () => {
      window.print();
    });
  };
}
