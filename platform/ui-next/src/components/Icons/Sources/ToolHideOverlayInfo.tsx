import React from 'react';
import type { IconProps } from '../types';

/**
 * Hide the data drawn over the images.
 *
 * Drawn inline rather than loaded as an <img>, because with currentColor the toolbar
 * turns it on and off by setting a colour, as it does with every other icon. From an
 * external file currentColor would resolve inside the image's own document, where it is
 * black, and the icon would disappear against the dark background.
 *
 * It used to be an image with filter: invert(1) over it, written for a dark drawing on
 * light. Applied to a drawing that was already light it did the opposite: the stroke went
 * nearly black and the amber bar went midnight blue, so all anyone saw of the icon was
 * the diagonal bar, in the wrong colour.
 */
export const ToolHideOverlayInfo = (props: IconProps) => (
  <svg
    // The fill has to be turned off with an inline style, not with the attribute.
    //
    // The bar passes className="... fill-current", and a CSS class always beats a
    // presentation attribute: fill="none" lost, the drawing was filled, and what showed
    // was a blot where the eye should be. An inline style beats the class, and it stays
    // the only thing imposed here: size, class and colour still come from outside.
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
