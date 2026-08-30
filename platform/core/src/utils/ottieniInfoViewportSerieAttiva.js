export default function ottieniInfoViewportSerieAttiva() {
  //Ottieni tutte le info come seriesInstanceUID per la viewport e quindi serie attualmente attiva e selezionata
  const { viewportGridService, cornerstoneViewportService } = window.servicesManager.services;
  const { activeViewportId } = viewportGridService.getState();

  const viewportInfo = cornerstoneViewportService.getViewportInfo(activeViewportId);
  // const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);

  // const actorEntries = viewport.getActors();
  // const actorEntry = actorEntries.find(entry => entry.uid.includes(activeViewportId));
  // const a = viewport.getProperties(actorEntry.uid);

  return viewportInfo;
}
