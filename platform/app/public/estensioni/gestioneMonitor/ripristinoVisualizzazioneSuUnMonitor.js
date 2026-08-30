/* eslint-disable default-case */
function ripristinoVisualizzazioneSuUnMonitor() {
  // console.log('Ripristino visualizzazione un monitor');
  const layoutAttuale = window.layout;
  const viewports = document.querySelectorAll('.viewport-parent-div');
  if (viewports.length === 0) {
    return;
  }

  ripristinaToolbar();
  ripristinaPannelloBottom();

  //Se ho la visualizzazione dello storico come iframe nella stessa finestra lo gestisco direttamente nell'altro monitor senza toccare tutto il resto
  if (document.body.classList.contains('storico-injected-iframe')) {
    ripristinoUnMonitorConStoricoIframe();
  }
  switch (layoutAttuale) {
    case '1x1':
      ripristino1Column(viewports);
      break;
    case '1x2':
      ripristino1Column(viewports);
      break;
    case '1x3':
      ripristino1Column(viewports);
      break;
    case '2x1':
      ripristino2Columns(viewports);
      break;
    case '2x2':
      ripristino2Columns(viewports);
      break;
    case '2x3':
      ripristino2Columns(viewports);
      break;
    case '3x1':
      ripristino3Columns(viewports);
      break;
    case '3x2':
      ripristino3Columns(viewports);
      break;
    case '3x3':
      ripristino3Columns(viewports);
      break;
    case '4x1':
      ripristino4Columns(viewports);
      break;
    case '4x2':
      ripristino4Columns(viewports);
      break;
    case '4x3':
      ripristino4Columns(viewports);
      break;
  }
}

function ripristinaPannelloBottom() {
  if (!document.body.classList.contains('mdv-study-panel-bottom')) return;
  document.body.style.removeProperty('--mdv-bottom-panel-left');
  document.body.style.removeProperty('--mdv-bottom-panel-right');
}

function ripristinaToolbar() {
  //Se la visualizzazione è con storico a metà non faccio nulla alla toolbar
  if (document.body.classList.contains('storico-injected-iframe')) {
    return;
  }
  const toolbarSuperiore = document.querySelector('.mdv-bar');
  const toolbarSuperioreRelative = document.querySelector('.mdv-bar .relative');
  const toolbarSoliStrumenti = document.querySelector('.toolbar-child-flex');
  const logo = document.querySelector('.logo');
  const divInfoPaziente = document.querySelector('.div-info-paziente');
  logo.style.top = 0;
  divInfoPaziente.style.marginTop = 0;
  toolbarSuperiore.style.height = 'auto';
  toolbarSuperioreRelative.style.width = '100%';
  toolbarSuperioreRelative.style.left = 0;
  toolbarSoliStrumenti.style.width = '100%';
  toolbarSoliStrumenti.style.left = 0;
  toolbarSoliStrumenti.style.top = 0;
  toolbarSoliStrumenti.style.flexWrap = 'nowrap';
  toolbarSoliStrumenti.style.transform = 'scale(1)';
}

function ripristinoUnMonitorConStoricoIframe() {
  //Sistemo studio principale
  const studioPrincipale = document.querySelector('.mdv-main-area');
  studioPrincipale.style.width = '50%';
  studioPrincipale.style.maxWidth = 'none';
  //Sistemo iframe
  const iframeStorico = document.getElementById('iframe-storico');
  iframeStorico.style.position = 'relative';
  iframeStorico.style.width = '50%';
  iframeStorico.style.left = 'auto';
}

function ripristino1Column(viewports) {
  try {
    viewports[0].style.width = '100%';
    viewports[0].style.left = 0;
    if (viewports[1]) {
      viewports[1].style.left = 0;
      viewports[1].style.width = '100%';
    }
    if (viewports[2]) {
      viewports[2].style.left = 0;
      viewports[2].style.width = '100%';
    }
  } catch (err) {
    //Se va in eccezione è perché ancora le viewport non sono tutte disponibili
  }
}

