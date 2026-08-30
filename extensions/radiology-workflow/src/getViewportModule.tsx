import React from 'react';

import RadiologyViewport from './viewports/RadiologyViewport';

/**
 * The mode points every image viewport at this component. It renders the stock
 * OHIF Cornerstone viewport and adds the montage on top, so the display sets it
 * accepts are exactly the ones Cornerstone accepts.
 */
export default function getViewportModule() {
  return [
    {
      name: 'radiology',
      component: (props: Record<string, unknown>) => <RadiologyViewport {...(props as never)} />,
    },
  ];
}
