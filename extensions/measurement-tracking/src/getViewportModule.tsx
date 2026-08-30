import React from 'react';

const Component = React.lazy(() => {
  return import(/* webpackPrefetch: true */ './viewports/TrackedCornerstoneViewport');
});

const OHIFCornerstoneViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};

function getViewportModule({ servicesManager, commandsManager, extensionManager }) {
  const ExtendedOHIFCornerstoneTrackingViewport = props => {
    // Modalità sottogriglia (Montage): bypassa il wrapper di tracking e
    // renderizza la viewport montage interna (registrata dall'estensione
    // cornerstone). Nessuna viewport OHIF aggiuntiva viene creata.
    if (props?.viewportOptions?.montage?.enabled === true) {
      const montageEntry = extensionManager.getModuleEntry(
        '@ohif/extension-cornerstone.viewportModule.montage'
      );
      if (montageEntry?.component) {
        const MontageViewport = montageEntry.component;
        return <MontageViewport {...props} />;
      }
    }

    return (
      <OHIFCornerstoneViewport
        servicesManager={servicesManager}
        commandsManager={commandsManager}
        extensionManager={extensionManager}
        {...props}
      />
    );
  };

  return [
    {
      name: 'cornerstone-tracked',
      component: ExtendedOHIFCornerstoneTrackingViewport,
    },
  ];
}

export default getViewportModule;