function ripristino2Columns(viewports) {
  try {
    //2x1
    viewports[0].style.width = '50%';
    viewports[0].style.left = '0%';
    viewports[1].style.width = '50%';
    viewports[1].style.left = '50%';
    //2x2
    if (viewports[2]) {
      viewports[2].style.width = '50%';
      viewports[2].style.left = '0%';
    }
    if (viewports[3]) {
      viewports[3].style.width = '50%';
      viewports[3].style.left = '50%';
    }
    //2x3
    if (viewports[4]) {
      viewports[4].style.width = '50%';
      viewports[4].style.left = '0%';
    }
    if (viewports[5]) {
      viewports[5].style.width = '50%';
      viewports[5].style.left = '50%';
    }
  } catch (err) {
    //Se va in eccezione è perché ancora le viewport non sono tutte disponibili
  }
}

function ripristino3Columns(viewports) {
  try {
    //3x1
    viewports[0].style.width = '33.3333%';
    viewports[0].style.left = '0%';
    viewports[1].style.width = '33.3333%';
    viewports[1].style.left = '33.3333%';
    viewports[2].style.width = '33.3333%';
    viewports[2].style.left = '66.6667%';
    //3x2
    if (viewports[3]) {
      viewports[3].style.width = '33.3333%';
      viewports[3].style.left = '0%';
    }
    if (viewports[4]) {
      viewports[4].style.width = '33.3333%';
      viewports[4].style.left = '33.3333%';
    }
    if (viewports[5]) {
      viewports[5].style.width = '33.3333%';
      viewports[5].style.left = '66.6667%';
    }

    //3x2 layout particolare MPR - Volume 3D principale in alto
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('main3D')
    ) {
      viewports[0].style.left = 0;
      viewports[0].style.width = '100%';
    }

    //3x2 layout particolare MPR - Piano assiale primario
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('primaryAxial')
    ) {
      viewports[0].style.width = '66.6667%';
      viewports[1].style.left = '66.6667%';
      viewports[1].style.width = '33.3333%';
      viewports[2].style.left = '66.6667%';
      viewports[2].style.width = '33.3333%';
    }

    //3x3
    if (viewports[6]) {
      viewports[6].style.width = '33.3333%';
      viewports[6].style.left = '0%';
    }
    if (viewports[7]) {
      viewports[7].style.width = '33.3333%';
      viewports[7].style.left = '33.3333%';
    }
    if (viewports[8]) {
      viewports[8].style.width = '33.3333%';
      viewports[8].style.left = '66.6667%';
    }

    //3x3 layout particolare MPR - Volume 3D principale a sx
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('primary3D')
    ) {
      viewports[0].style.width = '66.6667%';
      viewports[1].style.width = '33.3333%';
      viewports[1].style.left = '66.6667%';
      viewports[2].style.width = '33.3333%';
      viewports[2].style.left = '66.6667%';
      viewports[3].style.width = '33.3333%';
      viewports[3].style.left = '66.6667%';
    }
  } catch (err) {
    //Se va in eccezione è perché ancora le viewport non sono tutte disponibili
  }
}

function ripristino4Columns(viewports) {
  try {
    //4x1
    viewports[0].style.width = '25%';
    viewports[0].style.left = '0%';
    viewports[1].style.width = '25%';
    viewports[1].style.left = '25%';
    viewports[2].style.width = '25%';
    viewports[2].style.left = '50%';
    viewports[3].style.width = '25%';
    viewports[3].style.left = '75%';

    //4x2
    if (viewports[4]) {
      viewports[4].style.width = '25%';
      viewports[4].style.left = '0%';
    }
    if (viewports[5]) {
      viewports[5].style.width = '25%';
      viewports[5].style.left = '25%';
    }
    if (viewports[6]) {
      viewports[6].style.width = '25%';
      viewports[6].style.left = '50%';
    }

    if (viewports[7]) {
      viewports[7].style.width = '25%';
      viewports[7].style.left = '75%';
    }

    //4x3
    if (viewports[8]) {
      viewports[8].style.width = '25%';
      viewports[8].style.left = '0%';
    }
    if (viewports[9]) {
      viewports[9].style.width = '25%';
      viewports[9].style.left = '25%';
    }
    if (viewports[10]) {
      viewports[10].style.width = '25%';
      viewports[10].style.left = '50%';
    }

    if (viewports[11]) {
      viewports[11].style.width = '25%';
      viewports[11].style.left = '75%';
    }
  } catch (err) {
    //Se va in eccezione è perché ancora le viewport non sono tutte disponibili
  }
}

export { ripristinoUnMonitorConStoricoIframe, ripristinoVisualizzazioneSuUnMonitor };
