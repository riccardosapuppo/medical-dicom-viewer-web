import { ScaleOverlayTool, annotation, ToolGroupManager, drawing } from '@cornerstonejs/tools';
import {
  utilities as csUtils,
  getRenderingEngines,
  getEnabledElementByIds,
} from '@cornerstonejs/core';

class ScaleOverlayToolSafe extends ScaleOverlayTool {
  constructor(toolProps = {}, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // Override di `_init`: quello del core fa `enabledElements[0].viewport` su
    // TUTTE le viewport del toolGroup, ma il toolGroup 'montage' contiene anche
    // il "phantom" (la viewportId registrata nell'engine principale per la
    // toolbar) che NON ha un enabled-element → `enabledElements[0]` undefined →
    // crash (Error Boundary) quando arriva un cameraModified su una cella.
    // Qui scartiamo le viewport prive di enabled-element e creiamo l'annotazione
    // scala per ogni cella valida.
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

      // Viewport "corrente": quella indicata da configuration.viewportId (es. da
      // onCameraModified) se valida, altrimenti la prima disponibile.
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

      // Assicura un'annotazione ScaleOverlay per OGNI cella valida (così la scala
      // compare in tutte le celle della sottogriglia, non solo nella prima).
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

    // CAUSA RADICE del "scala invisibile in sottogriglia": l'annotazione veniva
    // creata la PRIMA volta (in `_init`, al setToolEnabled) quando — con engine
    // dedicato + celle montate in async — la camera/canvas della cella non era
    // ancora valida → `getViewportImageCornersInWorld` restituiva angoli degeneri
    // (worldHeight ≈ 0) → `computeScaleSize` ritornava `undefined` → niente
    // disegno. E quei punti restavano cachati per sempre.
    // Fix: ricalcoliamo gli angoli immagine dalla viewport CORRENTE ad ogni
    // render. `renderAnnotation` gira su IMAGE_RENDERED, quando la camera è
    // valida, quindi i punti sono sempre corretti e la scala si disegna.
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

    // `renderAnnotation` viene chiamato dall'AnnotationRenderingEngine per ogni
    // tool ENABLED del viewport, a prescindere da editData/annotazioni esistenti.
    // Il core esce però se `this.editData.viewport` non è popolato (lo popola
    // _init, che con la Sottogriglia — engine dedicato + celle async — può non
    // aver girato in tempo). Lo popoliamo qui dalla viewport corrente così la
    // scala si disegna comunque appena la cella renderizza.
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

    // Per le viewport normali (scala 'bottom') usiamo il rendering del core.
    if (location !== 'right') {
      return super.renderAnnotation(enabledElement, svgDrawingHelper);
    }

    // --- Rendering custom per la scala VERTICALE A DESTRA (Sottogriglia) ---
    // Il core posiziona l'etichetta "NN cm" A CAVALLO del righello (parte a
    // rulerX-25 e lo attraversa), perciò il righello non può stare vicino al
    // bordo senza tagliare il testo. Qui disegniamo il righello a ridosso del
    // bordo destro e l'etichetta tutta A SINISTRA del righello.
    const canvas = viewport.canvas;
    const canvasSize = {
      width: canvas.width / window.devicePixelRatio || 1,
      height: canvas.height / window.devicePixelRatio || 1,
    };

    // Lunghezza del righello in pixel canvas (= scaleSize mm proiettati).
    const pointSet = [topLeft, bottomLeft, topRight, bottomRight];
    const canvasCoordinates = this.computeWorldScaleCoordinates(scaleSize, location, pointSet).map(
      world => viewport.worldToCanvas(world)
    );
    const worldDistanceOnCanvas = canvasCoordinates[0][1] - canvasCoordinates[1][1];

    // Righello a RIGHT_MARGIN px dal bordo destro, centrato verticalmente.
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

    // Linea principale + tacche agli estremi.
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

    // Etichetta a SINISTRA del righello (drawTextBox è ancorato a sinistra e
    // aggiunge 25px di padding interno → posizioniamo il box così che il suo
    // bordo destro resti ~10px a sinistra del righello).
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
