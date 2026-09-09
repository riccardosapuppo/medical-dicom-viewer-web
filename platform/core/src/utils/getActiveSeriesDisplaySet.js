export default function getActiveSeriesDisplaySet() {
  // Everything about the viewport, including the seriesInstanceUID, and so the series active and selected right now
  const { viewportGridService, displaySetService } = window.servicesManager.services;
  const { activeViewportId } = viewportGridService.getState();

  const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(activeViewportId);

  if (!displaySetUIDs?.length) {
    return;
  }

  const displaySets = displaySetUIDs.map(displaySetService.getDisplaySetByUID);
  return displaySets[0];
}
