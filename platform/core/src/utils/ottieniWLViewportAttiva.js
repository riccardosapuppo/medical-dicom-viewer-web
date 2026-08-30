export default function ottieniWLViewportSerieAttiva() {
  //Ottieni tutte le info come seriesInstanceUID per la viewport e quindi serie attualmente attiva e selezionata
  try {
    const { viewportGridService, cornerstoneViewportService } = window.servicesManager.services;
    const { activeViewportId } = viewportGridService.getState();

    const viewport = cornerstoneViewportService.getCornerstoneViewport(activeViewportId);
    const { element } = viewport;
    const windowWidth = element.parentElement.querySelector('.windowWidth-viewport').textContent;
    const windowCenter = element.parentElement.querySelector('.windowCenter-viewport').textContent;
    const activeWl = {
      description: 'WL Attuale',
      window: Number(windowWidth),
      level: Number(windowCenter),
    };
    return activeWl;
  } catch (err) {
    console.error(err);
    return;
  }
}
