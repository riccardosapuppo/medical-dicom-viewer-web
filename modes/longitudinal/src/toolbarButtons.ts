import type { Button } from '@ohif/core/types';

import { EVENTS } from '@cornerstonejs/core';
import { ViewportGridService } from '@ohif/core';


export const setToolActiveToolbar = {
  commandName: 'setToolActiveToolbar',
  commandOptions: {
    toolGroupIds: ['default', 'mpr', 'SRToolGroup', 'volume3d', 'montage'],
  },
};

const ReferenceLinesListeners: RunCommand = [
  {
    commandName: 'setSourceViewportForReferenceLinesTool',
    context: 'CORNERSTONE',
  },
];

const toolbarButtons: Button[] = [
  // sections
  {
    id: 'MeasurementTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: 'measurementSection',
      groupId: 'MeasurementTools',
    },
  },
  {
    id: 'TransformTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: 'TransformTools',
      groupId: 'TransformTools',
    },
  },
  {
    id: 'MoreTools',
    uiType: 'ohif.toolButtonList',
    props: {
      buttonSection: 'moreToolsSection',
      groupId: 'MoreTools',
    },
  },
  // tool defs
  {
    id: 'Reset',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-reset',
      label: 'Reset',
      tooltip: 'Reset',
      commands: 'resetViewport',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'rotate-right',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rotate-right',
      label: 'Ruota a destra',
      tooltip: 'Ruota a destra',
      commands: 'rotateViewportCW',
      evaluate: [
        'evaluate.action',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'rotate-left',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rotate-left',
      label: 'Ruota a sinistra',
      tooltip: 'Ruota a sinistra',
      commands: 'rotateViewportCCW',
      evaluate: [
        'evaluate.action',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'flipHorizontal',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-horizontal',
      label: 'Rifletti orizzontalmente',
      tooltip: 'Rifletti orizzontalmente',
      commands: 'flipViewportHorizontal',
      evaluate: [
        'evaluate.viewportProperties.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'volume3d'],
        },
      ],
    },
  },
  {
    id: 'flipVertical',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-flip-vertical',
      label: 'Rifletti verticalmente',
      tooltip: 'Rifletti verticalmente',
      commands: 'flipViewportVertical',
      evaluate: [
        'evaluate.viewportProperties.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'volume3d'],
        },
      ],
    },
  },
  {
    id: 'ImageSliceSync',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'link',
      label: 'Collega immagini',
      tooltip: 'Collega immagini',
      commands: {
        commandName: 'toggleSynchronizer',
        commandOptions: {
          type: 'imageSlice',
        },
      },
      listeners: {
        [EVENTS.VIEWPORT_NEW_IMAGE_SET]: {
          commandName: 'toggleSynchronizer',
          commandOptions: {
            type: 'imageSlice',
            syncId: 'IMAGE_SLICE_SYNC',
            toggledState: true,
          },
        },
      },
      evaluate: [
        'evaluate.cornerstone.synchronizer',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'volume3d'],
        },
      ],
    },
  },
  {
    id: 'ReferenceLines',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-referenceLines',
      label: 'Linee di riferimento',
      tooltip: 'Mostra linee di riferimento',
      commands: 'toggleEnabledDisabledToolbar',
      listeners: {
        [ViewportGridService.EVENTS.ACTIVE_VIEWPORT_ID_CHANGED]: ReferenceLinesListeners,
        [ViewportGridService.EVENTS.VIEWPORTS_READY]: ReferenceLinesListeners,
      },
      evaluate: [
        'evaluate.cornerstoneTool.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'ReferenceCursors',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-referenceCursors',
      label: 'Cursori di riferimento',
      tooltip: 'Mostra cursori di riferimento (trascina col tasto sinistro per spostarlo)',
      commands: 'toggleActiveDisabledToolbar',
      // Stile "attivo" (sfondo bianco) come Pan/Zoom/Crosshairs: il tool quando
      // acceso diventa il tool primario attivo, quindi usiamo lo stesso
      // evaluator degli altri active tool invece di quello toggle.
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },

  {
    id: 'ScaleOverlay',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-scale-overlay',
      label: 'Scala',
      tooltip: 'Mostra scala',
      commands: 'toggleEnabledDisabledToolbar',
      evaluate: [
        'evaluate.cornerstoneTool.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'volume3d'],
        },
      ],
    },
  },
  {
    id: 'ImageOverlayViewer',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'toggle-dicom-overlay',
      label: 'Image Overlay',
      tooltip: 'Attiva o disattiva Image Overlay',
      commands: 'toggleEnabledDisabledToolbar',
      evaluate: [
        'evaluate.cornerstoneTool.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'StackScroll',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'toolStackScroll',
      label: 'Scorrimento con mouse',
      tooltip: 'Scorrimento con mouse',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'invert',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-invert',
      label: 'Inverti',
      tooltip: 'Inverti Colori',
      commands: 'invertViewport',
      evaluate: [
        'evaluate.viewportProperties.toggle',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'Probe',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-probe',
      label: 'Sonda',
      tooltip: 'Sonda',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Cine',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-cine',
      label: 'Cine',
      tooltip: 'Cine',
      commands: 'toggleCine',
      evaluate: [
        'evaluate.cine',
        'evaluate.cornerstone.disabledInMontage',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['volume3d'],
        },
      ],
    },
  },
  {
    id: 'Angle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-angle',
      label: 'Angolo',
      tooltip: 'Angolo',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CobbAngle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-cobb-angle',
      label: 'Angolo di Cobb',
      tooltip: 'Angolo di Cobb',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Magnify',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-magnify',
      label: 'Lente d\'ingrandimento',
      tooltip: 'Lente d\'ingrandimento',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'CalibrationLine',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-calibration',
      label: 'Calibrazione',
      tooltip: 'Calibrazione',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'TagBrowser',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'dicom-tag-browser',
      label: 'Dicom Tag Browser',
      tooltip: 'Dicom Tag Browser',
      commands: 'openDICOMTagViewer',
    },
  },
  {
    id: 'AdvancedMagnify',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-loupe',
      label: 'Sonda con lente d\ingrandimento',
      tooltip: 'Sonda con lente d\ingrandimento',
      commands: 'toggleActiveDisabledToolbar',
      evaluate: [
        'evaluate.cornerstoneTool.toggle.ifStrictlyDisabled',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'UltrasoundDirectionalTool',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-ultrasound-bidirectional',
      label: 'Ultrasuono direzionale',
      tooltip: 'Ultrasuono direzionale',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.modality.supported',
          supportedModalities: ['US'],
        },
      ],
    },
  },
  {
    id: 'WindowLevelRegion',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-window-region',
      label: 'Window Level Region',
      tooltip: 'Window Level Region',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video'],
        },
      ],
    },
  },
  {
    id: 'Length',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-length',
      label: 'Lunghezza',
      tooltip: 'Lunghezza',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Bidirectional',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-bidirectional',
      label: 'Bidirezionale',
      tooltip: 'Bidirezionale',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'ArrowAnnotate',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-annotate',
      label: 'Annotazione',
      tooltip: 'Annotazione',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'EllipticalROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-ellipse',
      label: 'Ellisse',
      tooltip: 'Ellisse',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'RectangleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rectangle',
      label: 'Rettangolo',
      tooltip: 'Rettangolo',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CircleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-circle',
      label: 'Cerchio',
      tooltip: 'Cerchio',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'PlanarFreehandROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-freehand-roi',
      label: 'ROI Mano libera',
      tooltip: 'ROI Mano libera',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'SplineROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-spline-roi',
      label: 'ROI Spline',
      tooltip: 'ROI Spline',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'LivewireContour',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-livewire',
      label: 'Strumento Livewire',
      tooltip: 'Strumento Livewire',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  // Window Level
  {
    id: 'WindowLevel',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-window-level',
      label: 'Window Level',
      commands: setToolActiveToolbar,
      evaluate: [
        'evaluate.cornerstoneTool',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['wholeSlide'],
        },
      ],
    },
  },
  {
    id: 'Pan',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-move',
      label: 'Sposta',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'ZoomOneToOne',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-reset',
      label: '1:1',
      tooltip: 'Zoom 1:1',
      commands: 'zoomOneToOne',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'Zoom',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-zoom',
      label: 'Zoom',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'TrackballRotate',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-3d-rotate',
      label: 'Rotazione 3D',
      commands: setToolActiveToolbar,
      evaluate: {
        name: 'evaluate.cornerstoneTool',
        disabledText: 'Seleziona una viewport 3D per abilitare questo strumento.',
      },
    },
  },
  {
    id: 'Reset3DRotate',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'tool-capture',
      label: 'Reset 3D Rotate',
      commands: 'Reset3DRotate',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'Capture',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-capture',
      label: 'Cattura',
      commands: 'showDownloadViewportModal',
      evaluate: [
        'evaluate.action',
        {
          name: 'evaluate.viewport.supported',
          unsupportedViewportTypes: ['video', 'wholeSlide'],
        },
      ],
    },
  },
  {
    id: 'Layout',
    uiType: 'ohif.layoutSelector',
    props: {
      rows: 3,
      columns: 4,
      commands: 'showDownloadViewportModal',
      evaluate: 'evaluate.action',
    },
  },
  // Sottogriglia (Montage): split button.
  //  - icona → toggleMontage (layout consigliato/auto in base alle istanze; ri-clic = off)
  //  - freccetta → selettore righe×colonne (Standard + Personalizzato) → setMontageLayout
  // `evaluate.cornerstone.montage` fornisce isActive (icona evidenziata quando
  // attiva) e disabled (serie non idonea). La vecchia `montageSection` resta
  // definita ma non più usata.
  {
    id: 'Montage',
    uiType: 'ohif.montageLayoutSelector',
    props: {
      icon: 'tool-montage',
      label: 'Sottogriglia',
      tooltip: 'Sottogriglia',
      evaluate: 'evaluate.cornerstone.montage',
    },
  },
  {
    id: 'MontageAuto',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-montage',
      label: 'Sottogriglia',
      tooltip: 'Sottogriglia: attiva/disattiva (layout automatico in base al numero di immagini, max 8)',
      commands: 'toggleMontage',
      evaluate: 'evaluate.cornerstone.montage',
    },
  },
  {
    id: 'MontageOff',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-layout-default',
      label: 'Sottogriglia off',
      tooltip: 'Disattiva sottogriglia',
      commands: 'disableMontage',
      evaluate: 'evaluate.cornerstone.montageAvailable',
    },
  },
  ...[
    { id: 'Montage1x1', label: '1×1', rows: 1, cols: 1 },
    { id: 'Montage1x2', label: '1×2', rows: 1, cols: 2 },
    { id: 'Montage2x1', label: '2×1', rows: 2, cols: 1 },
    { id: 'Montage1x3', label: '1×3', rows: 1, cols: 3 },
    { id: 'Montage3x1', label: '3×1', rows: 3, cols: 1 },
    { id: 'Montage2x2', label: '2×2', rows: 2, cols: 2 },
    { id: 'Montage3x3', label: '3×3', rows: 3, cols: 3 },
    { id: 'Montage4x4', label: '4×4', rows: 4, cols: 4 },
  ].map(({ id, label, rows, cols }) => ({
    id,
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-montage',
      label: `Sottogriglia ${label}`,
      tooltip: `Sottogriglia ${label}`,
      commands: {
        commandName: 'setMontageLayout',
        commandOptions: { rows, cols },
      },
      evaluate: 'evaluate.cornerstone.montageAvailable',
    },
  })),
  {
    id: 'LayoutMPR',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'mprDirect',
      label: 'MPR',
      tooltip: 'Ricostruzione su tre piani',
      commands: 'mprDirectClick',
      evaluate: {
        name: 'evaluate.displaySetIsReconstructable',
        disabledText: 'Seleziona una serie ricostrubile in MPR per abilitare questo strumento.',
      },
    },
  },
  {
    id: 'LayoutMPRStorico',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'mprDirect',
      label: 'MPR Studio secondario',
      commands: 'mprDirectClickForStorico',
    },
  },
  {
    id: 'LayoutPTCT',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-pet-segment',
      label: 'PET/CT',
      tooltip: 'Attiva layout PET/CT',
      commands: 'ptctDirectClick',
      evaluate: 'evaluate.hasPTAndCT',
    },
  },
  {
    id: 'SegmentationTools',
    uiType: 'ohif.toolBoxButton',
    props: {
      groupId: 'SegmentationTools',
      buttonSection: 'segmentationToolboxToolsSection',
    },
  },
  {
    id: 'BrushTools',
    uiType: 'ohif.toolBoxButtonGroup',
    props: {
      buttonSection: 'brushToolsSection',
      groupId: 'BrushTools',
    },
  },
  {
    id: 'RectangleROIStartEndThreshold',
    uiType: 'ohif.toolBoxButton',
    props: {
      icon: 'tool-create-threshold',
      label: 'Rectangle ROI Threshold',
      commands: {
        commandName: 'setToolActiveToolbar',
        commandOptions: {
          toolGroupIds: ['ctToolGroup', 'ptToolGroup', 'fusionToolGroup'],
        },
      },
      evaluate: [
        'evaluate.cornerstone.segmentation',
        {
          name: 'evaluate.cornerstoneTool',
          disabledText: 'Seleziona la vista PT Assiale per abilitare questo strumento',
        },
      ],
      options: 'tmtv.RectangleROIThresholdOptions',
    },
  },
  {
    id: 'Brush',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-brush',
      label: 'Brush',
      evaluate: {
        name: 'evaluate.cornerstone.segmentation',
        toolNames: ['CircularBrush', 'SphereBrush'],
        disabledText: 'Crea una nuova segmentazione per abilitare questo strumento.',
      },
      options: [
        {
          name: 'Radius (mm)',
          id: 'brush-radius',
          type: 'range',
          min: 0.5,
          max: 99.5,
          step: 0.5,
          value: 25,
          commands: {
            commandName: 'setBrushSize',
            commandOptions: { toolNames: ['CircularBrush', 'SphereBrush'] },
          },
        },
        {
          name: 'Shape',
          type: 'radio',
          id: 'brush-mode',
          value: 'CircularBrush',
          values: [
            { value: 'CircularBrush', label: 'Circle' },
            { value: 'SphereBrush', label: 'Sphere' },
          ],
          commands: 'setToolActiveToolbar',
        },
      ],
    },
  },
  {
    id: 'Eraser',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-eraser',
      label: 'Eraser',
      evaluate: {
        name: 'evaluate.cornerstone.segmentation',
        toolNames: ['CircularEraser', 'SphereEraser'],
      },
      options: [
        {
          name: 'Radius (mm)',
          id: 'eraser-radius',
          type: 'range',
          min: 0.5,
          max: 99.5,
          step: 0.5,
          value: 25,
          commands: {
            commandName: 'setBrushSize',
            commandOptions: { toolNames: ['CircularEraser', 'SphereEraser'] },
          },
        },
        {
          name: 'Shape',
          type: 'radio',
          id: 'eraser-mode',
          value: 'CircularEraser',
          values: [
            { value: 'CircularEraser', label: 'Circle' },
            { value: 'SphereEraser', label: 'Sphere' },
          ],
          commands: 'setToolActiveToolbar',
        },
      ],
    },
  },
  {
    id: 'Threshold',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-threshold',
      label: 'Threshold Tool',
      evaluate: {
        name: 'evaluate.cornerstone.segmentation',
        toolNames: ['ThresholdCircularBrush', 'ThresholdSphereBrush'],
      },
      options: [
        {
          name: 'Radius (mm)',
          id: 'threshold-radius',
          type: 'range',
          min: 0.5,
          max: 99.5,
          step: 0.5,
          value: 25,
          commands: {
            commandName: 'setBrushSize',
            commandOptions: {
              toolNames: [
                'ThresholdCircularBrush',
                'ThresholdSphereBrush',
                'ThresholdCircularBrushDynamic',
              ],
            },
          },
        },
        {
          name: 'Threshold',
          type: 'radio',
          id: 'dynamic-mode',
          value: 'ThresholdRange',
          values: [
            { value: 'ThresholdDynamic', label: 'Dynamic' },
            { value: 'ThresholdRange', label: 'Range' },
          ],
          commands: ({ value, commandsManager }: { value: string; commandsManager: any }) => {
            if (value === 'ThresholdDynamic') {
              commandsManager.run('setToolActive', {
                toolName: 'ThresholdCircularBrushDynamic',
              });
            } else {
              commandsManager.run('setToolActive', {
                toolName: 'ThresholdCircularBrush',
              });
            }
          },
        },
        {
          name: 'Shape',
          type: 'radio',
          id: 'eraser-mode',
          value: 'ThresholdCircularBrush',
          values: [
            { value: 'ThresholdCircularBrush', label: 'Circle' },
            { value: 'ThresholdSphereBrush', label: 'Sphere' },
          ],
          condition: ({ options }: { options: any[] }) =>
            options.find((option: any) => option.id === 'dynamic-mode').value === 'ThresholdRange',
          commands: 'setToolActiveToolbar',
        },
        {
          name: 'ThresholdRange',
          type: 'double-range',
          id: 'threshold-range',
          min: 0,
          max: 50,
          step: 0.5,
          value: [2.5, 50],
          condition: ({ options }: { options: any[] }) =>
            options.find((option: any) => option.id === 'dynamic-mode').value === 'ThresholdRange',
          commands: {
            commandName: 'setThresholdRange',
            commandOptions: {
              toolNames: ['ThresholdCircularBrush', 'ThresholdSphereBrush'],
            },
          },
        },
      ],
    },
  },
  {
    id: 'Reset',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'tool-reset',
      label: 'Reimposta vista',
      commands: 'resetViewport',
      evaluate: 'evaluate.action',
    },
  },

  {
    id: 'storeState',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'mprDirect',
      label: 'storeState',
      commands: 'storeState',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'restoreState',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'mprDirect',
      label: 'restoreState',
      commands: 'restoreState',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'setHPPreferiti',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'setHPPreferiti',
      label: 'setHPPreferiti',
      commands: 'setHPPreferiti',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'gestioneHP',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'hpIcon',
      label: 'Hanging Protocol',
      tooltip: 'Salva e riapplica la disposizione delle viewport',
      commands: 'gestioneHP',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'hideInfoDicom',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'hideInfoDicom',
      type: 'toggle',
      label: 'Nascondi info nelle viewport',
      tooltip: 'Nascondi i dati sovrimpressi alle immagini',
      commands: 'hideInfoDicom',
      evaluate: 'evaluate.classeSulCorpo',
    },
  },
  {
    id: 'setCamera',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'hpIcon',
      label: 'Set Camera',
      commands: 'setCamera',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'jumpIndex',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'mprDirect',
      label: 'jumpToImage',
      commands: {
        commandName: 'jumpToImage',
        commandOptions: {
          imageIndex: ['2'],
        },
      },
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'Crosshairs',
    uiType: 'ohif.toolButton',
    props: {
      type: 'tool',
      icon: 'tool-crosshair',
      label: 'Crosshair',
      commands: {
        commandName: 'toggleCrosshairs',
        commandOptions: {
          toolGroupIds: ['mpr'],
        },
      },
      evaluate: {
        name: 'evaluate.cornerstoneTool',
        disabledText: 'Seleziona una viewport MPR per abilitare questo strumento.',
      },
    },
  },
];

export default toolbarButtons;
