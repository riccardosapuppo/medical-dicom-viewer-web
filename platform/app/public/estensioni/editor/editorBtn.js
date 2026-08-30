/* eslint-disable default-case */

const editorInitInterval = () => {
  const intervalEditorExt = setInterval(() => {
    if (document.getElementById('trackedMeasurements-btn')) {
      clearInterval(intervalEditorExt);
      injectEditorBtn();
    }
  }, 100);

  //A prescindere blocco l'intervallo check dopo un tot per performance
  setTimeout(() => {
    clearInterval(intervalEditorExt);
  }, 10000);
};

const injectEditorBtn = () => {
  if (document.getElementById('editor-btn')) {
    return
  }
  //Attacco pulsante sotto quello delle misurazioni nel pannello a dx
  document.getElementById('trackedMeasurements-btn').parentElement.insertAdjacentHTML(
    'afterend',
    `
    <div id="editor-btn"
    class="text-primary-active hover:cursor-pointer">
    <img style="width:22px" src="./assets/edit.png" />
    </div>
    `
  );
  const editorBtn = document.getElementById('editor-btn');
  editorBtn.addEventListener('click', createEditorFunc);
};

const createEditorFunc = () => {
  const editorToolsHtml = `
    <div id="editor-tools">
        <div id="intestazione">
        <img id="chiudi-editor-button" style="width:22px" src="./assets/right-arrow.png" />
        <p>${window.sonoUnoStorico ? 'Note storico' : 'Note'}</p>
        </div>
         <div id="main-area-editor">
            <div id="area-note-salvate">

            </div>
            <div id="area-editor">

             </div>
      <button id="salva-testo">Salva note per questo studio</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', editorToolsHtml);
  var quill = new Quill('#area-editor', {
    theme: 'snow',
  });

  //Animazione comparsa editor-tools
  setTimeout(() => {
    document.getElementById('editor-tools').style.left = `${window.sonoUnoStorico ? '60%' : '80%'}`;
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
      const leftPositionPreferitiPanel = parseFloat(
        window.getComputedStyle(document.getElementById('editor-tools')).left
      );
      const valoreDefinitivo = leftPositionPreferitiPanel - widthPannelloSx;
      document.querySelector('[data-cy="viewport-grid"]').style.width = `${valoreDefinitivo}px`;
    }, 350);
  }, 0);

  let nota = {};
  const inserisciNotaDom = () => {
    let savedDelta = localStorage.getItem('quillContent');
    let notaTrovata = false;
    if (!savedDelta) {
      return;
    }
    savedDelta = JSON.parse(savedDelta);
    if (savedDelta.length > 0) {
      savedDelta.forEach(element => {
        if (element.studyInstanceUID === window.mdvStudyInstanceUIDs) {
          nota.ops = element.ops;
          notaTrovata = true;
        }
      });
      if (notaTrovata) {
        console.log('Contenuto caricato correttamente.');
        const areaNoteSalvate = document.getElementById('area-note-salvate');
        areaNoteSalvate.insertAdjacentHTML(
          'afterbegin',
          `
      <div onclick="window.handleNotaClick(this)" class="nota-salvata">
          <p>Carica nota salvata</p>
        </div>`
        );
      } else {
        console.log('Nessuna nota trovata.');
      }
    } else {
      console.log('Nessuna nota trovata.');
    }
  };

  window.handleNotaClick = e => {
    if (
      confirm(
        "Il caricamento della nota sovrascriverà l'eventuale contenuto scritto finora. Procedere?"
      ) == true
    ) {
      quill.setContents(nota);
    }
  };

  const salvaTesto = () => {
    //Ottengo le note attuali
    let noteAttuali = [];
    if (localStorage.getItem('quillContent')) {
      noteAttuali = JSON.parse(localStorage.getItem('quillContent'));
    }
    const delta = quill.getContents();
    delta.studyInstanceUID = window.mdvStudyInstanceUIDs;
    //Verifico che non ca già una nota per quello studyInstanceUID così da non aggiungere duplicati, eventualmente sovrascrivo
    const studyInstanceUID = window.mdvStudyInstanceUIDs; // UID corrente

    // Controlla se l'array di note attuali è vuoto
    if (noteAttuali.length === 0) {
      // Se è vuoto, inserisci direttamente il delta
      noteAttuali.push(delta);
    } else {
      let found = false;

      // Cicla attraverso l'array delle note attuali
      for (let i = 0; i < noteAttuali.length; i++) {
        // Controlla se esiste già un elemento con lo stesso studyInstanceUID
        if (noteAttuali[i].studyInstanceUID === studyInstanceUID) {
          // Se lo trovi, sostituisci l'elemento con il nuovo delta
          found = true;
          if (confirm('Hai già una nota salvata per questo studio, vuoi sovrasciverla?') == true) {
            noteAttuali[i] = delta;
          } else {
            return;
          }
          break;
        }
      }

      // Se non è stato trovato alcun elemento con lo stesso UID, aggiungi il nuovo delta
      if (!found) {
        noteAttuali.push(delta);
      }
    }
    const noteAttualiString = JSON.stringify(noteAttuali);
    localStorage.setItem('quillContent', noteAttualiString);

    console.log('Contenuto salvato correttamente.');
    alert('Contenuto salvato correttamente');

    if (document.querySelector('.nota-salvata')) {
      document.querySelector('.nota-salvata').remove();
    }
    inserisciNotaDom();
  };
  document.getElementById('salva-testo').addEventListener('click', salvaTesto);
  inserisciNotaDom();

  document.getElementById('chiudi-editor-button').addEventListener('click', () => {
    document.querySelector('[data-cy="viewport-grid"]').style.width = '100%';
    document.getElementById('editor-tools').style.left = '100%';
    setTimeout(() => {
      document.getElementById('editor-tools').remove();
    }, 300);
  });
};

// Ogni volta che il pannello si apre/chiude perdo l'estensione creata. Intercetto l'evento apertura/chiusura e ricreo
if (!window.portableVersion) {
  window.addEventListener('panelOpen', function (event) {
    if (!event.detail.isOpen && event.detail.side !== 'left') {
      editorInitInterval();
    }
  });
}
