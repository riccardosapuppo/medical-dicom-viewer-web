import hpIcon from './../../assets/icons/hp.png';
import logoMdv from './../../assets/icons/logo_mdv.png';
import mprDirect from './../../assets/icons/mpr.png';
import preferiti from './../../assets/icons/preferiti.png';
import preferitiActive from './../../assets/icons/preferiti-active.png';
import { ReactComponent as storicoExpand } from './../../assets/icons/storico-expand.svg';
import { ReactComponent as storicoSameWindow } from './../../assets/icons/storico-same-window.svg';
import { ReactComponent as storicoNewWindow } from './../../assets/icons/storico-new-window.svg';
import { ReactComponent as hideInfoDicom } from './../../assets/icons/tool-hide-info-dicom.svg';
import { ReactComponent as toolStackScroll } from './../../assets/icons/tool-stack-scroll.svg';

import React from 'react';

// Icona stampante (inline, nessun asset esterno) — usata dal pulsante "Stampa"
// della toolbar (vedi modes/longitudinal toolbarButtons).
const PrinterIcon = props =>
  React.createElement(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', fill: 'currentColor', viewBox: '0 0 24 24', ...props },
    React.createElement('path', {
      d: 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z',
    })
  );

const ICONS = {
  /** Tools */
  toolStackScroll: toolStackScroll,
  printer: PrinterIcon,
  /** Mdv **/
  hideInfoDicom: hideInfoDicom,
  storicoExpand: storicoExpand,
  storicoSameWindow: storicoSameWindow,
  storicoNewWindow: storicoNewWindow,
  preferiti: preferiti,
  preferitiActive: preferitiActive,
  logoMdv: logoMdv,
  hpIcon: hpIcon,
  mprDirect: mprDirect,
};

function addIcon(iconName, iconSVG) {
  if (ICONS[iconName]) {
    console.warn(`Icon ${iconName} already exists.`);
  }

  ICONS[iconName] = iconSVG;
}

/**
 * Return the matching SVG Icon as a React Component.
 * Results in an inlined SVG Element. If there's no match,
 * return `null`
 */
export default function getIcon(key, props) {
  const icon = ICONS[key];

  if (!key || !icon) {
    return React.createElement('div', null, 'Missing Icon ' + key);
  }

  if (typeof icon === 'string' && icon.endsWith('.png')) {
    return React.createElement('img', { src: icon, ...props });
  } else {
    return React.createElement(icon, props);
  }
}

export { getIcon, ICONS, addIcon };
