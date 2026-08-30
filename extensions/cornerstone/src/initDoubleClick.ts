import { eventTarget, EVENTS, getEnabledElement } from '@cornerstonejs/core';
import { Enums, ToolGroupManager, cancelActiveManipulations } from '@cornerstonejs/tools';
import { CommandsManager, CustomizationService } from '@ohif/core';
import { findNearbyToolData } from './utils/findNearbyToolData';

const cs3DToolsEvents = Enums.Events;

// Tools that rely on double-click to close/finish the annotation. When one of
// these is the active primary tool we must not run the viewport-level
// double-click action (toggleOneUp) or we would swallow the finishing click
// and maximize the viewport instead.
const CONTOUR_CLOSING_TOOLS = new Set([
  'SplineROI',
  'LivewireContour',
  'PlanarFreehandROI',
]);

/**
 * Generates a double click event name, consisting of:
 *    * alt when the alt key is down
 *    * ctrl when the cctrl key is down
 *    * shift when the shift key is down
 *    * 'doubleClick'
 */
function getDoubleClickEventName(evt: CustomEvent) {
  const nameArr = [];
  if (evt.detail.event.altKey) {
    nameArr.push('alt');
  }
  if (evt.detail.event.ctrlKey) {
    nameArr.push('ctrl');
  }
  if (evt.detail.event.shiftKey) {
    nameArr.push('shift');
  }
  nameArr.push('doubleClick');
  return nameArr.join('');
}

export type initDoubleClickArgs = {
  customizationService: CustomizationService;
  commandsManager: CommandsManager;
};

function initDoubleClick({ customizationService, commandsManager }: initDoubleClickArgs): void {
  const cornerstoneViewportHandleDoubleClick = (evt: CustomEvent) => {
    // Do not allow double click on a tool.
    const nearbyToolData = findNearbyToolData(commandsManager, evt);
    if (nearbyToolData) {
      return;
    }

    // If the active primary tool is a contour-closing tool (Spline/Livewire/
    // PlanarFreehand), skip the viewport double-click action. The user is
    // finishing a measurement, not asking to maximize the viewport.
    try {
      const element = evt?.detail?.element as HTMLElement | undefined;
      const enabledEl = element && getEnabledElement(element);
      if (enabledEl) {
        const toolGroup = ToolGroupManager.getToolGroupForViewport(
          enabledEl.viewportId,
          enabledEl.renderingEngineId
        );
        const activeTool = toolGroup?.getActivePrimaryMouseButtonTool?.();
        if (activeTool && CONTOUR_CLOSING_TOOLS.has(activeTool)) {
          // Contour tools end via the double-click. After the tool's
          // _endCallback runs (resetElementCursor), passive tools nearby
          // (e.g. an existing Length annotation on a handle) may respond to
          // the same mouseDown and call hideElementCursor, leaving the pointer
          // invisible on that viewport. Force the cursor back to crosshair on
          // the next tick so the user can keep measuring.
          setTimeout(() => {
            if (element && element.style) {
              element.style.cursor = 'crosshair';
            }
          }, 0);
          return;
        }
      }
    } catch (_) {
      // fall through — better to run the default action than to crash
    }

    const eventName = getDoubleClickEventName(evt);

    // Allows for the customization of the double click on a viewport.
    const customizations = customizationService.getCustomization(
      'cornerstoneViewportClickCommands'
    );

    const toRun = customizations[eventName];

    if (!toRun) {
      return;
    }

    // I due click del doppio-click possono aver AVVIATO una misura con uno
    // strumento non-contour attivo (Length/Angle/ROI…). L'azione di viewport che
    // sta per partire (es. toggleOneUp) cambia layout e DISTRUGGE l'enabled-
    // element (es. una cella della Sottogriglia) lasciando lo strumento in stato
    // "in disegno" → dopo non si potrebbero più tracciare misure. Annulliamo
    // l'eventuale manipolazione in corso prima di eseguire l'azione.
    try {
      const element = evt?.detail?.element as HTMLElement | undefined;
      if (element) {
        cancelActiveManipulations(element);
      }
    } catch (_) {
      /* nessuna manipolazione attiva */
    }

    commandsManager.run(toRun);
  };

  function elementEnabledHandler(evt: CustomEvent) {
    const { element } = evt.detail;

    element.addEventListener(
      cs3DToolsEvents.MOUSE_DOUBLE_CLICK,
      cornerstoneViewportHandleDoubleClick
    );
  }

  function elementDisabledHandler(evt: CustomEvent) {
    const { element } = evt.detail;

    element.removeEventListener(
      cs3DToolsEvents.MOUSE_DOUBLE_CLICK,
      cornerstoneViewportHandleDoubleClick
    );
  }

  eventTarget.addEventListener(EVENTS.ELEMENT_ENABLED, elementEnabledHandler.bind(null));

  eventTarget.addEventListener(EVENTS.ELEMENT_DISABLED, elementDisabledHandler.bind(null));
}

export default initDoubleClick;
