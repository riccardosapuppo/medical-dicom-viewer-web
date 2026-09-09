import React from 'react';
import type { IconProps } from '../types';

/**
 * Scrolling the series with the wheel.
 *
 * Inline like the previous one, and for the same reason: it is how the active state is
 * got by setting a colour. It used to be an image tinted by a chain of filters
 * (brightness, sepia, saturate, hue-rotate) put there to make the company red. A tint
 * written as a filter turns up in no colour search, and it survived three repainting
 * passes.
 */
export const ToolStackScrollWheel = (props: IconProps) => (
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
