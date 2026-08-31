import React from 'react';
import type { IconProps } from '../types';

/**
 * Nascondi i dati sovrimpressi alle immagini.
 *
 * Disegnata in linea e non caricata come <img>, perche' con currentColor la
 * barra degli strumenti la accende e la spegne impostando un colore, come fa
 * con tutte le altre. Da file esterno currentColor si risolverebbe dentro il
 * documento dell'immagine, dove vale nero, e l'icona sparirebbe sul fondo scuro.
 *
 * Prima era un'immagine con sopra filter: invert(1), scritto per un disegno
 * scuro su chiaro. Applicato a un disegno gia' chiaro faceva l'opposto: il
 * tratto diventava quasi nero e l'ambra della sbarra diventava blu notte, cosi'
 * dell'icona si vedeva solo la sbarra obliqua, del colore sbagliato.
 */
export const ToolHideOverlayInfo = (props: IconProps) => (
  <svg
    // Il riempimento va spento con uno stile in linea, non con l'attributo.
    //
    // La barra passa className="... fill-current", e una classe CSS batte
    // sempre un attributo di presentazione: fill="none" perdeva, il disegno
    // veniva riempito e si vedeva una macchia al posto dell'occhio. Lo stile in
    // linea vince sulla classe, e resta la sola cosa che imponiamo: misura,
    // classe e colore continuano ad arrivare da fuori.
    width="24px"
    height="24px"
    viewBox="0 0 24 24"
    {...props}
    style={{ fill: 'none', ...(props.style || {}) }}
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2.2 12S5.8 5.6 12 5.6 21.8 12 21.8 12 18.2 18.4 12 18.4 2.2 12 2.2 12z" />
    <circle cx="12" cy="12" r="3.1" />
    <path
      d="M4.4 19.6 19.6 4.4"
      strokeWidth="2.4"
    />
  </svg>
);

export default ToolHideOverlayInfo;
