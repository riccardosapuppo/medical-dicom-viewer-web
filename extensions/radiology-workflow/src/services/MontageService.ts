import { PubSubService } from '@ohif/core';

import {
  cellCount,
  clampFirstIndex,
  DEFAULT_MONTAGE_GRID,
  gridForSeries,
  MONTAGE_GRIDS,
  revealIndex,
  scrollRange,
  slideBy,
  type MontageGrid,
  type MontageState,
} from '../viewports/montageLayout';

const initialState = (): MontageState => ({
  enabled: false,
  grid: { ...DEFAULT_MONTAGE_GRID },
  firstImageIndex: 0,
});

/**
 * Holds, per viewport, whether the reader is looking at a subgrid, how it is
 * divided, and where the window onto the series sits.
 *
 * The state lives in a service rather than in the component because the toolbar
 * changes it from outside the viewport, and because a viewport unmounted and
 * remounted by a layout change should come back showing the same levels.
 */
export default class MontageService extends PubSubService {
  static EVENTS = {
    STATE_CHANGED: 'event::radiologyWorkflow:montageStateChanged',
  };

  public static REGISTRATION = {
    name: 'montageService',
    create: (): MontageService => new MontageService(),
  };

  private state = new Map<string, MontageState>();

  constructor() {
    super(MontageService.EVENTS);
  }

  public getState(viewportId: string): MontageState {
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

  /**
   * Turns the subgrid on with a grid chosen for the length of the series, and
   * the window placed so the level the reader was on is on the sheet.
   */
  public open(viewportId: string, total: number, currentImageIndex: number): MontageState {
    const grid = gridForSeries(total);
    const opened: MontageState = { enabled: true, grid, firstImageIndex: 0 };
    opened.firstImageIndex = revealIndex(opened, total, currentImageIndex);
    this.replace(viewportId, opened);
    return opened;
  }

  public setGrid(viewportId: string, grid: MontageGrid, total: number): void {
    const current = this.getState(viewportId);
    const next: MontageState = { ...current, grid: { ...grid } };
    // Keep the top-left level where it was, then pull the window back if the
    // larger grid would now run past the end of the series.
    next.firstImageIndex = clampFirstIndex(current.firstImageIndex, total, cellCount(grid));
    this.replace(viewportId, next);
  }

  /** Cycles the offered grids, for a keyboard shortcut or a plain button. */
  public nextGrid(viewportId: string, total: number): MontageGrid {
    const { grid } = this.getState(viewportId);
    const at = MONTAGE_GRIDS.findIndex(g => g.rows === grid.rows && g.columns === grid.columns);
    const next = MONTAGE_GRIDS[(at + 1 + MONTAGE_GRIDS.length) % MONTAGE_GRIDS.length];
    this.setGrid(viewportId, next, total);
    return next;
  }

  public setFirstImageIndex(viewportId: string, first: number, total: number): number {
    const { grid } = this.getState(viewportId);
    const clamped = clampFirstIndex(first, total, cellCount(grid));
    this.update(viewportId, { firstImageIndex: clamped });
    return clamped;
  }

  /** Slides the window by a number of images, which is how scrolling arrives. */
  public slide(viewportId: string, delta: number, total: number): number {
    const next = slideBy(this.getState(viewportId), total, delta);
    this.update(viewportId, { firstImageIndex: next });
    return next;
  }

  /** Brings a level onto the sheet, moving the window as little as possible. */
  public reveal(viewportId: string, imageIndex: number, total: number): number {
    const next = revealIndex(this.getState(viewportId), total, imageIndex);
    this.update(viewportId, { firstImageIndex: next });
    return next;
  }

  public scrollRangeFor(viewportId: string, total: number): number {
    return scrollRange(total, this.getState(viewportId).grid);
  }

  /** Forgets a viewport the layout no longer contains. */
  public forget(viewportId: string): void {
    if (this.state.delete(viewportId)) {
      this._broadcastEvent(MontageService.EVENTS.STATE_CHANGED, { viewportId, state: null });
    }
  }

  public onModeExit(): void {
    this.state.clear();
  }

  private update(viewportId: string, patch: Partial<MontageState>): void {
    this.replace(viewportId, { ...this.getState(viewportId), ...patch });
  }

  private replace(viewportId: string, next: MontageState): void {
    this.state.set(viewportId, next);
    this._broadcastEvent(MontageService.EVENTS.STATE_CHANGED, { viewportId, state: next });
  }
}
