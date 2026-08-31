import React from 'react';
import type { IconProps } from '../types';

/**
 * Scorrimento della serie con la rotellina.
 *
 * In linea come la precedente, e per lo stesso motivo: cosi' lo stato attivo si
 * ottiene impostando un colore. Era un'immagine che veniva tinta da una catena
 * di filtri - brightness, sepia, saturate, hue-rotate - messa li' per ottenere
 * il rosso aziendale. Una tinta scritta come filtro non compare in nessuna
 * ricerca di colori, ed e' sopravvissuta a tre passate di ritinta.
 */
export const ToolStackScrollWheel = (props: IconProps) => (
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
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect
      x="5.5"
      y="7.5"
      width="13"
      height="9"
      rx="1.4"
    />
    <path
      d="M7.5 5h9M7.5 19h9"
      opacity="0.6"
    />
    <path d="M12 10.2l-2 2M12 10.2l2 2M12 13.8l-2-2M12 13.8l2-2" />
  </svg>
);

export default ToolStackScrollWheel;
