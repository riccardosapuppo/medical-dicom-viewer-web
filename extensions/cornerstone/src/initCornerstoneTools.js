import {
  PanTool,
  WindowLevelTool,
  SegmentBidirectionalTool,
  StackScrollTool,
  VolumeRotateTool,
  ZoomTool,
  MIPJumpToClickTool,
  LengthTool,
  RectangleROITool,
  RectangleROIThresholdTool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  ArrowAnnotateTool,
  DragProbeTool,
  ProbeTool,
  AngleTool,
  CobbAngleTool,
  MagnifyTool,
  CrosshairsTool,
  RectangleScissorsTool,
  SphereScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  init,
  addTool,
  BaseTool,
  annotation,
  ReferenceLinesTool,
  TrackballRotateTool,
  AdvancedMagnifyTool,
  UltrasoundDirectionalTool,
  PlanarFreehandROITool,
  PlanarFreehandContourSegmentationTool,
  SplineROITool,
  LivewireContourTool,
  OrientationMarkerTool,
  WindowLevelRegionTool,
  removeTool,
  cursors,
} from '@cornerstonejs/tools';
import * as polySeg from '@cornerstonejs/polymorphic-segmentation';

import CalibrationLineTool from './tools/CalibrationLineTool';
import ScaleOverlayToolSafe from './tools/ScaleOverlayTool';
import ReferenceCursorsTool from './tools/ReferenceCursorsTool';
import ImageOverlayViewerTool from './tools/ImageOverlayViewerTool';
import SafeStackScrollTool from './tools/SafeStackScrollTool';

export default function initCornerstoneTools(configuration = {}) {
  CrosshairsTool.isAnnotation = false;
  ReferenceLinesTool.isAnnotation = false;
  ScaleOverlayToolSafe.isAnnotation = false;
  ReferenceCursorsTool.isAnnotation = false;
  AdvancedMagnifyTool.isAnnotation = false;
  PlanarFreehandContourSegmentationTool.isAnnotation = false;

  init({
    addons: {
      polySeg,
    },
    computeWorker: {
      autoTerminateOnIdle: {
        enabled: false,
      },
    },
  });
  addTool(PanTool);
  addTool(SegmentBidirectionalTool);
  addTool(WindowLevelTool);
  removeTool(StackScrollTool);
  addTool(SafeStackScrollTool);
  addTool(VolumeRotateTool);
  addTool(ZoomTool);
  addTool(ProbeTool);
  addTool(MIPJumpToClickTool);
  addTool(LengthTool);
  addTool(RectangleROITool);
  addTool(RectangleROIThresholdTool);
  addTool(EllipticalROITool);
  addTool(CircleROITool);
  addTool(BidirectionalTool);
  addTool(ArrowAnnotateTool);
  addTool(DragProbeTool);
  addTool(AngleTool);
  addTool(CobbAngleTool);
  addTool(MagnifyTool);
  addTool(CrosshairsTool);
  addTool(RectangleScissorsTool);
  addTool(SphereScissorsTool);
  addTool(CircleScissorsTool);
  addTool(BrushTool);
  addTool(PaintFillTool);
  addTool(ReferenceLinesTool);
  addTool(ScaleOverlayToolSafe);
  addTool(ReferenceCursorsTool);
  addTool(CalibrationLineTool);
  addTool(TrackballRotateTool);
  addTool(ImageOverlayViewerTool);
  addTool(AdvancedMagnifyTool);
  addTool(UltrasoundDirectionalTool);
  addTool(PlanarFreehandROITool);
  addTool(SplineROITool);
  addTool(LivewireContourTool);
  addTool(OrientationMarkerTool);
  addTool(WindowLevelRegionTool);
  addTool(PlanarFreehandContourSegmentationTool);

  // A guard against a crash: some "display" tools (ReferenceLines, ImageOverlayViewer,
  // Crosshairs, ReferenceCursors and others) extend AnnotationDisplayTool, and so
  // BaseTool, and do NOT implement getHandleNearImagePoint. When they have annotations in
  // the frame of reference and land in cornerstone's mouseDown filter
  // (filterToolsWithMoveableHandles), the result is "tool.getHandleNearImagePoint is not
  // a function" and the viewport falls into the error boundary. A no-op fallback goes on
  // BaseTool.prototype: the real AnnotationTools override it, so the measurements are
  // unchanged, and the rest answer "no handle" instead of crashing.
  /** @type {any} */
  const baseProto = BaseTool && BaseTool.prototype;
  if (baseProto && typeof baseProto.getHandleNearImagePoint !== 'function') {
    baseProto.getHandleNearImagePoint = function () {
      return undefined;
    };
  }

  // Missing SVG cursors: some v3 tools have no cursor registered in cornerstone, only the
  // old v2 name exists ("FreehandROI" but not "PlanarFreehandROI"), so with useCursors:true
  // they would show the system cursor rather than the tool's own crosshair. A cursor is
  // registered for them by reusing the SVG descriptor of a similar tool that is already
  // defined.
  const cursorAliases = {
    PlanarFreehandROI: 'FreehandROI',
    SplineROI: 'FreehandROI',
    LivewireContour: 'FreehandROI',
    CalibrationLine: 'Length',
    DragProbe: 'Probe',
    UltrasoundDirectional: 'Length',
  };
  if (cursors?.registerCursor && cursors?.CursorSVG) {
    Object.entries(cursorAliases).forEach(([target, source]) => {
      const src = cursors.CursorSVG[source];
      if (src && !cursors.CursorSVG[target]) {
        cursors.registerCursor(target, src.iconContent, src.viewBox);
      }
    });
  }

  // Modify annotation tools to use dashed lines on SR
  const annotationStyle = {
    textBoxFontSize: '15px',
    lineWidth: '1.5',
  };

  const defaultStyles = annotation.config.style.getDefaultToolStyles();
  annotation.config.style.setDefaultToolStyles({
    global: {
      ...defaultStyles.global,
      ...annotationStyle,
    },
  });
}

