import { ripristinoVisualizzazioneSuUnMonitor } from './ripristinoVisualizzazioneSuUnMonitor';

//la funzione viene richiamata solamente se vi è una eccedenzaLarghezzaMonitorSecondario quindi se la finestra attuale supera la larghezza del monitor su cui è attiva.
let pannelloSX;
let pannelloDX;
let larghezzaPannelloSX;
let larghezzaPannelloDX;
let larghezzaCorrettaViewportDaSxVersoDx;
let larghezzaCorrettaViewportDaDxVersoSx;
let offsetSecondaColonna = 289;
let offsetSecondaColonnaSdoppiata = 306;
let riservaLatoDestro = 32;
let mezzoPannelloSX = 146.5;
let margineSxViewport = 13;

function getLarghezzaOccupataPannello(pannello) {
  if (!pannello) {
    return 0;
  }
  const stylePannello = window.getComputedStyle(pannello);
  const larghezzaPannello =
    pannello.getBoundingClientRect().width ||
    parseFloat(stylePannello.width) ||
    pannello.offsetWidth ||
    0;
  const marginLeft = parseFloat(stylePannello.marginLeft) || 0;
  const marginRight = parseFloat(stylePannello.marginRight) || 0;
  const larghezzaOccupata = larghezzaPannello + marginLeft + marginRight;
  return Math.max(0, Math.round(larghezzaOccupata));
}

