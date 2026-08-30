export default function ottieniDisplaySetSerieAttiva() {
  //Ottieni tutte le info come seriesInstanceUID per la viewport e quindi serie attualmente attiva e selezionata
  const { viewportGridService, displaySetService } = window.servicesManager.services;
  const { activeViewportId } = viewportGridService.getState();

  const displaySetUIDs = viewportGridService.getDisplaySetsUIDsForViewport(activeViewportId);

  if (!displaySetUIDs?.length) {
    return;
  }

  const displaySets = displaySetUIDs.map(displaySetService.getDisplaySetByUID);
  return displaySets[0];
}
