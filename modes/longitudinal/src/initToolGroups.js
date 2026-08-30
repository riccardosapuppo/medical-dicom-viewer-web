import { toolNames as SRToolNames } from '@ohif/extension-cornerstone-dicom-sr';

const colours = {
  'viewport-0': 'rgb(200, 0, 0)',
  'viewport-1': 'rgb(200, 200, 0)',
  'viewport-2': 'rgb(0, 200, 0)',
};

const colorsByOrientation = {
  axial: 'rgb(200, 0, 0)',
  sagittal: 'rgb(200, 200, 0)',
  coronal: 'rgb(0, 200, 0)',
};

function initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, toolGroupId) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }],
      },
    ],
    passive: [
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              eventDetails,
            });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              data,
              eventDetails,
            });
          },
        },
      },
      {
        toolName: toolNames.SegmentBidirectional,
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Probe },
      { toolName: toolNames.EllipticalROI },
      { toolName: toolNames.CircleROI },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.Magnify },
      { toolName: toolNames.CalibrationLine },
      {
        toolName: toolNames.PlanarFreehandContourSegmentation,
        configuration: {
          displayOnePointAsCrosshairs: true,
        },
      },
      { toolName: toolNames.UltrasoundDirectional },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      { toolName: toolNames.WindowLevelRegion },
    ],
    enabled: [
      { toolName: toolNames.ImageOverlayViewer },
      { toolName: toolNames.ReferenceLines },
      {
        toolName: SRToolNames.SRSCOORD3DPoint,
      },
    ],
    disabled: [
      {
        toolName: toolNames.AdvancedMagnify,
      },
      {
        toolName: toolNames.ReferenceCursors,
        configuration: {
          // Comportamento "esclusivo" come Crosshairs/Pan: quando si attiva un
          // altro tool, il cursore di riferimento viene disabilitato (e non
          // lasciato in passive), cosi il crosshair sparisce e non resta un
          // cursore fuorviante mentre il tasto sinistro agisce su un altro tool.
          disableOnPassive: true,
          // Mostra SEMPRE il crosshair nelle viewport collegate (stesso Frame
          // of Reference), a prescindere dalla distanza della slice corrente
          // dal punto 3D del cursore. Il default di cornerstone (5 mm)
          // nascondeva il crosshair quando la slice era piu lontana, facendolo
          // comparire "a tratti" nelle altre serie quando, in hover, le
          // viewport non vengono piu scrollate automaticamente (lo scroll ora
          // avviene solo durante il trascinamento col tasto sinistro).
          displayThreshold: Number.MAX_SAFE_INTEGER,
        },
      },
      { toolName: toolNames.ScaleOverlay },
    ],
  };

  toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
}

function initSRToolGroup(extensionManager, toolGroupService) {
  const SRUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone-dicom-sr.utilityModule.tools'
  );

  if (!SRUtilityModule) {
    return;
  }

  const CS3DUtilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames: SRToolNames } = SRUtilityModule.exports;
  const { toolNames, Enums } = CS3DUtilityModule.exports;
  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Primary,
          },
        ],
      },
      {
        toolName: toolNames.Pan,
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Auxiliary,
          },
        ],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Secondary,
          },
        ],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }],
      },
    ],
    passive: [
      { toolName: SRToolNames.SRLength },
      { toolName: SRToolNames.SRArrowAnnotate },
      { toolName: SRToolNames.SRBidirectional },
      { toolName: SRToolNames.SREllipticalROI },
      { toolName: SRToolNames.SRCircleROI },
      { toolName: SRToolNames.SRPlanarFreehandROI },
      { toolName: SRToolNames.SRRectangleROI },
      { toolName: toolNames.WindowLevelRegion },
    ],
    enabled: [
      {
        toolName: SRToolNames.DICOMSRDisplay,
      },
    ],
    // disabled
  };

  const toolGroupId = 'SRToolGroup';
  toolGroupService.createToolGroupAndAddTools(toolGroupId, tools);
}