function riadattaFinestraSuPiuMonitor(
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  // larghezzaMonitorPrimario si riferisce alla larghezza attuale del monitor attivo ovvero nel monitor in cui sta posizionata la finestra prima di allargarsi ed estendersi
  //sull'altro monitor. EccedenzaLarghezzaMonitorSecondario è la larghezza della finestra sull'altro monitor.
  // console.log(
  //   'larghezzaMonitorPrimario: ',
  //   larghezzaMonitorPrimario,
  //   'eccedenzaLarghezzaMonitorSecondario: ',
  //   eccedenzaLarghezzaMonitorSecondario,
  //   'fromLeftToRight: ',
  //   fromLeftToRight
  // );

  sistemaToolbar(larghezzaMonitorPrimario, eccedenzaLarghezzaMonitorSecondario, fromLeftToRight);

  const isBottomDocked = document.body.classList.contains('mdv-study-panel-bottom');
  const pannelliLaterali = document.querySelectorAll('.mdv-new-panel');
  pannelloSX = pannelliLaterali[0];
  pannelloDX = pannelliLaterali[1];

  const layoutAttuale = window.layout;
  const viewports = document.querySelectorAll('.viewport-parent-div');
  if (viewports.length === 0) {
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOTTOM DOCK MODE — logica isolata: nessun pannello laterale sinistro
  // I viewport usano tutta la larghezza disponibile del monitor.
  // ═══════════════════════════════════════════════════════════════════
  if (isBottomDocked) {
    const vpParent = document.querySelector('.viewport-parent-div')?.parentElement;
    const vpParentWidth = vpParent ? vpParent.getBoundingClientRect().width : (larghezzaMonitorPrimario + eccedenzaLarghezzaMonitorSecondario);
    const rightPanelOffset = (larghezzaMonitorPrimario + eccedenzaLarghezzaMonitorSecondario) - vpParentWidth;
    const riserva = Math.max(4, Math.round(rightPanelOffset) + 4);

    // Vincola il pannello bottom al solo monitor primario tramite variabili CSS
    if (fromLeftToRight) {
      document.body.style.setProperty('--mdv-bottom-panel-left', '0px');
      document.body.style.setProperty('--mdv-bottom-panel-right', eccedenzaLarghezzaMonitorSecondario + 'px');
    } else {
      document.body.style.setProperty('--mdv-bottom-panel-left', eccedenzaLarghezzaMonitorSecondario + 'px');
      document.body.style.setProperty('--mdv-bottom-panel-right', '0px');
    }

    transformBottomDock(viewports, larghezzaMonitorPrimario, eccedenzaLarghezzaMonitorSecondario, fromLeftToRight, riserva, layoutAttuale);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // LEFT/RIGHT PANEL MODE — logica originale invariata
  // ═══════════════════════════════════════════════════════════════════
  larghezzaPannelloSX = getLarghezzaOccupataPannello(pannelloSX);
  larghezzaPannelloDX = getLarghezzaOccupataPannello(pannelloDX);

  const pannelloSinistroCompatto = larghezzaPannelloSX < 140;
  offsetSecondaColonna = pannelloSinistroCompatto ? Math.max(32, larghezzaPannelloSX + 8) : 289;
  offsetSecondaColonnaSdoppiata = offsetSecondaColonna + 17;
  riservaLatoDestro = Math.max(32, larghezzaPannelloDX + 4);
  larghezzaCorrettaViewportDaSxVersoDx = larghezzaMonitorPrimario - larghezzaPannelloSX;
  larghezzaCorrettaViewportDaDxVersoSx = larghezzaMonitorPrimario - larghezzaPannelloDX;
  mezzoPannelloSX = (larghezzaPannelloSX + 4) / 2;
  margineSxViewport = 13;

  //Se ho la visualizzazione dello storico come iframe nella stessa finestra lo gestisco direttamente nell'altro monitor senza toccare tutto il resto
  if (document.body.classList.contains('storico-injected-iframe')) {
    transformStoricoIframe(
      viewports,
      larghezzaMonitorPrimario,
      eccedenzaLarghezzaMonitorSecondario,
      fromLeftToRight
    );
  } else {
    // eslint-disable-next-line default-case
    switch (layoutAttuale) {
      case '1x1':
        transform1Column(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '1x2':
        transform1Column(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '1x3':
        transform1Column(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '2x1':
        transform2Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '2x2':
        transform2Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '2x3':
        transform2Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '3x1':
        transform3Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '3x2':
        transform3Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '3x3':
        transform3Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '4x1':
        transform4Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '4x2':
        transform4Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
      case '4x3':
        transform4Columns(
          viewports,
          larghezzaMonitorPrimario,
          eccedenzaLarghezzaMonitorSecondario,
          fromLeftToRight
        );
        break;
    }
  }
}

function sistemaToolbar(
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  const toolbarSuperiore = document.querySelector('.mdv-bar');
  const toolbarSuperioreRelative = document.querySelector('.mdv-bar .relative');
  toolbarSuperioreRelative.style.width = larghezzaMonitorPrimario - 13 + 'px';
  const logo = document.querySelector('.logo');
  const divInfoPaziente = document.querySelector('.div-info-paziente');

  const toolbarSoliStrumenti = document.querySelector('.toolbar-child-flex');
  toolbarSoliStrumenti.style.transform = 'scale(0.8)';
  toolbarSoliStrumenti.style.flexWrap = 'wrap';
  logo.style.position = 'relative';
  logo.style.top = '20px';
  if (larghezzaMonitorPrimario > 1300) {
    toolbarSuperiore.style.height = 'auto';
    toolbarSoliStrumenti.style.top = 0;
    toolbarSoliStrumenti.style.transform = 'scale(1)';
    toolbarSoliStrumenti.style.flexWrap = 'nowrap';
    logo.style.top = 0;
    divInfoPaziente.style.marginTop = 0;
  }
  if (larghezzaMonitorPrimario <= 1300) {
    toolbarSuperiore.style.height = '90px';
    toolbarSoliStrumenti.style.top = '23px';
    divInfoPaziente.style.marginTop = '23px';
  }
  if (larghezzaMonitorPrimario <= 915) {
    toolbarSuperiore.style.height = '136px';
    toolbarSoliStrumenti.style.top = '45px';
    divInfoPaziente.style.marginTop = '45px';
  }

  if (!fromLeftToRight) {
    toolbarSuperioreRelative.style.left = eccedenzaLarghezzaMonitorSecondario + 'px';
  } else {
    toolbarSuperioreRelative.style.left = 0;
  }
}

function transformStoricoIframe(
  viewports,
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  const studioPrincipale = document.querySelector('.mdv-main-area');
  const iframeStorico = document.getElementById('iframe-storico');
  iframeStorico.style.position = 'absolute';
  //Ripristino la larghezza corrette delle viewport dello studio principale in base al layout griglia
  if (!document.body.classList.contains('storico-same-tab')) {
    ripristinoVisualizzazioneSuUnMonitor();
  }

  //Da SX Verso DX
  if (fromLeftToRight) {
    //Se non ho abbastanza eccedenza lascio tutto su un solo monitor
    studioPrincipale.style.left = 0;
    if (eccedenzaLarghezzaMonitorSecondario < 600) {
      studioPrincipale.style.width = larghezzaMonitorPrimario / 2 + 'px';
      iframeStorico.style.left = 'auto';
      iframeStorico.style.position = 'relative';
      iframeStorico.style.width = larghezzaMonitorPrimario / 2 - 10 + 'px';
      return;
    }
    //Sistemo studio principale
    studioPrincipale.style.width = '100%';
    studioPrincipale.style.maxWidth = larghezzaMonitorPrimario - 8 + 'px';
    //Sistemo iframe
    iframeStorico.style.width = eccedenzaLarghezzaMonitorSecondario + 'px';
    iframeStorico.style.left = '0';
  }
  //Da DX Verso SX
  else {
    studioPrincipale.style.left = '0';
    studioPrincipale.style.width = eccedenzaLarghezzaMonitorSecondario - 13 + 'px';
    iframeStorico.style.width = larghezzaMonitorPrimario + 5 + 'px';
    iframeStorico.style.left = '0';
  }
}

function transform1Column(
  viewports,
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  const viewport0 = viewports[0];

  if (fromLeftToRight) {
    viewport0.style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
    viewport0.style.left = 0;
    if (viewports[1]) {
      viewports[1].style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
      viewports[1].style.left = 0;
    }
    if (viewports[2]) {
      viewports[2].style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
      viewports[2].style.left = 0;
    }
  }
  //Da destra verso sinistra, solo se nel monitor a sx c'è almeno visibile il pannello sx altrimenti non applico nulla
  else if (eccedenzaLarghezzaMonitorSecondario > larghezzaPannelloSX) {
    const posizioneCorretta = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX;
    viewport0.style.left = posizioneCorretta - 10 + 'px';
    viewport0.style.width = larghezzaCorrettaViewportDaDxVersoSx - 3 + 'px';
    if (viewports[1]) {
      viewports[1].style.left = posizioneCorretta - 10 + 'px';
      viewports[1].style.width = larghezzaCorrettaViewportDaDxVersoSx - 3 + 'px';
    }
    if (viewports[2]) {
      viewports[2].style.left = posizioneCorretta - 10 + 'px';
      viewports[2].style.width = larghezzaCorrettaViewportDaDxVersoSx - 3 + 'px';
    }
  } else {
    ripristinoVisualizzazioneSuUnMonitor();
  }
}

function transform2Columns(
  viewports,
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  const viewport0 = viewports[0];
  //Da sinistra verso destra
  if (fromLeftToRight) {
    //2x1

    viewport0.style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
    //Sistemo la seconda viewport
    if (viewports[1]) {
      viewports[1].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[1].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }

    //2x2
    if (viewports[2]) {
      viewports[2].style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
    }
    if (viewports[3]) {
      viewports[3].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[3].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }
    //2x3
    if (viewports[4]) {
      viewports[4].style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
    }
    if (viewports[5]) {
      viewports[5].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[5].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }
  }
  //Da destra verso sinistra, solo se nel monitor a sx c'è almeno visibile il pannello sx altrimenti non applico nulla
  else if (eccedenzaLarghezzaMonitorSecondario > larghezzaPannelloSX) {
    //2x1
    viewport0.style.left = 0;
    viewport0.style.width = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    if (viewports[1]) {
      viewports[1].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
      viewports[1].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }

    //2x2
    if (viewports[2]) {
      viewports[2].style.left = 0;
      viewports[2].style.width =
        eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    }
    if (viewports[3]) {
      viewports[3].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
      viewports[3].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }
    //2x3
    if (viewports[4]) {
      viewports[4].style.left = 0;
      viewports[4].style.width =
        eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    }
    if (viewports[5]) {
      viewports[5].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
      viewports[5].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }
  } else {
    ripristinoVisualizzazioneSuUnMonitor();
  }
}

function transform3Columns(
  viewports,
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  //3x1
  const viewport0 = viewports[0];
  if (fromLeftToRight) {
    //3x1
    viewport0.style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
    //Sistemo la seconda viewport
    if (viewports[1]) {
      viewports[1].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
      viewports[1].style.left = larghezzaMonitorPrimario / 2 - mezzoPannelloSX + 'px';
    }

    //Sistemo la terza viewport
    if (viewports[2]) {
      viewports[2].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[2].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }


    //3x2
    if (viewports[3]) {
      viewports[3].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
    }
    if (viewports[4]) {
      viewports[4].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
      viewports[4].style.left = larghezzaMonitorPrimario / 2 - mezzoPannelloSX + 'px';
    }
    if (viewports[5]) {
      viewports[5].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[5].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }

    //3x2 layout particolare MPR - Volume 3D principale in alto
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('main3D')
    ) {
      viewport0.style.left = 0;
      viewport0.style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
    }

    //3x2 layout particolare MPR - Piano assiale primario
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('primaryAxial')
    ) {
      viewport0.style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
      if (viewports[1]) {
        viewports[1].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
        viewports[1].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
      }

      if (viewports[2]) {
        viewports[2].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
        viewports[2].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
      }


    }

    //3x3
    if (viewports[6]) {
      viewports[6].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
    }
    if (viewports[7]) {
      viewports[7].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
      viewports[7].style.left = larghezzaMonitorPrimario / 2 - mezzoPannelloSX + 'px';
    }
    if (viewports[8]) {
      viewports[8].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[8].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }

    //3x3 layout particolare MPR - Volume 3D principale a sx
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('primary3D')
    ) {
      viewport0.style.width = larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport + 'px';
      if (viewports[1]) {
        viewports[1].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
        viewports[1].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
      }

      viewports[3].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[3].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }
  }
  //Da destra verso sinistra, solo se nel monitor a sx c'è almeno visibile il pannello sx altrimenti non applico nulla
  else if (eccedenzaLarghezzaMonitorSecondario > larghezzaPannelloSX) {
    //3x1
    viewport0.style.left = 0;
    viewport0.style.width = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    if (viewports[1]) {
      viewports[1].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 + 'px';
      viewports[1].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }

    if (viewports[2]) {
      viewports[2].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 - margineSxViewport + 'px';
      viewports[2].style.left =
        eccedenzaLarghezzaMonitorSecondario -
        offsetSecondaColonna +
        (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 +
        'px';
    }

    //3x2
    if (viewports[3]) {
      viewports[3].style.left = 0;
      viewports[3].style.width =
        eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    }
    if (viewports[4]) {
      viewports[4].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 + 'px';
      viewports[4].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }
    if (viewports[5]) {
      viewports[5].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 - margineSxViewport + 'px';
      viewports[5].style.left =
        eccedenzaLarghezzaMonitorSecondario -
        offsetSecondaColonna +
        (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 +
        'px';
    }

    //3x2 layout particolare MPR - Volume 3D principale in alto
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('main3D')
    ) {
      const posizioneCorretta = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX;
      viewport0.style.left = posizioneCorretta - 10 + 'px';
      viewport0.style.width = larghezzaCorrettaViewportDaDxVersoSx - 3 + 'px';
    }

    //3x2 layout particolare MPR - Piano assiale primario
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('primaryAxial')
    ) {
      viewport0.style.left = 0;
      viewport0.style.width = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
      if (viewports[1]) {
        viewports[1].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
        viewports[1].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
      }

      if (viewports[2]) {
        viewports[2].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
        viewports[2].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
      }


    }

    //3x3
    if (viewports[6]) {
      viewports[6].style.left = 0;
      viewports[6].style.width =
        eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    }
    if (viewports[7]) {
      viewports[7].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 + 'px';
      viewports[7].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }
    if (viewports[8]) {
      viewports[8].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 - margineSxViewport + 'px';
      viewports[8].style.left =
        eccedenzaLarghezzaMonitorSecondario -
        offsetSecondaColonna +
        (larghezzaMonitorPrimario - larghezzaPannelloDX) / 2 +
        'px';
    }

    //3x3 layout particolare MPR - Volume 3D principale a sx
    if (
      document.body.classList.contains('hp-mpr-active') &&
      document.body.classList.contains('primary3D')
    ) {
      viewport0.style.left = 0;
      viewport0.style.width = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
      if (viewports[1]) {
        viewports[1].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
        viewports[1].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
      }

      if (viewports[2]) {
        viewports[2].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
        viewports[2].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
      }


      if (viewports[3]) {
        viewports[3].style.width = larghezzaMonitorPrimario - larghezzaPannelloDX - margineSxViewport + 'px';
        viewports[3].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
      }

    }
  } else {
    ripristinoVisualizzazioneSuUnMonitor();
  }
}

function transform4Columns(
  viewports,
  larghezzaMonitorPrimario,
  eccedenzaLarghezzaMonitorSecondario,
  fromLeftToRight
) {
  const viewport0 = viewports[0];
  if (fromLeftToRight) {
    //METTO TRE A SX E DUE A DX
    //4x1
    viewport0.style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
    //Sistemo la seconda viewport
    if (viewports[1]) {
      viewports[1].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
      viewports[1].style.left = larghezzaMonitorPrimario / 3 - 98 + 'px';
    }

    //Sistemo la terza viewport
    if (viewports[2]) {
      viewports[2].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
      viewports[2].style.left = larghezzaMonitorPrimario / 1.5 - 196 + 'px';
    }

    //Sistemo la quarta viewport
    if (viewports[3]) {
      viewports[3].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[3].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }

    //4x2
    if (viewports[4]) {
      viewports[4].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
    }
    if (viewports[5]) {
      viewports[5].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
      viewports[5].style.left = larghezzaMonitorPrimario / 3 - 98 + 'px';
    }
    if (viewports[6]) {
      viewports[6].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
      viewports[6].style.left = larghezzaMonitorPrimario / 1.5 - 196 + 'px';
    }
    if (viewports[7]) {
      viewports[7].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[7].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }

    //4x3

    if (viewports[8]) {
      viewports[8].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
    }
    if (viewports[9]) {
      viewports[9].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
      viewports[9].style.left = larghezzaMonitorPrimario / 3 - 98 + 'px';
    }
    if (viewports[10]) {
      viewports[10].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 3 + 'px';
      viewports[10].style.left = larghezzaMonitorPrimario / 1.5 - 196 + 'px';
    }
    if (viewports[11]) {
      viewports[11].style.width = eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro + 'px';
      viewports[11].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
    }
  }
  //Da destra verso sinistra, solo se nel monitor a sx c'è almeno visibile il pannello sx altrimenti non applico nulla
  else if (eccedenzaLarghezzaMonitorSecondario > larghezzaPannelloSX) {
    //4x1
    viewport0.style.left = 0;
    viewport0.style.width = eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    if (viewports[1]) {
      viewports[1].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 + 'px';
      viewports[1].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }

    if (viewports[2]) {
      viewports[2].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 - 3 + 'px';
      viewports[2].style.left =
        eccedenzaLarghezzaMonitorSecondario -
        offsetSecondaColonna +
        (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 +
        'px';
    }

    if (viewports[3]) {
      viewports[3].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 - 3 + 'px';
      viewports[3].style.left =
        parseFloat(viewports[2].style.left) + parseFloat(viewports[2].style.width) + 'px';
    }


    //4x2
    if (viewports[4]) {
      viewports[4].style.left = 0;
      viewports[4].style.width =
        eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    }
    if (viewports[5]) {
      viewports[5].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 + 'px';
      viewports[5].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }
    if (viewports[6]) {
      viewports[6].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 - 3 + 'px';
      viewports[6].style.left =
        eccedenzaLarghezzaMonitorSecondario -
        offsetSecondaColonna +
        (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 +
        'px';
    }
    if (viewports[7]) {
      viewports[7].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 - 3 + 'px';
      viewports[7].style.left =
        parseFloat(viewports[2].style.left) + parseFloat(viewports[2].style.width) + 'px';
    }

    //4x3

    if (viewports[8]) {
      viewports[8].style.left = 0;
      viewports[8].style.width =
        eccedenzaLarghezzaMonitorSecondario - larghezzaPannelloSX - margineSxViewport + 'px';
    }
    if (viewports[9]) {
      viewports[9].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 + 'px';
      viewports[9].style.left = eccedenzaLarghezzaMonitorSecondario - offsetSecondaColonna + 'px';
    }
    if (viewports[10]) {
      viewports[10].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 - 3 + 'px';
      viewports[10].style.left =
        eccedenzaLarghezzaMonitorSecondario -
        offsetSecondaColonna +
        (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 +
        'px';
    }
    if (viewports[11]) {
      viewports[11].style.width = (larghezzaMonitorPrimario - larghezzaPannelloDX) / 3 - 3 + 'px';
      viewports[11].style.left =
        parseFloat(viewports[2].style.left) + parseFloat(viewports[2].style.width) + 'px';
    }
  } else {
    ripristinoVisualizzazioneSuUnMonitor();
  }

  //METTO DUE A SX E DUE A DX
  if (eccedenzaLarghezzaMonitorSecondario > 450) {
    if (fromLeftToRight) {
      //4x1
      viewport0.style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
      //Sistemo la seconda viewport
      if (viewports[1]) {
        viewports[1].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
        viewports[1].style.left = larghezzaMonitorPrimario / 2 - mezzoPannelloSX + 'px';
      }

      //Sistemo la terza viewport
      if (viewports[2]) {
        viewports[2].style.width = (eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro) / 2 + 'px';
        viewports[2].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
      }

      //Sistemo la quarta viewport
      if (viewports[3]) {
        viewports[3].style.width = (eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro) / 2 + 'px';
        viewports[3].style.left =
          larghezzaMonitorPrimario - offsetSecondaColonnaSdoppiata + eccedenzaLarghezzaMonitorSecondario / 2 + 'px';
      }


      //4x2
      if (viewports[4]) {
        viewports[4].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
      }
      if (viewports[5]) {
        viewports[5].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
        viewports[5].style.left = larghezzaMonitorPrimario / 2 - mezzoPannelloSX + 'px';
      }
      if (viewports[6]) {
        viewports[6].style.width = (eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro) / 2 + 'px';
        viewports[6].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
      }
      if (viewports[7]) {
        viewports[7].style.width = (eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro) / 2 + 'px';
        viewports[7].style.left =
          larghezzaMonitorPrimario - offsetSecondaColonnaSdoppiata + eccedenzaLarghezzaMonitorSecondario / 2 + 'px';
      }

      //4x3

      if (viewports[8]) {
        viewports[8].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
      }
      if (viewports[9]) {
        viewports[9].style.width = (larghezzaCorrettaViewportDaSxVersoDx - margineSxViewport) / 2 + 'px';
        viewports[9].style.left = larghezzaMonitorPrimario / 2 - mezzoPannelloSX + 'px';
      }
      if (viewports[10]) {
        viewports[10].style.width = (eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro) / 2 + 'px';
        viewports[10].style.left = larghezzaMonitorPrimario - offsetSecondaColonna + 'px';
      }
      if (viewports[11]) {
        viewports[11].style.width = (eccedenzaLarghezzaMonitorSecondario - riservaLatoDestro) / 2 + 'px';
        viewports[11].style.left =
          larghezzaMonitorPrimario - offsetSecondaColonnaSdoppiata + eccedenzaLarghezzaMonitorSecondario / 2 + 'px';
      }
    }
  } else if (eccedenzaLarghezzaMonitorSecondario > larghezzaPannelloSX) {
    //Da implementare due colonne a dx e due a sx per espansione da monitor dx a monitor sx
  } else {
    ripristinoVisualizzazioneSuUnMonitor();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOTTOM DOCK: logica multi-monitor isolata.
// Nessun pannello laterale sinistro → i viewport usano tutta la larghezza.
//
// Principio di distribuzione (identico alla modalità pannello-sx):
//   • Le prime N-1 colonne vanno sul monitor PRIMARIO
//   • L'ultima colonna va sul monitor SECONDARIO
//   • Per fromRightToLeft la prima colonna va sul SECONDARIO (sx), il resto sul PRIMARIO (dx)
// ═══════════════════════════════════════════════════════════════════════════════
function transformBottomDock(viewports, monPri, monSec, ltr, riserva, layout) {
  const cols = parseInt(layout) || 1; // "2x3" → 2, "1x1" → 1
  const rows = parseInt((layout || '').split('x')[1]) || 1;
  const total = cols * rows;
  const gap = 10; // margine bordi viewport

  // Applica width+left a ogni viewport in base alla colonna
  function applicaViewport(idx, width, left) {
    if (viewports[idx]) {
      viewports[idx].style.width = width + 'px';
      viewports[idx].style.left = left + 'px';
    }
  }

  // Larghezze effettive considerando la riserva del pannello destro
  // LTR: primario a sx, riserva si mangia il secondario a dx
  // RTL: primario a dx, riserva si mangia il primario a dx
  const ltrPri = monPri - gap;                    // viewport primario LTR
  const ltrSec = monSec - riserva;                // viewport secondario LTR
  const rtlSec = monSec - gap;                    // viewport secondario RTL (monitor sx)
  const rtlPri = monPri - riserva;                // viewport primario RTL (monitor dx, riserva per pannello DX)
  const rtlPriStart = monSec;                     // dove inizia il primario RTL

  if (cols === 1) {
    for (let i = 0; i < total; i++) {
      if (ltr) {
        applicaViewport(i, ltrPri, 0);
      } else {
        applicaViewport(i, rtlPri, rtlPriStart);
      }
    }
    return;
  }

  if (cols === 2) {
    for (let row = 0; row < rows; row++) {
      const i0 = row * cols;
      const i1 = i0 + 1;
      if (ltr) {
        applicaViewport(i0, ltrPri, 0);
        applicaViewport(i1, ltrSec, monPri);
      } else {
        applicaViewport(i0, rtlSec, 0);
        applicaViewport(i1, rtlPri, rtlPriStart);
      }
    }
    return;
  }

  if (cols === 3) {
    const halfLtrPri = Math.floor(ltrPri / 2);
    const halfRtlPri = Math.floor(rtlPri / 2);
    for (let row = 0; row < rows; row++) {
      const i0 = row * cols;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      if (ltr) {
        applicaViewport(i0, halfLtrPri, 0);
        applicaViewport(i1, halfLtrPri, halfLtrPri);
        applicaViewport(i2, ltrSec, monPri);
      } else {
        applicaViewport(i0, rtlSec, 0);
        applicaViewport(i1, halfRtlPri, rtlPriStart);
        applicaViewport(i2, halfRtlPri, rtlPriStart + halfRtlPri);
      }
    }

    // Gestione layout particolari MPR
    if (document.body.classList.contains('hp-mpr-active')) {
      if (document.body.classList.contains('main3D')) {
        // Volume 3D principale: viewport0 occupa tutto il primario
        applicaViewport(0, monPri, ltr ? 0 : monSec);
      }
      if (document.body.classList.contains('primaryAxial')) {
        // Piano assiale primario: viewport0 su primario, col1+col2 su secondario
        if (ltr) {
          applicaViewport(0, monPri, 0);
          const halfSec = Math.floor((monSec - riserva) / 2);
          applicaViewport(1, halfSec, monPri);
          applicaViewport(2, halfSec, monPri + halfSec);
        }
      }
      if (document.body.classList.contains('primary3D')) {
        // Volume 3D a sx: viewport0 su primario, altri su secondario stacked
        if (ltr) {
          applicaViewport(0, monPri, 0);
          applicaViewport(1, monSec - riserva, monPri);
          if (viewports[3]) applicaViewport(3, monSec - riserva, monPri);
        }
      }
    }
    return;
  }

  if (cols >= 4) {
    const thirdLtrPri = Math.floor(ltrPri / 3);
    const thirdRtlPri = Math.floor(rtlPri / 3);
    for (let row = 0; row < rows; row++) {
      const i0 = row * cols;
      if (ltr) {
        applicaViewport(i0, thirdLtrPri, 0);
        applicaViewport(i0 + 1, thirdLtrPri, thirdLtrPri);
        applicaViewport(i0 + 2, thirdLtrPri, thirdLtrPri * 2);
        applicaViewport(i0 + 3, ltrSec, monPri);
      } else {
        applicaViewport(i0, rtlSec, 0);
        applicaViewport(i0 + 1, thirdRtlPri, rtlPriStart);
        applicaViewport(i0 + 2, thirdRtlPri, rtlPriStart + thirdRtlPri);
        applicaViewport(i0 + 3, thirdRtlPri, rtlPriStart + thirdRtlPri * 2);
      }
    }
    return;
  }
}

export { riadattaFinestraSuPiuMonitor };
