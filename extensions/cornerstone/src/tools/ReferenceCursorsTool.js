import { StackViewport, utilities as csUtils } from '@cornerstonejs/core';
import { ReferenceCursors } from '@cornerstonejs/tools';

// Stile del crosshair mentre si afferra-e-trascina col tasto sinistro.
// Durante il trascinamento il cursore diventa rosso e leggermente piu spesso,
// per distinguerlo dallo stato di default (solo movimento del mouse).
const DRAG_COLOR = 'rgb(255, 60, 60)';
const DRAG_LINE_WIDTH = 3;

/**
 * Reference cursors con interazione "afferra e trascina":
 *
 * - Con il semplice movimento del mouse (hover) il crosshair viene mostrato e
 *   segue il puntatore, ma le altre viewport collegate NON vengono spostate.
 * - Solo tenendo premuto il tasto sinistro e trascinando, le altre viewport
 *   vengono sincronizzate sul punto del cursore (scroll/cambio slice). In questo
 *   stato il crosshair cambia aspetto (vedi DRAG_COLOR / DRAG_LINE_WIDTH).
 *
 * Per funzionare il tool deve essere ATTIVO sul tasto primario (vedi il comando
 * `toggleActiveDisabledToolbar` del bottone in toolbar): solo l'active tool
 * riceve `mouseDragCallback`, mentre `mouseMoveCallback` (hover) arriva sia agli
 * active sia ai passive.
 */
class ReferenceCursorsTool extends ReferenceCursors {
  constructor(toolProps = {}, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // true solo mentre il tasto sinistro e premuto e si sta trascinando
    this._isDragging = false;

    // Al rilascio del tasto (ovunque avvenga) usciamo dallo stato di drag e
    // ridisegniamo il crosshair con lo stile di default (non rosso).
    this._onDocumentMouseUp = () => {
      if (!this._isDragging) {
        return;
      }
      this._isDragging = false;
      const element = this._elementWithCursor;
      if (!element) {
        return;
      }
      const annotation = this.getActiveAnnotation(element);
      if (annotation) {
        // ritriggera il render dell'annotazione -> getStyle torna ai default
        this.updateAnnotationPosition(element, annotation);
      }
    };

    // Afferra-e-trascina: durante il drag col tasto primario aggiorniamo la
    // posizione del cursore e abilitiamo la sincronizzazione delle altre
    // viewport (gestita in updateViewportImage, attiva solo se _isDragging).
    this.mouseDragCallback = evt => {
      const { detail } = evt;
      const { element, currentPoints } = detail;

      this._isDragging = true;
      this._currentCursorWorldPosition = currentPoints.world;
      this._currentCanvasPosition = currentPoints.canvas;
      this._elementWithCursor = element;

      const annotation = this.getActiveAnnotation(element);
      if (annotation === null) {
        this.createInitialAnnotation(currentPoints.world, element);
        return false;
      }
      this.updateAnnotationPosition(element, annotation);
      return false;
    };
  }

  onSetToolActive() {
    super.onSetToolActive();
    // capture: true cosi intercettiamo il rilascio prima di eventuali stopPropagation
    document.addEventListener('mouseup', this._onDocumentMouseUp, true);
  }

  onSetToolDisabled() {
    super.onSetToolDisabled();
    document.removeEventListener('mouseup', this._onDocumentMouseUp, true);
    this._isDragging = false;
  }

  // Crosshair rosso e piu spesso mentre si trascina; default altrimenti.
  getStyle(property, specifications, annotation) {
    if (this._isDragging) {
      if (property === 'color') {
        return DRAG_COLOR;
      }
      if (property === 'lineWidth') {
        return DRAG_LINE_WIDTH;
      }
    }
    return super.getStyle(property, specifications, annotation);
  }

  // La sincronizzazione/scroll delle altre viewport avviene SOLO durante il
  // trascinamento col tasto sinistro. Con il semplice hover il crosshair si
  // vede ma le altre serie restano ferme (questo risolve il problema per cui,
  // muovendo il mouse, scrollavano tutte le viewport collegate).
  updateViewportImage(viewport) {
    if (!this._isDragging) {
      return;
    }

    const currentMousePosition = this._currentCursorWorldPosition;
    if (!currentMousePosition || currentMousePosition.some(e => isNaN(e))) {
      return;
    }

    if (viewport instanceof StackViewport) {
      const closestIndex = csUtils.getClosestStackImageIndexForPoint(
        currentMousePosition,
        viewport
      );

      if (closestIndex === null) {
        return;
      }

      if (closestIndex !== viewport.getCurrentImageIdIndex()) {
        csUtils.jumpToSlice(viewport.element, {
          imageIndex: closestIndex,
          debounceLoading: true,
        });
      }

      return;
    }

    super.updateViewportImage(viewport);
  }
}

ReferenceCursorsTool.toolName = ReferenceCursors.toolName;

export default ReferenceCursorsTool;
