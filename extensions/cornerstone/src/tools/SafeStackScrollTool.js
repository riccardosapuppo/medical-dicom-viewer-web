import {
  getEnabledElementByIds,
  getEnabledElement,
  VolumeViewport,
  BaseVolumeViewport,
  utilities,
} from '@cornerstonejs/core';
import { StackScrollTool } from '@cornerstonejs/tools';

class SafeStackScrollTool extends StackScrollTool {
  constructor(toolProps = {}, defaultToolProps = {
    supportedInteractionTypes: ['Mouse', 'Touch'],
    configuration: {
      invert: false,
      // DISABLED: debounce causes frame skipping during scroll.
      // When false, every scroll step renders immediately (even if not cached).
      // The image will appear as soon as the XHR completes instead of being
      // skipped in favor of a later frame. Combined with aggressive
      // stackContextPrefetch, this gives smooth 1-by-1 scrolling.
      debounceIfNotLoaded: false,
      loop: false,
    },
  }) {
    super(toolProps, defaultToolProps);
  }

  _scrollDrag(evt) {
    const { deltaPoints, viewportId, renderingEngineId } = evt.detail;
    const { viewport } = getEnabledElementByIds(viewportId, renderingEngineId);
    const { invert, loop } = this.configuration;
    const deltaPointY = deltaPoints.canvas[1];
    let volumeId;

    if (viewport instanceof VolumeViewport) {
      volumeId = viewport.getVolumeId();
      if (!volumeId) {
        return;
      }
    }

    const pixelsPerImage = this._getPixelPerImage(viewport);
    const deltaY = deltaPointY + this.deltaY;

    if (!pixelsPerImage) {
      return;
    }

    if (Math.abs(deltaY) >= pixelsPerImage) {
      const imageIdIndexOffset = Math.round(deltaY / pixelsPerImage);
      utilities.scroll(viewport, {
        delta: invert ? -imageIdIndexOffset : imageIdIndexOffset,
        volumeId,
        debounceLoading: false,
        loop: loop,
      });
      this.deltaY = deltaY % pixelsPerImage;
    } else {
      this.deltaY = deltaY;
    }
  }

  _scroll(evt) {
    const { wheel, element } = evt.detail;
    const { direction } = wheel;
    const { invert } = this.configuration;
    const { viewport } = getEnabledElement(element);
    const delta = direction * (invert ? -1 : 1);

    const volumeId =
      viewport instanceof BaseVolumeViewport ? viewport.getVolumeId() : undefined;

    if (viewport instanceof BaseVolumeViewport && !volumeId) {
      return;
    }

    utilities.scroll(viewport, {
      delta,
      debounceLoading: false,
      loop: this.configuration.loop,
      volumeId,
      scrollSlabs: this.configuration.scrollSlabs,
    });
  }
}

SafeStackScrollTool.toolName = StackScrollTool.toolName;

export default SafeStackScrollTool;
