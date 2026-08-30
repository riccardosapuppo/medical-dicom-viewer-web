import { DisplaySetService, ViewportGridService } from '@ohif/core';

const IMAGE_SLICE_SYNC_NAME = 'IMAGE_SLICE_SYNC';

export default function toggleImageSliceSync({
  servicesManager,
  viewports: providedViewports,
  syncId,
  toggledState,
}: withAppTypes & { toggledState?: boolean }) {
  const { syncGroupService, viewportGridService, displaySetService, cornerstoneViewportService } =
    servicesManager.services;

  syncId ||= IMAGE_SLICE_SYNC_NAME;

  const viewports =
    providedViewports || getReconstructableStackViewports(viewportGridService, displaySetService);

  if (toggledState === false) {
    disableSync(syncId, servicesManager, viewports);
    return;
  }

  // Todo: right now we don't have a proper way to define specific
  // viewports to add to synchronizers, and right now it is global or not
  // after we do that, we should do fine grained control of the synchronizers
  const someViewportHasSync = viewports.some(viewport => {
    const syncStates = syncGroupService.getSynchronizersForViewport(
      viewport.viewportOptions.viewportId
    );

    const imageSync = syncStates.find(syncState => syncState.id === syncId);

    return !!imageSync;
  });

  if (toggledState === true) {
    enableSync(syncId, servicesManager, viewports);
    return;
  }

  if (someViewportHasSync) {
    disableSync(syncId, servicesManager, viewports);
    return;
  }

  // create synchronization group and add the viewports to it.
  enableSync(syncId, servicesManager, viewports);
}

function enableSync(
  syncName: string,
  servicesManager: AppTypes.ServicesManager,
  viewports?: ReturnType<typeof getReconstructableStackViewports>
) {
  const { syncGroupService, viewportGridService, displaySetService, cornerstoneViewportService } =
    servicesManager.services;
  const viewportsToSync =
    viewports || getReconstructableStackViewports(viewportGridService, displaySetService);

  viewportsToSync.forEach(gridViewport => {
    const { viewportId } = gridViewport.viewportOptions;
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport) {
      return;
    }
    syncGroupService.addViewportToSyncGroup(viewportId, viewport.getRenderingEngine().id, {
      type: 'imageSlice',
      id: syncName,
      source: true,
      target: true,
    });
  });

  const synchronizer = syncGroupService.getSynchronizer(syncName);
  if (synchronizer) {
    synchronizer.setEnabled(true);
  }
}

function disableSync(
  syncName: string,
  servicesManager: AppTypes.ServicesManager,
  viewports?: ReturnType<typeof getReconstructableStackViewports>
) {
  const { syncGroupService, viewportGridService, displaySetService, cornerstoneViewportService } =
    servicesManager.services;
  const synchronizer = syncGroupService.getSynchronizer(syncName);
  if (synchronizer) {
    synchronizer.setEnabled(false);
  }
  const viewportsToSync =
    viewports || getReconstructableStackViewports(viewportGridService, displaySetService);
  viewportsToSync.forEach(gridViewport => {
    const { viewportId } = gridViewport.viewportOptions;
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (!viewport) {
      return;
    }
    syncGroupService.removeViewportFromSyncGroup(
      viewport.id,
      viewport.getRenderingEngine().id,
      syncName
    );
  });
}

/**
 * Gets the consistent spacing stack viewport types, which are the ones which
 * can be navigated using the stack image sync right now.
 */
function getReconstructableStackViewports(
  viewportGridService: ViewportGridService,
  displaySetService: DisplaySetService
) {
  let { viewports } = viewportGridService.getState();

  viewports = [...viewports.values()];
  // filter empty viewports
  viewports = viewports.filter(
    viewport => viewport.displaySetInstanceUIDs && viewport.displaySetInstanceUIDs.length
  );

  // filter reconstructable viewports
  viewports = viewports.filter(viewport => {
    const { displaySetInstanceUIDs } = viewport;

    let hasReconstructable = false;
    for (const displaySetInstanceUID of displaySetInstanceUIDs) {
      const displaySet = displaySetService.getDisplaySetByUID(displaySetInstanceUID);

      if (!displaySet) {
        continue;
      }

      // Escludi i volumi dinamici dalla slice-sync per evitare salti di istanza
      if (displaySet.isDynamicVolume) {
        return false;
      }

      // TODO - add a better test than isReconstructable
      if (displaySet.isReconstructable) {
        hasReconstructable = true;
      }
    }

    return hasReconstructable;
  });
  return viewports;
}