const toolNames = {
  Pan: PanTool.toolName,
  ArrowAnnotate: ArrowAnnotateTool.toolName,
  WindowLevel: WindowLevelTool.toolName,
  StackScroll: StackScrollTool.toolName,
  Zoom: ZoomTool.toolName,
  VolumeRotate: VolumeRotateTool.toolName,
  MipJumpToClick: MIPJumpToClickTool.toolName,
  Length: LengthTool.toolName,
  DragProbe: DragProbeTool.toolName,
  Probe: ProbeTool.toolName,
  RectangleROI: RectangleROITool.toolName,
  RectangleROIThreshold: RectangleROIThresholdTool.toolName,
  EllipticalROI: EllipticalROITool.toolName,
  CircleROI: CircleROITool.toolName,
  Bidirectional: BidirectionalTool.toolName,
  Angle: AngleTool.toolName,
  CobbAngle: CobbAngleTool.toolName,
  Magnify: MagnifyTool.toolName,
  Crosshairs: CrosshairsTool.toolName,
  Brush: BrushTool.toolName,
  PaintFill: PaintFillTool.toolName,
  ReferenceLines: ReferenceLinesTool.toolName,
  ScaleOverlay: ScaleOverlayToolSafe.toolName,
  ReferenceCursors: ReferenceCursorsTool.toolName,
  CalibrationLine: CalibrationLineTool.toolName,
  TrackballRotateTool: TrackballRotateTool.toolName,
  CircleScissors: CircleScissorsTool.toolName,
  RectangleScissors: RectangleScissorsTool.toolName,
  SphereScissors: SphereScissorsTool.toolName,
  ImageOverlayViewer: ImageOverlayViewerTool.toolName,
  AdvancedMagnify: AdvancedMagnifyTool.toolName,
  UltrasoundDirectional: UltrasoundDirectionalTool.toolName,
  SplineROI: SplineROITool.toolName,
  LivewireContour: LivewireContourTool.toolName,
  PlanarFreehandROI: PlanarFreehandROITool.toolName,
  OrientationMarker: OrientationMarkerTool.toolName,
  WindowLevelRegion: WindowLevelRegionTool.toolName,
  PlanarFreehandContourSegmentation: PlanarFreehandContourSegmentationTool.toolName,
  SegmentBidirectional: SegmentBidirectionalTool.toolName,
};

export { toolNames };
