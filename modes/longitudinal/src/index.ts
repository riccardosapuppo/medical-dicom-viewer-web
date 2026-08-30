import i18n from 'i18next';
import { classes } from '@ohif/core';
import { id } from './id';
import initToolGroups from './initToolGroups';
import initTmtvToolGroups from './initTmtvToolGroups';
import toolbarButtons from './toolbarButtons';

const { MetadataProvider } = classes;

// Allow this mode by excluding non-imaging modalities such as SR, SEG
// Also, SM is not a simple imaging modalities, so exclude it.
const NON_IMAGE_MODALITIES = ['ECG', 'SEG', 'RTSTRUCT', 'RTPLAN', 'PR'];

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
  wsiSopClassHandler:
    '@ohif/extension-cornerstone.sopClassHandlerModule.DicomMicroscopySopClassHandler',
};

const cornerstone = {
  measurements: '@ohif/extension-cornerstone.panelModule.panelMeasurement',
  segmentation: '@ohif/extension-cornerstone.panelModule.panelSegmentation',
};

const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const dicomsr = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
  sopClassHandler3D: '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr-3d',
  viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
};

const dicomvideo = {
  sopClassHandler: '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
  viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
};

const dicompdf = {
  sopClassHandler: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
  viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
};

const dicomSeg = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-seg.sopClassHandlerModule.dicom-seg',
  viewport: '@ohif/extension-cornerstone-dicom-seg.viewportModule.dicom-seg',
};

const dicomPmap = {
  sopClassHandler: '@ohif/extension-cornerstone-dicom-pmap.sopClassHandlerModule.dicom-pmap',
  viewport: '@ohif/extension-cornerstone-dicom-pmap.viewportModule.dicom-pmap',
};

const dicomRT = {
  viewport: '@ohif/extension-cornerstone-dicom-rt.viewportModule.dicom-rt',
  sopClassHandler: '@ohif/extension-cornerstone-dicom-rt.sopClassHandlerModule.dicom-rt',
};

const tmtv = {
  hangingProtocol: '@ohif/extension-tmtv.hangingProtocolModule.ptCT',
  petSUV: '@ohif/extension-tmtv.panelModule.petSUV',
  tmtv: '@ohif/extension-tmtv.panelModule.tmtv',
};

const extensionDependencies = {
  // Can derive the versions at least process.env.from npm_package_version
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-measurement-tracking': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-seg': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-pmap': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-rt': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.1',
  '@ohif/extension-dicom-video': '^3.0.1',
  '@ohif/extension-tmtv': '^3.0.0',
};

