export default function getActiveSeriesViewportInfo() {
  // Everything about the viewport, including the seriesInstanceUID, and so the series active and selected right now
  const { viewportGridService, cornerstoneViewportService } = window.servicesManager.services;
  const { activeViewportId } = viewportGridService.getState();

  const viewportInfo = cornerstoneViewportService.getViewportInfo(activeViewportId);
  // const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);

  // const actorEntries = viewport.getActors();
  // const actorEntry = actorEntries.find(entry => entry.uid.includes(activeViewportId));
  // const a = viewport.getProperties(actorEntry.uid);

  return viewportInfo;
}
