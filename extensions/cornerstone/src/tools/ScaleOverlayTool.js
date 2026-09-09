import { ScaleOverlayTool, annotation, ToolGroupManager, drawing } from '@cornerstonejs/tools';
import {
  utilities as csUtils,
  getRenderingEngines,
  getEnabledElementByIds,
} from '@cornerstonejs/core';

class ScaleOverlayToolSafe extends ScaleOverlayTool {
  constructor(toolProps = {}, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // `_init` is overridden. The core's version does `enabledElements[0].viewport` on
    // EVERY viewport in the tool group, but the 'montage' tool group also holds the
    // "phantom" (the viewportId registered in the main engine for the toolbar's sake),
    // which has NO enabled element. So `enabledElements[0]` came back undefined and the
    // error boundary caught a crash whenever a cameraModified arrived for a cell.
    // Here the viewports with no enabled element are dropped, and a scale annotation is
    // made for every cell that is real.
    this._init = () => {
      const renderingEngine = getRenderingEngines()?.[0];
      if (!renderingEngine) {
        return;
      }
      const viewportsInfo = ToolGroupManager.getToolGroup(this.toolGroupId)?.viewportsInfo;
      if (!viewportsInfo) {
        return;
      }

      const enabledElements = viewportsInfo
        .map(e => getEnabledElementByIds(e.viewportId, e.renderingEngineId))
        .filter(el => el?.viewport?.element); // scarta phantom / elementi non abilitati

      if (!enabledElements.length) {
        return;
      }

      // The "current" viewport: the one configuration.viewportId names (from
      // onCameraModified, say) when it is valid, and otherwise the first there is.
      let chosen = enabledElements[0];
      if (this.configuration.viewportId) {
        const match = enabledElements.find(el => el.viewport.id == this.configuration.viewportId);
        if (match) {
          chosen = match;
        }
      }
      const viewport = chosen.viewport;
      if (!viewport) {
        return;
      }

      // Makes sure there is a ScaleOverlay annotation for EVERY valid cell, so the scale
      // appears in all the subgrid's cells and not only the first.
      let annot = null;
      enabledElements.forEach(el => {
        const a = this._ensureAnnotationForViewport(el);
        if (el.viewport.id === viewport.id) {
          annot = a;
        }
      });

      this.editData = { viewport, renderingEngine, annotation: annot };
    };
  }

  _ensureAnnotationForViewport(enabledElement) {
    const { viewport } = enabledElement;
    if (!viewport?.element) {
      return null;
    }

    // THE ROOT CAUSE of "the scale is invisible in the subgrid": the annotation was
    // made the FIRST time, in `_init` at setToolEnabled, when, with a dedicated engine
    // and cells mounted asynchronously, the cell's camera and canvas were not valid yet.
    // `getViewportImageCornersInWorld` then returned degenerate corners (worldHeight
    // near zero), `computeScaleSize` returned undefined, and nothing was drawn. And
    // those points stayed cached for good.
    // The fix: recompute the image corners from the CURRENT viewport on every render.
    // `renderAnnotation` runs on IMAGE_RENDERED, when the camera is valid, so the points
    // are always right and the scale is drawn.
    const points = csUtils.getViewportImageCornersInWorld(viewport);

    const annotations = annotation.state.getAnnotations(this.getToolName(), viewport.element);
    const annotationForViewport = annotations?.filter(a => a.data.viewportId == viewport.id)[0];

    if (annotationForViewport) {
      if (points && points.length >= 4) {
        annotationForViewport.data.handles.points = points;
      }
      return annotationForViewport;
    }

    if (!points || points.length < 4) {
      return null;
    }

    const { FrameOfReferenceUID } = enabledElement;
    const { viewUp, viewPlaneNormal } = viewport.getCamera();
    const newAnnotation = {
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: [...viewPlaneNormal],
        viewUp: [...viewUp],
        FrameOfReferenceUID,
        referencedImageId: null,
      },
      data: {
        handles: {
          points,
        },
        viewportId: viewport.id,
      },
    };

    annotation.state.addAnnotation(newAnnotation, viewport.element);

