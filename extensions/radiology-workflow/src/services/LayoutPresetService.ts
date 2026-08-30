import { PubSubService } from '@ohif/core';

import {
  coverage,
  forStudy,
  parse,
  remove,
  resolve,
  save,
  serialise,
  STORAGE_KEY,
  type AvailableSeries,
  type LayoutPreset,
} from '../layouts/layoutPresets';

/**
 * Owns the reader's saved layouts and their persistence.
 *
 * The rules about what a layout is and how it maps onto a study live in
 * ../layouts; this holds the current set, announces changes, and writes to
 * local storage, which is treated as something that can refuse.
 */
export default class LayoutPresetService extends PubSubService {
  static EVENTS = {
    CHANGED: 'event::radiologyWorkflow:layoutPresetsChanged',
  };

  public static REGISTRATION = {
    name: 'layoutPresetService',
    create: (): LayoutPresetService => new LayoutPresetService(),
  };

  private list: LayoutPreset[] = [];

  constructor() {
    super(LayoutPresetService.EVENTS);
    this.list = parse(this.read());
  }

  public getAll(): LayoutPreset[] {
    return [...this.list];
  }

  public getForStudy(study: { studyDescription: string; modality: string }): LayoutPreset[] {
    return forStudy(this.list, study);
  }

  public save(preset: Omit<LayoutPreset, 'id' | 'savedAt'>): LayoutPreset {
    const complete: LayoutPreset = {
      ...preset,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
    };
    this.commit(save(this.list, complete));
    return complete;
  }

  public remove(id: string): void {
    this.commit(remove(this.list, id));
  }

  public resolve(preset: LayoutPreset, available: readonly AvailableSeries[]) {
    return resolve(preset, available);
  }

  public coverage(preset: LayoutPreset, available: readonly AvailableSeries[]) {
    return coverage(preset, available);
  }

  private commit(list: LayoutPreset[]): void {
    this.list = list;
    this.write(serialise(list));
    this._broadcastEvent(LayoutPresetService.EVENTS.CHANGED, { list: this.getAll() });
  }

  private read(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private write(value: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // The layouts still work for this session; they just will not outlive it.
    }
  }
}
