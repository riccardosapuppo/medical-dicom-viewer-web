import React from 'react';

import RadiologyViewport from './viewports/RadiologyViewport';

/**
 * The mode points every image viewport at this component. It renders the stock
 * Cornerstone viewport and lays the montage over it, so the display sets it
 * accepts are exactly the ones Cornerstone accepts.
 *
 * The services are handed down as props rather than left to context. The
 * viewport this wraps reads them from its own props, so a wrapper that only
 * spreads what the grid passes leaves them undefined, and the viewport then
 * fails while rendering on a line that has nothing to do with the cause. This
 * is the same injection the stock registration does, for the same reason.
 */
export default function getViewportModule({ servicesManager, commandsManager }: withAppTypes) {
  const Viewport = (props: Record<string, unknown>) => {
    const { toolbarService } = servicesManager.services;

    return (
      <RadiologyViewport
        {...(props as never)}
        toolbarService={toolbarService}
        servicesManager={servicesManager}
        commandsManager={commandsManager}
      />
    );
  };

  return [
    {
      name: 'radiology',
      component: Viewport,
    },
  ];
}
