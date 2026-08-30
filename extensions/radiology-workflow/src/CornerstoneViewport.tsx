import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Types } from '@cornerstonejs/core';
import type { PrimaryViewerTool } from './cornerstoneTools';
import { isCornerstonePrimaryTool } from './cornerstoneTools';
import { loadCornerstoneRuntime, type CornerstoneRuntime } from './cornerstoneRuntime';
import type { StudySeries } from './study';

export interface ViewportPresentation {
  windowCenter: number;
  windowWidth: number;
  zoom: number;
  pan: [number, number];
  rotation: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  invert: boolean;
}

export interface CornerstoneViewportHandle {
  jumpTo(index: number): Promise<void>;
  setWindow(center: number, width: number): void;
  reset(): void;
  rotate(delta: number): void;
  flip(axis: 'horizontal' | 'vertical'): void;
  toggleInvert(): void;
}

interface CornerstoneViewportProps {
  series: StudySeries;
  activeTool: PrimaryViewerTool;
  initialIndex: number;
  onIndexChange(index: number): void;
  onPresentationChange?(presentation: ViewportPresentation): void;
  onAnnotationCountChange?(count: number): void;
  onReady?(): void;
  onError?(message: string): void;
}

let viewportSequence = 0;

export const CornerstoneViewport = forwardRef<CornerstoneViewportHandle, CornerstoneViewportProps>(
  function CornerstoneViewport(
    {
      series,
      activeTool,
      initialIndex,
      onIndexChange,
      onPresentationChange,
      onAnnotationCountChange,
      onReady,
      onError,
    },
    forwardedRef
  ) {
    const elementRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<CornerstoneRuntime>();
    const viewportRef = useRef<Types.IStackViewport>();
    const engineRef = useRef<InstanceType<CornerstoneRuntime['core']['RenderingEngine']>>();
    const toolGroupIdRef = useRef('');
    const activeToolRef = useRef(activeTool);
    const callbacksRef = useRef({ onIndexChange, onPresentationChange, onAnnotationCountChange, onReady, onError });
    const [identity] = useState(() => ++viewportSequence);
    const renderingEngineId = `radiology-engine-${identity}`;
    const viewportId = `radiology-viewport-${identity}`;
    const toolGroupId = `radiology-tools-${identity}`;
    const imageIds = useMemo(
      () => series.imagePaths.map(path => `wadouri:${new URL(path, window.location.origin).href}`),
      [series.imagePaths]
    );

    callbacksRef.current = { onIndexChange, onPresentationChange, onAnnotationCountChange, onReady, onError };
    activeToolRef.current = activeTool;

    const readPresentation = () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const properties = viewport.getProperties();
      const view = viewport.getViewPresentation();
      const lower = properties.voiRange?.lower ?? 0;
      const upper = properties.voiRange?.upper ?? 0;
      callbacksRef.current.onPresentationChange?.({
        windowCenter: Math.round((upper + lower) / 2),
        windowWidth: Math.round(upper - lower),
        zoom: view.zoom ?? 1,
        pan: view.pan ?? [0, 0],
        rotation: view.rotation ?? 0,
        flipHorizontal: view.flipHorizontal ?? false,
        flipVertical: view.flipVertical ?? false,
        invert: properties.invert ?? false,
      });
    };

    useImperativeHandle(forwardedRef, () => ({
      async jumpTo(index) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        await viewport.setImageIdIndex(Math.max(0, Math.min(series.slices - 1, index)));
        viewport.render();
      },
      setWindow(center, width) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.setProperties({ voiRange: { lower: center - width / 2, upper: center + width / 2 } });
        viewport.render();
        readPresentation();
      },
      reset() {
        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.resetCamera();
        viewport.resetProperties();
        viewport.render();
        readPresentation();
      },
      rotate(delta) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const current = viewport.getViewPresentation();
        viewport.setViewPresentation({ rotation: ((current.rotation ?? 0) + delta + 360) % 360 });
        viewport.render();
        readPresentation();
      },
      flip(axis) {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const current = viewport.getViewPresentation();
        viewport.setViewPresentation(axis === 'horizontal'
          ? { flipHorizontal: !(current.flipHorizontal ?? false) }
          : { flipVertical: !(current.flipVertical ?? false) });
        viewport.render();
        readPresentation();
      },
      toggleInvert() {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const properties = viewport.getProperties();
        viewport.setProperties({ invert: !(properties.invert ?? false) });
        viewport.render();
        readPresentation();
      },
    }), [series.slices]);

    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      let cancelled = false;
      let resizeObserver: ResizeObserver | undefined;
      const listeners: Array<[EventTarget, string, EventListener]> = [];

      const listen = (target: EventTarget, name: string, listener: EventListener) => {
        target.addEventListener(name, listener);
        listeners.push([target, name, listener]);
      };

      void loadCornerstoneRuntime().then(async runtime => {
        if (cancelled) return;
        runtimeRef.current = runtime;
        const { core, tools } = runtime;
        const engine = new core.RenderingEngine(renderingEngineId);
        engineRef.current = engine;
        engine.enableElement({
          element,
          viewportId,
          type: core.Enums.ViewportType.STACK,
          defaultOptions: { background: [0, 0, 0] },
        });

        const viewport = engine.getStackViewport(viewportId);
        viewportRef.current = viewport;
        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) throw new Error('Cornerstone could not create the viewport tool group.');
        toolGroupIdRef.current = toolGroupId;
        Object.values(runtime.toolNames).forEach(toolName => toolGroup.addTool(toolName));
        toolGroup.addViewport(viewportId, renderingEngineId);
        toolGroup.setToolActive(runtime.toolNames.scroll, {
          bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
        });

        const activatePrimaryTool = (tool: PrimaryViewerTool) => {
          Object.values(runtime.toolNames).forEach(toolName => toolGroup.setToolPassive(toolName, { removeAllBindings: true }));
          toolGroup.setToolActive(runtime.toolNames.scroll, {
            bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
          });
          if (isCornerstonePrimaryTool(tool)) {
            const toolName = runtime.toolNames[tool];
            const bindings = tool === 'scroll'
              ? [
                { mouseButton: tools.Enums.MouseBindings.Primary },
                { mouseButton: tools.Enums.MouseBindings.Wheel },
              ]
              : [{ mouseButton: tools.Enums.MouseBindings.Primary }];
            toolGroup.setToolActive(toolName, { bindings });
          }
        };

        activatePrimaryTool(activeToolRef.current);

        const handleImageRendered = () => {
          callbacksRef.current.onIndexChange(viewport.getCurrentImageIdIndex());
          readPresentation();
        };
        const updateAnnotationCount = () => {
          const count = ['Length', 'Probe', 'RectangleROI', 'PlanarFreehandROI'].reduce(
            (total, toolName) => total + tools.annotation.state.getAnnotations(toolName, element).length,
            0
          );
          callbacksRef.current.onAnnotationCountChange?.(count);
        };
        listen(element, core.Enums.Events.IMAGE_RENDERED, handleImageRendered as EventListener);
        listen(core.eventTarget, tools.Enums.Events.ANNOTATION_COMPLETED, updateAnnotationCount as EventListener);
        listen(core.eventTarget, tools.Enums.Events.ANNOTATION_REMOVED, updateAnnotationCount as EventListener);
        resizeObserver = new ResizeObserver(() => engine.resize(true, true));
        resizeObserver.observe(element);

        await viewport.setStack(imageIds, Math.max(0, Math.min(imageIds.length - 1, initialIndex)));
        if (cancelled) return;
        viewport.render();
        callbacksRef.current.onReady?.();

        (element as HTMLDivElement & { activatePrimaryTool?: (tool: PrimaryViewerTool) => void }).activatePrimaryTool = activatePrimaryTool;
      }).catch(error => {
        if (!cancelled) callbacksRef.current.onError?.(error instanceof Error ? error.message : String(error));
      });

      return () => {
        cancelled = true;
        resizeObserver?.disconnect();
        listeners.forEach(([target, name, listener]) => target.removeEventListener(name, listener));
        if (toolGroupIdRef.current && runtimeRef.current) {
          runtimeRef.current.tools.ToolGroupManager.destroyToolGroup(toolGroupIdRef.current);
        }
        if (engineRef.current && !engineRef.current.hasBeenDestroyed) engineRef.current.destroy();
        runtimeRef.current = undefined;
        viewportRef.current = undefined;
        engineRef.current = undefined;
      };
    }, [imageIds, renderingEngineId, toolGroupId, viewportId]);

    useEffect(() => {
      const element = elementRef.current as (HTMLDivElement & { activatePrimaryTool?: (tool: PrimaryViewerTool) => void }) | null;
      element?.activatePrimaryTool?.(activeTool);
    }, [activeTool]);

    return <div ref={elementRef} className="cornerstone-viewport" data-series-uid={series.seriesInstanceUID} />;
  }
);
