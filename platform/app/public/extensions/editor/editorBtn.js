/* eslint-disable default-case */

const editorInitInterval = () => {
  const intervalEditorExt = setInterval(() => {
    if (document.getElementById('trackedMeasurements-btn')) {
      clearInterval(intervalEditorExt);
      injectEditorBtn();
    }
  }, 100);

  // The check interval is stopped after a while regardless, for the sake of performance
  setTimeout(() => {
    clearInterval(intervalEditorExt);
  }, 10000);
};

const injectEditorBtn = () => {
  if (document.getElementById('editor-btn')) {
    return
  }
  // Attach the button below the measurements one, in the right-hand panel
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
        <img id="close-editor-button" style="width:22px" src="./assets/right-arrow.png" />
        <p>${window.iAmAPrior ? 'Notes on priors' : 'Note'}</p>
        </div>
         <div id="main-area-editor">
            <div id="saved-notes-area">

            </div>
            <div id="area-editor">

             </div>
      <button id="save-text">Save a note for this study</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', editorToolsHtml);
  var quill = new Quill('#area-editor', {
    theme: 'snow',
  });

  //Animazione comparsa editor-tools
  setTimeout(() => {
    document.getElementById('editor-tools').style.left = `${window.iAmAPrior ? '60%' : '80%'}`;
    // Fit the grid's width to the newly opened panel
    if (
      document.body.classList.contains('priors-injected-iframe') ||
      document.body.classList.contains('priors-same-tab')
    ) {
      return;
    } //Non applico riadattamento se cìè uno priors sulla destra
    setTimeout(() => {
      const widthPannelloSx = parseFloat(
        window.getComputedStyle(document.querySelector('.mdv-new-panel')).width
      );
      const favouritesPanelLeftPosition = parseFloat(
        window.getComputedStyle(document.getElementById('editor-tools')).left
      );
      const valoreDefinitivo = favouritesPanelLeftPosition - widthPannelloSx;
      document.querySelector('[data-cy="viewport-grid"]').style.width = `${valoreDefinitivo}px`;
    }, 350);
  }, 0);

  let nota = {};
  const insertNoteIntoDom = () => {
    let savedDelta = localStorage.getItem('quillContent');
    let noteFound = false;
    if (!savedDelta) {
      return;
    }
    savedDelta = JSON.parse(savedDelta);
    if (savedDelta.length > 0) {
      savedDelta.forEach(element => {
        if (element.studyInstanceUID === window.mdvStudyInstanceUIDs) {
          nota.ops = element.ops;
          noteFound = true;
        }
      });
      if (noteFound) {
        console.log('Contenuto caricato correttamente.');
        const savedNotesArea = document.getElementById('saved-notes-area');
        savedNotesArea.insertAdjacentHTML(
          'afterbegin',
          `
      <div onclick="window.handleNotaClick(this)" class="saved-note">
          <p>Load the saved note</p>
        </div>`
        );
      } else {
        console.log('No note found.');
      }
    } else {
      console.log('No note found.');
    }
  };

  window.handleNotaClick = e => {
    if (
      confirm(
        "Loading the note will overwrite anything written so far. Go ahead?"
      ) == true
    ) {
      quill.setContents(nota);
    }
  };

  const salvaTesto = () => {
    //Ottengo le note attuali
    let currentNotes = [];
    if (localStorage.getItem('quillContent')) {
      currentNotes = JSON.parse(localStorage.getItem('quillContent'));
    }
    const delta = quill.getContents();
    delta.studyInstanceUID = window.mdvStudyInstanceUIDs;
    // Check there is no note for this studyInstanceUID already, so no duplicate is added; overwrite if there is
    const studyInstanceUID = window.mdvStudyInstanceUIDs; // UID corrente

    // Check whether the array of current notes is empty
    if (currentNotes.length === 0) {
      // Se è vuoto, inserisci direttamente il delta
      currentNotes.push(delta);
    } else {
      let found = false;

      // Walk the array of current notes
      for (let i = 0; i < currentNotes.length; i++) {
        // Check whether an entry with the same studyInstanceUID is already there
        if (currentNotes[i].studyInstanceUID === studyInstanceUID) {
          // If it is, replace it with the new delta
          found = true;
          if (confirm('This study already has a saved note. Overwrite it?') == true) {
            currentNotes[i] = delta;
          } else {
            return;
          }
          break;
        }
      }

      // If nothing with that UID was found, add the new delta
      if (!found) {
        currentNotes.push(delta);
      }
    }
    const currentNotesString = JSON.stringify(currentNotes);
    localStorage.setItem('quillContent', currentNotesString);

    console.log('Saved.');
    alert('Saved');

    if (document.querySelector('.saved-note')) {
      document.querySelector('.saved-note').remove();
    }
    insertNoteIntoDom();
  };
  document.getElementById('save-text').addEventListener('click', salvaTesto);
  insertNoteIntoDom();

  document.getElementById('close-editor-button').addEventListener('click', () => {
    document.querySelector('[data-cy="viewport-grid"]').style.width = '100%';
    document.getElementById('editor-tools').style.left = '100%';
    setTimeout(() => {
      document.getElementById('editor-tools').remove();
    }, 300);
  });
};

// The extension is lost every time the panel opens or closes. Catch the open and close events and rebuild it
if (!window.portableVersion) {
  window.addEventListener('panelOpen', function (event) {
    if (!event.detail.isOpen && event.detail.side !== 'left') {
      editorInitInterval();
    }
  });
}
