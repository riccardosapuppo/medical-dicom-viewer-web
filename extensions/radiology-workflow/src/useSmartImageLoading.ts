import { useEffect, useRef, useState } from 'react';
import type { Study } from './study';
import { nearbyImageIndexes, SmartImageLoadManager } from './smartImageLoadManager';

export function useSmartImageLoading(study: Study, sliceIndex: number) {
  const manager = useRef(new SmartImageLoadManager<number>(3));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentManager = manager.current;
    const load = (index: number, delay: number) => (signal: AbortSignal) =>
      new Promise<number>((resolve, reject) => {
        const timeout = window.setTimeout(() => resolve(index), delay);
        signal.addEventListener('abort', () => {
          window.clearTimeout(timeout);
          reject(new DOMException('Request cancelled', 'AbortError'));
        }, { once: true });
      });

    currentManager.cancelStaleViewportRequests('primary', study.seriesInstanceUID);
    setLoading(true);
    currentManager.request({
      id: `${study.seriesInstanceUID}:${sliceIndex}:interaction:${performance.now()}`,
      viewportId: 'primary',
      seriesInstanceUID: study.seriesInstanceUID,
      kind: 'interaction',
      load: load(sliceIndex, 16),
    }).then(() => setLoading(false)).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoading(false);
    });

    nearbyImageIndexes(sliceIndex, study.slices).forEach(index => {
      currentManager.request({
        id: `${study.seriesInstanceUID}:${index}:prefetch:${performance.now()}`,
        viewportId: 'primary',
        seriesInstanceUID: study.seriesInstanceUID,
        kind: 'prefetch',
        load: load(index, 35),
      }).catch(() => undefined);
    });

    return () => currentManager.cancelViewport('primary');
  }, [sliceIndex, study.seriesInstanceUID, study.slices]);

  return loading;
}