    return newAnnotation;
  }

  renderAnnotation(enabledElement, svgDrawingHelper) {
    const { viewport } = enabledElement || {};
    if (!viewport?.element) {
      return;
    }

    // `renderAnnotation` is called by the AnnotationRenderingEngine for every ENABLED
    // tool on the viewport, whatever editData or existing annotations there are. But the
    // core bails out when `this.editData.viewport` is empty, and what fills it is _init,
    // which in a subgrid (dedicated engine, asynchronous cells) may not have run in time.
    // It is filled here from the current viewport, so the scale is drawn as soon as the
    // cell renders.
    if (!this.editData || !this.editData.viewport) {
      this.editData = {
        viewport,
        renderingEngine: enabledElement.renderingEngine,
        annotation: null,
      };
    }

    const location = this.configuration.scaleLocation;
    const annotationForViewport = this._ensureAnnotationForViewport(enabledElement);

    if (!annotationForViewport) {
      return;
    }

    const points = annotationForViewport.data.handles.points;
    if (!points || points.length < 4) {
      return;
    }

    const topLeft = points[0];
    const topRight = points[1];
    const bottomLeft = points[2];
    const bottomRight = points[3];

    const worldWidthViewport = this._distance(bottomLeft, bottomRight);
    const worldHeightViewport = this._distance(topLeft, bottomLeft);
    const scaleSize = this.computeScaleSize(worldWidthViewport, worldHeightViewport, location);
    if (!scaleSize || Number.isNaN(scaleSize)) {
      return;
    }

    // For ordinary viewports, with the scale along the bottom, the core's rendering is used.
    if (location !== 'right') {
      return super.renderAnnotation(enabledElement, svgDrawingHelper);
    }

    // --- Custom rendering for the VERTICAL SCALE ON THE RIGHT (subgrid) ---
    // The core puts the "NN cm" label ACROSS the ruler, starting at rulerX-25 and
    // crossing it, so the ruler cannot sit near the edge without cutting the text off.
    // Here the ruler is drawn hard against the right edge and the label entirely to its
    // LEFT.
    const canvas = viewport.canvas;
    const canvasSize = {
      width: canvas.width / window.devicePixelRatio || 1,
      height: canvas.height / window.devicePixelRatio || 1,
    };

    // The ruler's length in canvas pixels, which is scaleSize in mm projected.
    const pointSet = [topLeft, bottomLeft, topRight, bottomRight];
    const canvasCoordinates = this.computeWorldScaleCoordinates(scaleSize, location, pointSet).map(
      world => viewport.worldToCanvas(world)
    );
    const worldDistanceOnCanvas = canvasCoordinates[0][1] - canvasCoordinates[1][1];

    // The ruler sits RIGHT_MARGIN px from the right edge, centred vertically.
    const RIGHT_MARGIN = 16;
    const rulerX = canvasSize.width - RIGHT_MARGIN;
    const midY = canvasSize.height / 2;
    const scaleCanvasCoordinates = [
      [rulerX, midY - worldDistanceOnCanvas / 2],
      [rulerX, midY + worldDistanceOnCanvas / 2],
    ];

    const scaleTicks = this.computeEndScaleTicks(scaleCanvasCoordinates, location);
    const { annotationUID } = annotationForViewport;
    const styleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: viewport.id,
      annotationUID,
    };
    const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotationForViewport);
    const lineDash = this.getStyle('lineDash', styleSpecifier, annotationForViewport);
    const color = this.getStyle('color', styleSpecifier, annotationForViewport);
    const shadow = this.getStyle('shadow', styleSpecifier, annotationForViewport);
    const lineOpts = { color, width: lineWidth, lineDash, shadow };

    // The main line, with a tick at each end.
    drawing.drawLine(
      svgDrawingHelper, annotationUID, '1',
      scaleCanvasCoordinates[0], scaleCanvasCoordinates[1], lineOpts, `${annotationUID}-scaleline`
    );
    drawing.drawLine(
      svgDrawingHelper, annotationUID, '2',
      scaleTicks.endTick1[0], scaleTicks.endTick1[1], lineOpts, `${annotationUID}-left`
    );
    drawing.drawLine(
      svgDrawingHelper, annotationUID, '3',
      scaleTicks.endTick2[0], scaleTicks.endTick2[1], lineOpts, `${annotationUID}-right`
    );

    // Tacche interne.
    const { tickIds, tickUIDs, tickCoordinates } = this.computeInnerScaleTicks(
      scaleSize, location, annotationUID, scaleTicks.endTick1, scaleTicks.endTick2
    );
    for (let i = 0; i < tickUIDs.length; i++) {
      drawing.drawLine(
        svgDrawingHelper, annotationUID, tickUIDs[i],
        tickCoordinates[i][0], tickCoordinates[i][1], lineOpts, tickIds[i]
      );
    }

    // The label goes to the LEFT of the ruler. drawTextBox anchors left and adds 25px of
    // internal padding, so the box is placed to leave its right edge about 10px clear of
    // the ruler.
    const textLines = this._getTextLines(scaleSize);
    const estWidth = (textLines[0]?.length || 4) * 8;
    const textPos = [rulerX - estWidth - 35, midY - 12];
    drawing.drawTextBox(svgDrawingHelper, annotationUID, 'text0', textLines, textPos, {
      fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      fontSize: '14px',
      lineDash: '2,3',
      lineWidth: '1',
      shadow: true,
      color,
    });

    return false;
  }

  _distance(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

ScaleOverlayToolSafe.toolName = ScaleOverlayTool.toolName;

export default ScaleOverlayToolSafe;
