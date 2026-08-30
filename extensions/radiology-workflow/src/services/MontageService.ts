import { PubSubService } from '@ohif/core';

import {
  clampPage,
  DEFAULT_MONTAGE_GRID,
  MONTAGE_GRIDS,
  pageCount,
  pageOfFrame,
  type MontageGrid,
} from '../viewports/montageLayout';

export type MontageViewportState = {
  enabled: boolean;
  grid: MontageGrid;
  page: number;
};

const initialState = (): MontageViewportState => ({
  enabled: false,
  grid: { ...DEFAULT_MONTAGE_GRID },
  page: 0,
});

/**
 * Holds, per viewport, whether the reader is looking at a montage and which
 * page of it.
 *
 * The state lives in a service rather than in the viewport component because
 * the toolbar has to read and change it from outside the viewport, and because
 * a viewport that is unmounted and remounted by a layout change should come
 * back showing the same page.
 */
export default class MontageService extends PubSubService {
  static EVENTS = {
    STATE_CHANGED: 'event::radiologyWorkflow:montageStateChanged',
  };

  public static REGISTRATION = {
    name: 'montageService',
    create: (): MontageService => new MontageService(),
  };

  private state = new Map<string, MontageViewportState>();

  constructor() {
    super(MontageService.EVENTS);
  }

  public getState(viewportId: string): MontageViewportState {
    return this.state.get(viewportId) ?? initialState();
  }

  public isEnabled(viewportId: string): boolean {
    return this.getState(viewportId).enabled;
  }

  public setEnabled(viewportId: string, enabled: boolean): void {
    this.update(viewportId, { enabled });
  }

  public toggle(viewportId: string): boolean {
    const enabled = !this.isEnabled(viewportId);
    this.setEnabled(viewportId, enabled);
    return enabled;
  }

  public setGrid(viewportId: string, grid: MontageGrid): void {
    this.update(viewportId, { grid: { ...grid }, page: 0 });
  }

  /** Cycles through the offered grids, for a toolbar button with no menu. */
  public nextGrid(viewportId: string): MontageGrid {
    const { grid } = this.getState(viewportId);
    const at = MONTAGE_GRIDS.findIndex(g => g.rows === grid.rows && g.columns === grid.columns);
    const grids = MONTAGE_GRIDS;
    const next = grids[(at + 1 + grids.length) % grids.length];
    this.setGrid(viewportId, next);
    return next;
  }

  public setPage(viewportId: string, page: number, frameCount: number): number {
    const { grid } = this.getState(viewportId);
    const clamped = clampPage(page, frameCount, grid);
    this.update(viewportId, { page: clamped });
    return clamped;
  }

  public movePage(viewportId: string, delta: number, frameCount: number): number {
    return this.setPage(viewportId, this.getState(viewportId).page + delta, frameCount);
  }

  /** Brings the page holding a frame into view, to follow the active instance. */
  public revealFrame(viewportId: string, frameIndex: number, frameCount: number): number {
    const { grid } = this.getState(viewportId);
    return this.setPage(viewportId, pageOfFrame(frameIndex, frameCount, grid), frameCount);
  }

  public pageCountFor(viewportId: string, frameCount: number): number {
    return pageCount(frameCount, this.getState(viewportId).grid);
  }

  /** Forgets a viewport that the layout no longer contains. */
  public forget(viewportId: string): void {
    if (this.state.delete(viewportId)) {
      this._broadcastEvent(MontageService.EVENTS.STATE_CHANGED, { viewportId, state: null });
    }
  }

  public onModeExit(): void {
    this.state.clear();
  }

  private update(viewportId: string, patch: Partial<MontageViewportState>): void {
    const next = { ...this.getState(viewportId), ...patch };
    this.state.set(viewportId, next);
    this._broadcastEvent(MontageService.EVENTS.STATE_CHANGED, { viewportId, state: next });
  }
}
