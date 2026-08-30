import { getShouldUseCPURendering } from '@cornerstonejs/core';

/**
 * Tells the reader, once, when the images are being drawn on the processor
 * rather than the graphics card.
 *
 * It matters because the difference is visible: scrolling a long series is
 * slower, and reformatting a volume is unavailable, which is why the reformat
 * button is off. Saying it plainly beats letting somebody discover it by
 * pressing a button that does nothing.
 *
 * The viewer has a notice of its own for this. It is switched off in the
 * configuration: it names the viewer, and its text is barely legible against
 * this palette.
 */
export default function announceRenderingMode(servicesManager: AppTypes.ServicesManager): void {
  if (!getShouldUseCPURendering()) {
    return;
  }

  const { uiNotificationService } = servicesManager.services;

  uiNotificationService?.show({
    title: 'Drawing on the processor',
    message:
      'This browser is not providing a graphics context, so images are drawn on the processor. ' +
      'Studies open and the tools work; scrolling a long series is slower, and reformatting in ' +
      'three planes is unavailable. Turning on hardware acceleration in the browser settings, ' +
      'and closing other tabs that use it, restores both.',
    type: 'info',
    duration: 12000,
  });
}