function initMPRToolGroup(extensionManager, toolGroupService, commandsManager) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const serviceManager = extensionManager._servicesManager;
  const { cornerstoneViewportService } = serviceManager.services;

  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
      {
        toolName: toolNames.StackScroll,
        bindings: [{ mouseButton: Enums.MouseBindings.Wheel }],
      },
      { toolName: toolNames.ReferenceLines },
    ],
    passive: [
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              eventDetails,
            });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', {
              callback,
              data,
              eventDetails,
            });
          },
        },
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.DragProbe },
      { toolName: toolNames.Probe },
      { toolName: toolNames.EllipticalROI },
      { toolName: toolNames.CircleROI },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      { toolName: toolNames.WindowLevelRegion },
      {
        toolName: toolNames.PlanarFreehandContourSegmentation,
        configuration: {
          displayOnePointAsCrosshairs: true,
        },
      },
    ],
    disabled: [
      {
        toolName: toolNames.Crosshairs,
        configuration: {
          viewportIndicators: true,
          viewportIndicatorsConfig: {
            circleRadius: 5,
            xOffset: 0.95,
            yOffset: 0.05,
          },
          disableOnPassive: true,
          autoPan: {
            enabled: false,
            panSize: 10,
          },
          getReferenceLineColor: viewportId => {
            const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
            const viewportOptions = viewportInfo?.viewportOptions;
            if (viewportOptions) {
              return (
                colours[viewportOptions.id] ||
                colorsByOrientation[viewportOptions.orientation] ||
                '#0c0'
              );
            } else {
              console.warn('missing viewport?', viewportId);
              return '#0c0';
            }
          },
        },
      },
      {
        toolName: toolNames.AdvancedMagnify,
      },
      // ReferenceCursors NON registrato nel toolgroup 'mpr': in MPR si usa il
      // Crosshair, quindi il bottone "Cursori di riferimento" risulta non
      // disponibile (grigio) finche' si e' in modalita' MPR.
      { toolName: toolNames.ScaleOverlay },
      // { toolName: toolNames.ReferenceLines },
    ],
  };

  toolGroupService.createToolGroupAndAddTools('mpr', tools);
}
function initVolume3DToolGroup(extensionManager, toolGroupService) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;

  const tools = {
    active: [
      {
        toolName: toolNames.TrackballRotateTool,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
    ],
  };

  toolGroupService.createToolGroupAndAddTools('volume3d', tools);
}

// ToolGroup dedicato alla Sottogriglia (Montage). Identico al 'default' per gli
// strumenti di interazione e di misura, MA senza i tool cross-viewport che non
// hanno senso (e che disegnano linee fuorvianti) tra celle della stessa serie:
// ReferenceLines, Crosshairs, ReferenceCursors. Le celle della montage entrano
// in questo toolGroup invece che in 'default'.
function initMontageToolGroup(extensionManager, toolGroupService, commandsManager) {
  const utilityModule = extensionManager.getModuleEntry(
    '@ohif/extension-cornerstone.utilityModule.tools'
  );

  const { toolNames, Enums } = utilityModule.exports;

  // Strumenti per la sottogriglia: interazione (WL/Pan/Zoom, sincronizzati via
  // voi/zoompan), scorrimento, ispezione (Magnify/Probe) E strumenti di MISURA.
  // Le misure sono per-cella: ogni cella è uno StackViewport su un'immagine
  // specifica della serie, quindi l'annotazione resta legata a quell'immagine
  // (come in una viewport normale). NON includiamo i tool cross-viewport
  // (ReferenceLines/Crosshairs/ReferenceCursors): privi di senso tra celle della
  // stessa serie. Il crash storico su getHandleNearImagePoint è risolto alla
  // radice in initCornerstoneTools (guard su BaseTool).
  const tools = {
    active: [
      {
        toolName: toolNames.WindowLevel,
        bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
      },
      {
        toolName: toolNames.Pan,
        bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
      },
      {
        toolName: toolNames.Zoom,
        bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
      },
    ],
    passive: [
      { toolName: toolNames.StackScroll },
      { toolName: toolNames.Magnify },
      { toolName: toolNames.Probe },
      { toolName: toolNames.DragProbe },
      // Strumenti di misura/annotazione
      { toolName: toolNames.Length },
      {
        toolName: toolNames.ArrowAnnotate,
        configuration: {
          getTextCallback: (callback, eventDetails) => {
            commandsManager.runCommand('arrowTextCallback', { callback, eventDetails });
          },
          changeTextCallback: (data, eventDetails, callback) => {
            commandsManager.runCommand('arrowTextCallback', { callback, data, eventDetails });
          },
        },
      },
      { toolName: toolNames.Bidirectional },
      { toolName: toolNames.EllipticalROI },
      { toolName: toolNames.CircleROI },
      { toolName: toolNames.RectangleROI },
      { toolName: toolNames.Angle },
      { toolName: toolNames.CobbAngle },
      { toolName: toolNames.CalibrationLine },
      { toolName: toolNames.PlanarFreehandROI },
      { toolName: toolNames.SplineROI },
      { toolName: toolNames.LivewireContour },
      { toolName: toolNames.UltrasoundDirectional },
      { toolName: toolNames.WindowLevelRegion },
    ],
    disabled: [
      {
        // Scala VERTICALE a destra nelle celle della sottogriglia: in basso a
        // sinistra c'è il numero istanza, una scala orizzontale (default) ci si
        // sovrapporrebbe. Sul lato destro non c'è overlay (la scrollbar vive
        // nella corsia esterna alle celle).
        toolName: toolNames.ScaleOverlay,
        configuration: { scaleLocation: 'right' },
      },
    ],
  };

  toolGroupService.createToolGroupAndAddTools('montage', tools);
}

function initToolGroups(extensionManager, toolGroupService, commandsManager) {
  initDefaultToolGroup(extensionManager, toolGroupService, commandsManager, 'default');
  initSRToolGroup(extensionManager, toolGroupService);
  initMPRToolGroup(extensionManager, toolGroupService, commandsManager);
  initVolume3DToolGroup(extensionManager, toolGroupService);
  initMontageToolGroup(extensionManager, toolGroupService, commandsManager);
}

export default initToolGroups;
