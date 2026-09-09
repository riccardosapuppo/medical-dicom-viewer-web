export default function getActiveViewportWindowLevel() {
  // Everything about the viewport, including the seriesInstanceUID, and so the series active and selected right now
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