function modeFactory({ modeConfiguration }) {
  let _activatePanelTriggersSubscriptions = [];
  return {
    // TODO: We're using this as a route segment
    // We should not be.
    id,
    routeName: 'viewer',
    displayName: i18n.t('Modes:Basic Viewer'),
    /**
     * Lifecycle hooks
     */
    onModeEnter: function ({ servicesManager, extensionManager, commandsManager }: withAppTypes) {
      const services = (servicesManager as any).services;
      const {
        measurementService,
        toolbarService,
        toolGroupService,
        viewportGridService,
        hangingProtocolService,
      } = services;
      const extMgr = extensionManager as any;
      const cmdMgr = commandsManager as any;

      measurementService.clearMeasurements();

      // Init Default and SR ToolGroups
      initToolGroups(extMgr, toolGroupService, cmdMgr);

      // Init TMTV tool groups (CT/PT/Fusion/MIP) so the PT/CT fusion hanging
      // protocol can be activated on-demand via the LayoutPTCT toggle without
      // a route change. The 'default' tool group is skipped (already created).
      const tmtvUtilityModule = extMgr.getModuleEntry(
        '@ohif/extension-cornerstone.utilityModule.tools'
      );
      if (tmtvUtilityModule) {
        const { toolNames, Enums } = tmtvUtilityModule.exports;
        initTmtvToolGroups(toolNames, Enums, toolGroupService, cmdMgr);
      }

      // PT VOI range attribute consumed by the ptCT hanging protocol to choose
      // the window level based on whether SUV correction metadata is present.
      hangingProtocolService.addCustomAttribute(
        'getPTVOIRange',
        'get PT VOI based on corrected or not',
        (props: any[]) => {
          const ptDisplaySet = props.find((imageSet: any) => imageSet.Modality === 'PT');
          if (!ptDisplaySet) {
            return;
          }
          const { imageId } = ptDisplaySet.images[0];
          const imageIdScalingFactor = MetadataProvider.get('scalingModule', imageId);
          if (imageIdScalingFactor && imageIdScalingFactor.suvbw) {
            return { windowWidth: 5, windowCenter: 2.5 };
          }
          return;
        }
      );

      toolbarService.addButtons(toolbarButtons);

      // Pre-resolve evaluate expressions for toolbox sub-buttons (TMTV
      // segmentation tools). They live inside ROIThresholdToolbox /
      // segmentationToolboxToolsSection / brushToolsSection, which may not be
      // rendered before the first refreshToolbarState() call — in that case
      // props.evaluate is still a raw string/array and crashes the toolbar.
      const preResolveIds = ['RectangleROIStartEndThreshold', 'Brush', 'Eraser', 'Threshold'];
      preResolveIds.forEach(id => {
        const btn = toolbarService.getButton(id);
        if (btn?.props) {
          toolbarService.handleEvaluate(btn.props);
        }
      });

      // Dynamically register the TMTV side panels (PET SUV + TMTV segmentation)
      // only when the study contains both PT and CT series. This keeps the
      // right sidebar clean for non-PET studies. Also triggers a toolbar
      // refresh so the LayoutPTCT button can re-evaluate its visibility via
      // evaluate.hasPTAndCT.
      const { displaySetService, panelService } = services;
      let tmtvPanelsRegistered = false;
      const refreshPtctUi = () => {
        const sets = displaySetService.getActiveDisplaySets() || [];
        const mods = new Set(sets.map((ds: any) => ds?.Modality));
        const hasPTAndCT = mods.has('PT') && mods.has('CT');
        if (hasPTAndCT && !tmtvPanelsRegistered) {
          panelService.addPanel(panelService.PanelPosition.Right, tmtv.petSUV, {});
          panelService.addPanel(panelService.PanelPosition.Right, tmtv.tmtv, {});
          tmtvPanelsRegistered = true;
        }
        const vpId = viewportGridService.getActiveViewportId?.();
        toolbarService.refreshToolbarState({ viewportId: vpId });
      };
      const tmtvSub = displaySetService.subscribe(
        displaySetService.EVENTS.DISPLAY_SETS_ADDED,
        refreshPtctUi
      );
      _activatePanelTriggersSubscriptions.push(tmtvSub);
      // Also check immediately in case display sets are already present.
      refreshPtctUi();
      toolbarService.createButtonSection('moreToolsSection', [
        'Reset',
        'ImageOverlayViewer',
        'CalibrationLine',
        'TagBrowser',
        'AdvancedMagnify',
        'WindowLevelRegion',
      ]);

      // TMTV segmentation toolbox sections
      toolbarService.createButtonSection('ROIThresholdToolbox', ['SegmentationTools']);
      toolbarService.createButtonSection('segmentationToolboxToolsSection', [
        'RectangleROIStartEndThreshold',
        'BrushTools',
      ]);
      toolbarService.createButtonSection('brushToolsSection', ['Brush', 'Eraser', 'Threshold']);

      toolbarService.createButtonSection('measurementSection', [
        'Length',
        'Bidirectional',
        'ArrowAnnotate',
        'Angle',
        'CobbAngle',
        'UltrasoundDirectionalTool',
        'EllipticalROI',
        'RectangleROI',
        'CircleROI',
        'PlanarFreehandROI',
        'SplineROI',
        'LivewireContour',
      ]);

      toolbarService.createButtonSection('TransformTools', [
        'rotate-right',
        'rotate-left',
        'flipHorizontal',
        'flipVertical',
      ]);

      // Sottogriglia (Montage): voci del menu del bottone "Montage".
      toolbarService.createButtonSection('montageSection', [
        'MontageAuto',
        'Montage1x1',
        'Montage1x2',
        'Montage2x1',
        'Montage1x3',
        'Montage3x1',
        'Montage2x2',
        'Montage3x3',
        'Montage4x4',
        'MontageOff',
      ]);

      //Versione normale o mobile
      if (!window.portableVersion) {
        //Storico
        if (document.body.classList.contains('storico-same-tab')) {
          toolbarService.createButtonSection('primary', [
            'MeasurementTools',
            'Pan',
            'ReferenceCursors',
            'ImageSliceSync',
            //'ZoomOneToOne',
            'WindowLevel',
            'Zoom',
            'TransformTools',
            'Magnify',
            'Layout',
            'Montage',
            'LayoutMPR',
            'LayoutMPRStorico',
            'Crosshairs',
            'TrackballRotate',
            'invert',
            'polygon',
            'Probe',
            'Cine',
            'Capture',
            'hideInfoDicom',
            'ReferenceLines',
            'ScaleOverlay',
            'MoreTools',
            'Length',
            'Bidirectional',
            'ArrowAnnotate',
            'EllipticalROI',
            'RectangleROI',
            'CircleROI',
            'PlanarFreehandROI',
            'SplineROI',
            'LivewireContour',
            'rotate-right',
            'rotate-left',
            'flipHorizontal',
            'flipVertical',
            'gestioneHP',
          ]);
        }
        //Mobile
        else if (window.matchMedia("(max-width: 768px)").matches) {
          toolbarService.createButtonSection('primary', [
            'Layout',
            'Montage',
            'MeasurementTools',
            'Pan',
            'StackScroll',
            'ReferenceCursors',
            'ImageSliceSync',
            //'ZoomOneToOne',
            'WindowLevel',
            'Magnify',
            'invert',
            'polygon',
            'Probe',
            'hideInfoDicom',
            'ReferenceLines',
            'ScaleOverlay',
            'TransformTools',
            'MoreTools',
          ]);
        }
        //Versione standard
        else {
          toolbarService.createButtonSection('primary', [
            'MeasurementTools',
            'Pan',
            'StackScroll',
            'ReferenceCursors',
            'ImageSliceSync',
            'WindowLevel',
            //'ZoomOneToOne',
            'Zoom',
            'TransformTools',
            'Magnify',
            // 'Zoom',
            'Layout',
            'Montage',
            'LayoutMPR',
            'LayoutMPRStorico',
            'LayoutPTCT',
            'Crosshairs',
            'TrackballRotate',
            // 'Reset3DRotate',
            'invert',
            'polygon',
            'Probe',
            'Cine',
            'Capture',
            'hideInfoDicom',
            'ReferenceLines',
            'ScaleOverlay',
            'MoreTools',
            'gestioneHP',
            // 'setCamera',
            // 'storeState',
            // 'restoreState',
            // 'jumpIndex',
            // 'setHPPreferiti',
          ]);
        }
      } else {
        //Versione portable
        toolbarService.createButtonSection('primary', [
          'MeasurementTools',
          'Pan',
          'StackScroll',
          'ImageSliceSync',
          'WindowLevel',
          //'ZoomOneToOne',
          'Zoom',
          'TransformTools',
          'Magnify',
          'Layout',
          'Montage',
          'invert',
          'polygon',
          'Probe',
          'Cine',
          'Capture',
          'hideInfoDicom',
          // 'ReferenceLines',  //Controllare linee riferimento per versione portable, eventuale modifica al modulo cornerstone
          'Reset',
        ]);
      }

      const autoImageSliceSync =
        modeConfiguration?.autoImageSliceSync ?? window.config?.autoImageSliceSync;

      if (autoImageSliceSync) {
        const enableImageSliceSync = () => {
          commandsManager.runCommand('toggleSynchronizer', {
            type: 'imageSlice',
            syncId: 'IMAGE_SLICE_SYNC',
            toggledState: true,
          });

          const viewportId = viewportGridService.getActiveViewportId();
          if (viewportId) {
            toolbarService.refreshToolbarState({ viewportId });
          }
        };

        enableImageSliceSync();

        _activatePanelTriggersSubscriptions.push(
          viewportGridService.subscribe(
            viewportGridService.EVENTS.VIEWPORTS_READY,
            enableImageSliceSync
          ),
          viewportGridService.subscribe(
            viewportGridService.EVENTS.GRID_STATE_CHANGED,
            enableImageSliceSync
          )
        );
      }

      // // ActivatePanel event trigger for when a segmentation or measurement is added.
      // // Do not force activation so as to respect the state the user may have left the UI in.
      // _activatePanelTriggersSubscriptions = [
      //   ...panelService.addActivatePanelTriggers(
      //     cornerstone.segmentation,
      //     [
      //       {
      //         sourcePubSubService: segmentationService,
      //         sourceEvents: [segmentationService.EVENTS.SEGMENTATION_ADDED],
      //       },
      //     ],
      //     true
      //   ),
      //   ...panelService.addActivatePanelTriggers(
      //     tracked.measurements,
      //     [
      //       {
      //         sourcePubSubService: measurementService,
      //         sourceEvents: [
      //           measurementService.EVENTS.MEASUREMENT_ADDED,
      //           measurementService.EVENTS.RAW_MEASUREMENT_ADDED,
      //         ],
      //       },
      //     ],
      //     true
      //   ),
      //   true,
      // ];
    },
    onModeExit: ({ servicesManager }: withAppTypes) => {
      const {
        toolGroupService,
        syncGroupService,
        segmentationService,
        cornerstoneViewportService,
        uiDialogService,
        uiModalService,
      } = servicesManager.services;

      _activatePanelTriggersSubscriptions.forEach(sub => sub.unsubscribe());
      _activatePanelTriggersSubscriptions = [];

      uiDialogService.hideAll();
      uiModalService.hide();
      toolGroupService.destroy();
      syncGroupService.destroy();
      segmentationService.destroy();
      cornerstoneViewportService.destroy();
    },
    validationTags: {
      study: [],
      series: [],
    },

    isValidMode: function ({ modalities }) {
      const modalities_list = modalities.split('\\');

      // Exclude non-image modalities
      return {
        valid: !!modalities_list.filter(modality => NON_IMAGE_MODALITIES.indexOf(modality) === -1)
          .length,
        description:
          'The mode does not support studies that ONLY include the following modalities: SM, ECG, SEG, RTSTRUCT',
      };
    },
    routes: [
      {
        path: 'longitudinal',
        /*init: ({ servicesManager, extensionManager }) => {
          //defaultViewerRouteInit
        },*/
        layoutTemplate: () => {
          return {
            id: ohif.layout,
            props: {
              leftPanels: [tracked.thumbnailList],
              leftPanelResizable: false,
              rightPanels: [cornerstone.segmentation, tracked.measurements],
              rightPanelClosed: true,
              rightPanelResizable: false,
              viewports: [
                {
                  namespace: tracked.viewport,
                  displaySetsToDisplay: [
                    ohif.sopClassHandler,
                    dicomvideo.sopClassHandler,
                    dicomsr.sopClassHandler3D,
                    ohif.wsiSopClassHandler,
                  ],
                },
                {
                  namespace: dicomsr.viewport,
                  displaySetsToDisplay: [dicomsr.sopClassHandler],
                },
                {
                  namespace: dicompdf.viewport,
                  displaySetsToDisplay: [dicompdf.sopClassHandler],
                },
                {
                  namespace: dicomSeg.viewport,
                  displaySetsToDisplay: [dicomSeg.sopClassHandler],
                },
                {
                  namespace: dicomPmap.viewport,
                  displaySetsToDisplay: [dicomPmap.sopClassHandler],
                },
                {
                  namespace: dicomRT.viewport,
                  displaySetsToDisplay: [dicomRT.sopClassHandler],
                },
              ],
            },
          };
        },
      },
    ],
    extensions: extensionDependencies,
    // Default protocol gets self-registered by default in the init
    hangingProtocol: 'default',
    // Order is important in sop class handlers when two handlers both use
    // the same sop class under different situations.  In that case, the more
    // general handler needs to come last.  For this case, the dicomvideo must
    // come first to remove video transfer syntax before ohif uses images
    sopClassHandlers: [
      dicomvideo.sopClassHandler,
      dicomSeg.sopClassHandler,
      dicomPmap.sopClassHandler,
      ohif.sopClassHandler,
      ohif.wsiSopClassHandler,
      dicompdf.sopClassHandler,
      dicomsr.sopClassHandler3D,
      dicomsr.sopClassHandler,
      dicomRT.sopClassHandler,
    ],
    ...modeConfiguration,
  };
}

const mode = {
  id,
  modeFactory,
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons };
