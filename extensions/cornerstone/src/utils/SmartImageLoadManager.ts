/**
 * SmartImageLoadManager
 *
 * Wraps Cornerstone's imageLoadPoolManager to enforce a **global TCP budget**
 * across all request types (Interaction, Thumbnail, Prefetch, Compute).
 *
 * Key features:
 *  1. Global concurrent-request cap tied to real browser connection limits.
 *  2. Strict priority preemption: when an Interaction request arrives and the
 *     budget is full, the lowest-priority in-flight CROSS-SERIES Prefetch XHR
 *     is aborted to free a slot immediately.
 *  3. Scroll-aware throttle: CROSS-SERIES prefetch (StudyPrefetcherService) is
 *     paused during scroll. STACK prefetch (nearby images for smooth scroll)
 *     is NEVER blocked.
 *  4. Series-change abort: all prefetch/thumbnail requests tied to a viewport
 *     can be killed in one call when the viewport switches display set.
 *  5. Scroll-stop priority boost: when the user stops scrolling (mouseup or
 *     idle timeout), the current image gets max priority loading and nearby
 *     images for synced viewports get boosted too.
 *  6. Sync-scroll optimization: during synchronized scrolling, cross-series
 *     prefetch is paused so all TCP budget goes to the synced viewports.
 */

import {
  imageLoadPoolManager,
  imageRetrievalPoolManager,
  Enums,
  eventTarget,
  imageLoader,
  getEnabledElement,
  cache,
} from '@cornerstonejs/core';

const RequestType = Enums.RequestType;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedRequest {
  imageId: string;
  type: string;
  viewportId?: string;
  volumeId?: string;
  isCrossSeries: boolean;
  priority: number;
  xhr?: XMLHttpRequest;
  timestamp: number;
}

interface SmartLoadConfig {
  globalMaxConcurrent: number;
  interactionSlots: number;
  prefetchSlots: number;
  thumbnailSlots: number;
  scrollIdleMs: number;
  abortCrossSeriesPrefetchOnScroll: boolean;
  /** Number of nearby images to boost-load when scroll stops. */
  boostNearbyOnScrollStop: number;
}

const DEFAULT_CONFIG: SmartLoadConfig = {
  globalMaxConcurrent: 14,
  interactionSlots: 8,
  prefetchSlots: 6,
  thumbnailSlots: 3,
  scrollIdleMs: 400,
  abortCrossSeriesPrefetchOnScroll: true,
  boostNearbyOnScrollStop: 3,
};

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

class SmartImageLoadManager {
  private config: SmartLoadConfig;
  private inflightRequests = new Map<string, TrackedRequest>();
  private isScrolling = false;
  private scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private crossSeriesPrefetchPaused = false;
  private pausedCrossSeriesQueue: Array<{
    requestFn: () => Promise<any>;
    type: string;
    additionalDetails: any;
    priority: number;
    viewportId?: string;
  }> = [];
  private initialized = false;
  private lastScrollElement: HTMLElement | null = null;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  init(appConfig?: Partial<SmartLoadConfig>) {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (appConfig) {
      Object.assign(this.config, appConfig);
    }

    this._patchPoolManager(imageLoadPoolManager);
    this._patchPoolManager(imageRetrievalPoolManager);
    this._setupScrollDetection();
    this._setupMouseUpDetection();

    console.log(
      '[SmartImageLoadManager] initialized',
      `globalMax=${this.config.globalMaxConcurrent}`,
      `interactionSlots=${this.config.interactionSlots}`,
      `prefetchSlots=${this.config.prefetchSlots}`
    );
  }

  /**
   * Abort ALL prefetch and thumbnail requests tied to a specific viewport.
   */
  abortRequestsForViewport(viewportId: string) {
    let abortedCount = 0;
    this.inflightRequests.forEach((tracked, key) => {
      if (
        tracked.viewportId === viewportId &&
        (tracked.type === RequestType.Prefetch || tracked.type === RequestType.Thumbnail)
      ) {
        this._abortTrackedRequest(tracked, key);
        abortedCount++;
      }
    });

    this.pausedCrossSeriesQueue = this.pausedCrossSeriesQueue.filter(
      q => q.viewportId !== viewportId
    );

    const filterFn = (requestDetails: any) => {
      return requestDetails?.additionalDetails?.viewportId !== viewportId;
    };
    imageLoadPoolManager.filterRequests(filterFn);
    imageRetrievalPoolManager.filterRequests(filterFn);

    if (abortedCount > 0) {
      console.log(
        `[SmartImageLoadManager] aborted ${abortedCount} requests for viewport ${viewportId}`
      );
    }
  }

  /**
   * Abort ALL in-flight requests tied to a specific volumeId.
   */
  abortRequestsForVolume(volumeId: string) {
    let abortedCount = 0;
    this.inflightRequests.forEach((tracked, key) => {
      if (tracked.volumeId === volumeId) {
        this._abortTrackedRequest(tracked, key);
        abortedCount++;
      }
    });

    const filterFn = (requestDetails: any) => {
      return requestDetails?.additionalDetails?.volumeId !== volumeId;
    };
    imageLoadPoolManager.filterRequests(filterFn);
    imageRetrievalPoolManager.filterRequests(filterFn);
  }

  /**
   * Abort ALL non-interaction in-flight requests.
   */
  abortAllNonInteraction() {
    this.inflightRequests.forEach((tracked, key) => {
      if (tracked.type !== RequestType.Interaction) {
        this._abortTrackedRequest(tracked, key);
      }
    });
    this.pausedCrossSeriesQueue = [];
    imageLoadPoolManager.clearRequestStack(RequestType.Prefetch);
    imageLoadPoolManager.clearRequestStack(RequestType.Thumbnail);
    imageRetrievalPoolManager.clearRequestStack(RequestType.Prefetch);
    imageRetrievalPoolManager.clearRequestStack(RequestType.Thumbnail);
  }

  /**
   * Signal that the user started scrolling.
   * Only pauses CROSS-SERIES prefetch. Stack prefetch (nearby images) keeps running.
   */
  onScrollStart(element?: HTMLElement) {
    if (element) {
      this.lastScrollElement = element;
    }

    if (this.isScrolling) {
      if (this.scrollIdleTimer) {
        clearTimeout(this.scrollIdleTimer);
      }
      this.scrollIdleTimer = setTimeout(() => this._onScrollIdle(), this.config.scrollIdleMs);
      return;
    }

    this.isScrolling = true;
    this.crossSeriesPrefetchPaused = true;

    if (this.config.abortCrossSeriesPrefetchOnScroll) {
      this._abortCrossSeriesPrefetch();
    }

    this.scrollIdleTimer = setTimeout(() => this._onScrollIdle(), this.config.scrollIdleMs);
  }

  /**
   * Called on mouseup — the user released the mouse after scrolling.
   * Immediately boost-loads the current image and nearby images.
   */
  onScrollRelease(element?: HTMLElement) {
    const targetElement = element || this.lastScrollElement;

    // Cancel the idle timer and trigger idle immediately
    if (this.scrollIdleTimer) {
      clearTimeout(this.scrollIdleTimer);
      this.scrollIdleTimer = null;
    }

    this.isScrolling = false;
    this.crossSeriesPrefetchPaused = false;

    // Boost-load the current image and nearby images at max priority
    if (targetElement) {
      this._boostCurrentImage(targetElement);
    }

    // Flush paused cross-series queue
    this._flushPausedQueue();
  }

  getInflightCount(): { total: number; interaction: number; prefetch: number; thumbnail: number } {
    let interaction = 0;
    let prefetch = 0;
    let thumbnail = 0;
    this.inflightRequests.forEach(r => {
      if (r.type === RequestType.Interaction) interaction++;
      else if (r.type === RequestType.Prefetch) prefetch++;
      else if (r.type === RequestType.Thumbnail) thumbnail++;
    });
    return { total: this.inflightRequests.size, interaction, prefetch, thumbnail };
  }

  destroy() {
    if (this.scrollIdleTimer) {
      clearTimeout(this.scrollIdleTimer);
    }
    this.inflightRequests.clear();
    this.pausedCrossSeriesQueue = [];
    this.initialized = false;
  }

  // -----------------------------------------------------------------------
  // Private - Pool Manager Patching
  // -----------------------------------------------------------------------

  private _patchPoolManager(poolManager: typeof imageLoadPoolManager) {
    const self = this;
    const originalAddRequest = poolManager.addRequest.bind(poolManager);

    poolManager.addRequest = function patchedAddRequest(
      requestFn: () => Promise<any>,
      type: string,
      additionalDetails: any,
      priority: number = 0
    ) {
      const imageId = additionalDetails?.imageId || '';
      const viewportId = additionalDetails?.viewportId || '';
      const volumeId = additionalDetails?.volumeId || '';
      const isCrossSeries = !!viewportId;

      // Only pause cross-series prefetch during scroll.
      // Stack prefetch (nearby images) ALWAYS passes through.
      if (
        self.crossSeriesPrefetchPaused &&
        type === RequestType.Prefetch &&
        isCrossSeries
      ) {
        self.pausedCrossSeriesQueue.push({
          requestFn, type, additionalDetails, priority, viewportId,
        });
        return;
      }

      // Preempt cross-series Prefetch when Interaction arrives and budget is full
      if (type === RequestType.Interaction) {
        self._preemptForInteraction();
      }

      // Wrap to track in-flight state
      const wrappedRequestFn = () => {
        const promise = requestFn();

        if (promise && typeof promise.then === 'function') {
          const trackingKey = imageId || `req_${Date.now()}_${Math.random()}`;
          const tracked: TrackedRequest = {
            imageId, type, viewportId, volumeId, isCrossSeries,
            priority,
            xhr: (promise as any).xhr || null,
            timestamp: Date.now(),
          };
          self.inflightRequests.set(trackingKey, tracked);
          promise.finally(() => {
            self.inflightRequests.delete(trackingKey);
          });
        }

        return promise;
      };

      return originalAddRequest(wrappedRequestFn, type, additionalDetails, priority);
    };

    const { interactionSlots, prefetchSlots, thumbnailSlots } = this.config;
    poolManager.maxNumRequests = {
      [RequestType.Interaction]: interactionSlots,
      [RequestType.Thumbnail]: thumbnailSlots,
      [RequestType.Prefetch]: prefetchSlots,
      [RequestType.Compute]: 4,
    };
  }

  // -----------------------------------------------------------------------
  // Private - Preemption
  // -----------------------------------------------------------------------

  private _preemptForInteraction() {
    const totalInflight = this.inflightRequests.size;
    if (totalInflight < this.config.globalMaxConcurrent) {
      return;
    }

    let candidate: TrackedRequest | null = null;
    let candidateKey: string | null = null;

    this.inflightRequests.forEach((tracked, key) => {
      if (tracked.type === RequestType.Prefetch && tracked.isCrossSeries) {
        if (!candidate || tracked.timestamp < candidate.timestamp) {
          candidate = tracked;
          candidateKey = key;
        }
      }
    });

    if (candidate && candidateKey) {
      this._abortTrackedRequest(candidate, candidateKey);
    }
  }

  // -----------------------------------------------------------------------
  // Private - Abort helpers
  // -----------------------------------------------------------------------

  private _abortTrackedRequest(tracked: TrackedRequest, key?: string) {
    if (tracked.xhr && tracked.xhr.readyState !== XMLHttpRequest.DONE) {
      try {
        tracked.xhr.abort();
      } catch (e) { /* already done */ }
    }
    const deleteKey = key || tracked.imageId;
    if (deleteKey) {
      this.inflightRequests.delete(deleteKey);
    }
  }

  private _abortCrossSeriesPrefetch() {
    let abortedCount = 0;
    this.inflightRequests.forEach((tracked, key) => {
      if (tracked.type === RequestType.Prefetch && tracked.isCrossSeries) {
        this._abortTrackedRequest(tracked, key);
        abortedCount++;
      }
    });

    const filterCrossSeries = (requestDetails: any) => {
      if (requestDetails.type !== RequestType.Prefetch) return true;
      return !requestDetails?.additionalDetails?.viewportId;
    };
    imageLoadPoolManager.filterRequests(filterCrossSeries);
    imageRetrievalPoolManager.filterRequests(filterCrossSeries);
  }

  // -----------------------------------------------------------------------
  // Private - Scroll-stop priority boost
  // -----------------------------------------------------------------------

  /**
   * When the user stops scrolling, ensure the current image (and a few
   * nearby) are loaded at maximum priority so the viewport shows the
   * image instantly. Also boosts synced viewports' current images.
   */
  /**
   * When the user stops scrolling, boost-load the current image + nearby
   * on ALL viewports at max priority. The sync callback in Cornerstone
   * now works naturally (cache.isLoaded check removed), so we just need
   * to ensure images are loaded quickly — sync takes care of the rest.
   */
  private _boostCurrentImage(element: HTMLElement) {
    try {
      const enabledEl = getEnabledElement(element);
      if (!enabledEl) return;
      const { viewport } = enabledEl;
      if (!viewport) return;

      const { boostNearbyOnScrollStop } = this.config;

      // Boost the source viewport
      this._boostViewportImages(viewport as any, boostNearbyOnScrollStop);

      // Boost all other viewports in the grid (synced ones)
      try {
        const renderingEngine = (viewport as any).getRenderingEngine?.();
        if (renderingEngine) {
          const allViewports = renderingEngine.getViewports?.() || [];
          for (const vp of allViewports) {
            if (vp.id === viewport.id) continue;
            if (typeof vp.getCurrentImageIdIndex === 'function') {
              this._boostViewportImages(vp, boostNearbyOnScrollStop);
            }
          }
        }
      } catch (e) { /* rendering engine may not be available */ }
    } catch (e) {
      // Viewport may have been destroyed during scroll
    }
  }

  /**
   * Boost-load a viewport's current image + nearby at max priority.
   */
  private _boostViewportImages(vp: any, range: number) {
    const imageIds = vp.getImageIds?.();
    const currentIndex = vp.getCurrentImageIdIndex?.();
    if (!imageIds?.length || currentIndex == null) return;

    for (let i = -range; i <= range; i++) {
      const idx = currentIndex + i;
      if (idx < 0 || idx >= imageIds.length) continue;
      const imageId = imageIds[idx];
      if (!imageId || cache.isLoaded(imageId)) continue;

      imageLoadPoolManager.addRequest(
        () => imageLoader.loadAndCacheImage(imageId, {
          requestType: RequestType.Interaction,
          priority: -10,
          preScale: { enabled: true },
        }),
        RequestType.Interaction,
        { imageId },
        -10
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private - Scroll Detection
  // -----------------------------------------------------------------------

  private _setupScrollDetection() {
    if (typeof document !== 'undefined') {
      document.addEventListener('wheel', (e) => {
        const target = e.target as HTMLElement;
        const vpElement = target?.closest?.('.cornerstone-viewport-element') as HTMLElement;
        if (vpElement) {
          this.onScrollStart(vpElement);
        }
      }, { passive: true });
    }
  }

  /**
   * Detect mouseup to trigger scroll-stop boost.
   * When the user releases the mouse after drag-scrolling, we immediately
   * boost-load the current image so it appears instantly.
   */
  private _setupMouseUpDetection() {
    if (typeof document !== 'undefined') {
      document.addEventListener('mouseup', (e) => {
        if (!this.isScrolling) return;

        const target = e.target as HTMLElement;
        const vpElement = target?.closest?.('.cornerstone-viewport-element') as HTMLElement;
        // Use the viewport element from the mouseup event, or fall back to the last scroll element
        this.onScrollRelease(vpElement || undefined);
      });

      // Also handle pointerup for touch devices
      document.addEventListener('pointerup', (e) => {
        if (!this.isScrolling) return;
        if (e.pointerType === 'mouse') return; // already handled by mouseup

        const target = e.target as HTMLElement;
        const vpElement = target?.closest?.('.cornerstone-viewport-element') as HTMLElement;
        this.onScrollRelease(vpElement || undefined);
      });
    }
  }

  private _onScrollIdle() {
    const element = this.lastScrollElement;
    this.isScrolling = false;
    this.crossSeriesPrefetchPaused = false;
    this.scrollIdleTimer = null;

    // Boost-load current image on idle timeout too (covers the case where
    // user is still holding mouse but stopped moving)
    if (element) {
      this._boostCurrentImage(element);
    }

    this._flushPausedQueue();
  }

  private _flushPausedQueue() {
    if (this.pausedCrossSeriesQueue.length > 0) {
      const queued = [...this.pausedCrossSeriesQueue];
      this.pausedCrossSeriesQueue = [];
      queued.forEach(({ requestFn, type, additionalDetails, priority }) => {
        imageLoadPoolManager.addRequest(requestFn, type, additionalDetails, priority);
      });
    }
  }
}

// Export singleton
const smartImageLoadManager = new SmartImageLoadManager();
export default smartImageLoadManager;
export { SmartImageLoadManager, SmartLoadConfig };
