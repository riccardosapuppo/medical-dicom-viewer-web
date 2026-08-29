export type ImageRequestKind = 'interaction' | 'thumbnail' | 'prefetch';

export interface ImageRequest<T> {
  id: string;
  viewportId: string;
  seriesInstanceUID: string;
  kind: ImageRequestKind;
  load(signal: AbortSignal): Promise<T>;
}

interface QueuedRequest<T> extends ImageRequest<T> {
  sequence: number;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

interface ActiveRequest<T> {
  request: QueuedRequest<T>;
  controller: AbortController;
}

const priorities: Record<ImageRequestKind, number> = {
  interaction: 0,
  thumbnail: 1,
  prefetch: 2,
};

export class SmartImageLoadManager<T> {
  private queue: QueuedRequest<T>[] = [];
  private active = new Map<string, ActiveRequest<T>>();
  private sequence = 0;

  constructor(private readonly concurrency = 4) {}

  request(request: ImageRequest<T>): Promise<T> {
    const duplicate = this.queue.find(item => item.id === request.id) ?? this.active.get(request.id)?.request;
    if (duplicate) return Promise.reject(new Error(`Duplicate image request: ${request.id}`));

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ ...request, sequence: this.sequence++, resolve, reject });
      this.queue.sort((left, right) => priorities[left.kind] - priorities[right.kind] || left.sequence - right.sequence);
      if (request.kind === 'interaction') this.preemptPrefetch();
      this.pump();
    });
  }

  cancelStaleViewportRequests(viewportId: string, keepSeriesInstanceUID: string) {
    this.cancel(request => request.viewportId === viewportId && request.seriesInstanceUID !== keepSeriesInstanceUID);
  }

  cancelViewport(viewportId: string) {
    this.cancel(request => request.viewportId === viewportId);
  }

  getStats() {
    return {
      active: this.active.size,
      queued: this.queue.length,
      interaction: this.queue.filter(request => request.kind === 'interaction').length,
      prefetch: this.queue.filter(request => request.kind === 'prefetch').length,
    };
  }

  private preemptPrefetch() {
    if (this.active.size < this.concurrency) return;
    const prefetch = [...this.active.values()].find(active => active.request.kind === 'prefetch');
    prefetch?.controller.abort('Preempted by an interaction request');
  }

  private cancel(predicate: (request: QueuedRequest<T>) => boolean) {
    const cancelled = this.queue.filter(predicate);
    this.queue = this.queue.filter(request => !predicate(request));
    cancelled.forEach(request => request.reject(new DOMException('Request cancelled', 'AbortError')));
    for (const active of this.active.values()) {
      if (predicate(active.request)) active.controller.abort('Request cancelled');
    }
  }

  private pump() {
    while (this.active.size < this.concurrency && this.queue.length) {
      const request = this.queue.shift()!;
      const controller = new AbortController();
      this.active.set(request.id, { request, controller });
      request
        .load(controller.signal)
        .then(request.resolve, request.reject)
        .finally(() => {
          this.active.delete(request.id);
          this.pump();
        });
    }
  }
}

export function nearbyImageIndexes(current: number, count: number, radius = 2) {
  const indexes: number[] = [];
  for (let distance = 1; distance <= radius; distance += 1) {
    if (current + distance < count) indexes.push(current + distance);
    if (current - distance >= 0) indexes.push(current - distance);
  }
  return indexes;
}

