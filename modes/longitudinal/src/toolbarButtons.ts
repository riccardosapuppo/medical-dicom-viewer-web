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
      label: 'Rotate right',
      tooltip: 'Rotate right',
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
      label: 'Rotate left',
      tooltip: 'Rotate left',
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
      label: 'Flip horizontally',
      tooltip: 'Flip horizontally',
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
      label: 'Flip vertically',
      tooltip: 'Flip vertically',
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
      label: 'Link images',
      tooltip: 'Link images',
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
      label: 'Reference lines',
      tooltip: 'Show the reference lines',
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
      label: 'Reference cursors',
      tooltip: 'Show the reference cursors (drag with the left button to move one)',
      commands: 'toggleActiveDisabledToolbar',
      // The "active" style (a white background), as on pan, zoom and crosshairs: when it
      // is on, this tool becomes the active primary tool, so it uses the same evaluator
      // as the other active tools rather than the toggle one.
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
      label: 'Scale',
      tooltip: 'Show the scale',
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
      tooltip: 'Turn the image overlay on or off',
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
      label: 'Stack scroll',
      tooltip: 'Stack scroll',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'invert',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-invert',
      label: 'Invert',
      tooltip: 'Invert the colours',
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
      label: 'Probe',
      tooltip: 'Probe',
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
      label: 'Angle',
      tooltip: 'Angle',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CobbAngle',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-cobb-angle',
      label: 'Cobb angle',
      tooltip: 'Cobb angle',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Magnify',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-magnify',
      label: 'Magnify',
      tooltip: 'Magnify',
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
      label: 'Calibration',
      tooltip: 'Calibration',
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
      label: 'Magnify probe',
      tooltip: 'Magnify probe',
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
      label: 'Ultrasound directional',
      tooltip: 'Ultrasound directional',
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
      label: 'Length',
      tooltip: 'Length',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'Bidirectional',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-bidirectional',
      label: 'Bidirectional',
      tooltip: 'Bidirectional',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'ArrowAnnotate',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-annotate',
      label: 'Annotation',
      tooltip: 'Annotation',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'EllipticalROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-ellipse',
      label: 'Ellipse',
      tooltip: 'Ellipse',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'RectangleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-rectangle',
      label: 'Rectangle',
      tooltip: 'Rectangle',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'CircleROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-circle',
      label: 'Circle',
      tooltip: 'Circle',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'PlanarFreehandROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-freehand-roi',
      label: 'Freehand ROI',
      tooltip: 'Freehand ROI',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'SplineROI',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-spline-roi',
      label: 'Spline ROI',
      tooltip: 'Spline ROI',
      commands: setToolActiveToolbar,
      evaluate: 'evaluate.cornerstoneTool',
    },
  },
  {
    id: 'LivewireContour',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-livewire',
      label: 'Livewire tool',
      tooltip: 'Livewire tool',
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
      label: 'Pan',
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
      label: '3D rotate',
      commands: setToolActiveToolbar,
      evaluate: {
        name: 'evaluate.cornerstoneTool',
        disabledText: 'Select a 3D viewport to enable this tool.',
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
      label: 'Capture',
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
  // Subgrid (montage): a split button.
  //  - the icon calls toggleMontage (the suggested layout, from the instance count;
  //    clicking again turns it off)
  //  - the arrow opens the rows-by-columns picker (Standard and Custom), which calls
  //    setMontageLayout
  // `evaluate.cornerstone.montage` supplies isActive (the icon is highlighted when it is
  // on) and disabled (the series is not suitable). The old `montageSection` is still
  // defined but no longer used.
  {
    id: 'Montage',
    uiType: 'ohif.montageLayoutSelector',
    props: {
      icon: 'tool-montage',
      label: 'Subgrid',
      tooltip: 'Subgrid',
      evaluate: 'evaluate.cornerstone.montage',
    },
  },
  {
    id: 'MontageAuto',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-montage',
      label: 'Subgrid',
      tooltip: 'Subgrid on or off. The layout follows the number of images, up to eight.',
      commands: 'toggleMontage',
      evaluate: 'evaluate.cornerstone.montage',
    },
  },
  {
    id: 'MontageOff',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'tool-layout-default',
      label: 'Subgrid off',
      tooltip: 'Turn the subgrid off',
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
      label: `Subgrid ${label}`,
      tooltip: `Subgrid ${label}`,
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
      tooltip: 'Reconstruction on three planes',
      commands: 'mprDirectClick',
      evaluate: {
        name: 'evaluate.displaySetIsReconstructable',
        disabledText: 'Select a series that can be reconstructed in MPR to enable this tool.',
      },
    },
  },
  {
    id: 'LayoutMPRPriors',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'mprDirect',
      label: 'MPR, prior study',
      commands: 'mprDirectClickForPriors',
    },
  },
  {
    id: 'LayoutPTCT',
    uiType: 'ohif.toolButton',
    props: {
      icon: 'icon-tool-pet-segment',
      label: 'PET/CT',
      tooltip: 'Switch to the PET/CT layout',
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
          disabledText: 'Select the axial PT view to enable this tool',
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
        disabledText: 'Create a segmentation to enable this tool.',
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
      label: 'Reset the view',
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
    id: 'setFavouritesHangingProtocol',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'setFavouritesHangingProtocol',
      label: 'setFavouritesHangingProtocol',
      commands: 'setFavouritesHangingProtocol',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'hangingProtocols',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'hpIcon',
      label: 'Hanging Protocol',
      tooltip: 'Save the viewport arrangement and put it back on the next study',
      commands: 'hangingProtocols',
      evaluate: 'evaluate.action',
    },
  },
  {
    id: 'hideInfoDicom',
    uiType: 'ohif.radioGroup',
    props: {
      icon: 'hideInfoDicom',
      type: 'toggle',
      label: 'Hide the viewport info',
      tooltip: 'Hide the data drawn over the images',
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
        disabledText: 'Select an MPR viewport to enable this tool.',
      },
    },
  },
];

export default toolbarButtons;
