import { StackViewport, utilities as csUtils } from '@cornerstonejs/core';
import { ReferenceCursors } from '@cornerstonejs/tools';

// How the crosshair looks while it is being grabbed and dragged with the left button.
// During a drag the cursor turns red and thickens slightly, to tell it apart from the
// default state, which is the mouse merely moving.
const DRAG_COLOR = 'rgb(255, 60, 60)';
const DRAG_LINE_WIDTH = 3;

/**
 * Reference cursors, with grab-and-drag behaviour:
 *
 * - On a plain mouse move (hover) the crosshair is shown and follows the pointer, but
 *   the other linked viewports are NOT moved.
 * - Only while the left button is held down and dragged are the other viewports
 *   synchronised onto the cursor's point, scrolling to the matching slice. In that state
 *   the crosshair changes appearance (see DRAG_COLOR and DRAG_LINE_WIDTH).
 *
 * For this to work the tool has to be ACTIVE on the primary button (see the toolbar
 * button's `toggleActiveDisabledToolbar` command): only the active tool is given
 * `mouseDragCallback`, while `mouseMoveCallback` (hover) reaches both active and
 * passive tools.
 */
class ReferenceCursorsTool extends ReferenceCursors {
  constructor(toolProps = {}, defaultToolProps) {
    super(toolProps, defaultToolProps);

    // true only while the left button is down and a drag is under way
    this._isDragging = false;

    // On release, wherever it happens, leave the drag state and redraw the crosshair in
    // the default style rather than red.
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
        // triggers the annotation render again, so getStyle goes back to the defaults
        this.updateAnnotationPosition(element, annotation);
      }
    };

    // Grab and drag: while dragging with the primary button, the cursor's position is
    // updated and the other viewports are synchronised. That synchronisation lives in
    // updateViewportImage and only runs when _isDragging.
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
    // capture: true, so the release is caught ahead of any stopPropagation
    document.addEventListener('mouseup', this._onDocumentMouseUp, true);
  }

  onSetToolDisabled() {
    super.onSetToolDisabled();
    document.removeEventListener('mouseup', this._onDocumentMouseUp, true);
    this._isDragging = false;
  }

  // A red, slightly thicker crosshair while dragging; the default otherwise.
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

  // The other viewports are synchronised and scrolled ONLY during a drag with the left
  // button. On a plain hover the crosshair is visible but the other series stay put.
  // That is what fixed the problem where simply moving the mouse scrolled every linked
  // viewport.
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
