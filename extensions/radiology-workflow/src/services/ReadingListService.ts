import { PubSubService } from '@ohif/core';

import {
  bySeries,
  forStudy,
  isKept,
  parse,
  serialise,
  STORAGE_KEY,
  toggle,
  type KeptFrame,
} from '../readingList/readingList';

/**
 * Owns the reader's kept frames and their persistence.
 *
 * The rules about what may be kept live in ../readingList; this holds the
 * current list, tells the viewer when it changes, and writes it to local
 * storage. Storage is treated as unreliable throughout: a browser in private
 * mode, or one configured to refuse site data, throws on access rather than
 * returning nothing, and a viewer that will not open because it could not save
 * a bookmark would be a poor trade.
 */
export default class ReadingListService extends PubSubService {
  static EVENTS = {
    CHANGED: 'event::radiologyWorkflow:readingListChanged',
  };

  public static REGISTRATION = {
    name: 'readingListService',
    create: (): ReadingListService => new ReadingListService(),
  };

  private list: KeptFrame[] = [];

  constructor() {
    super(ReadingListService.EVENTS);
    this.list = parse(this.read());
  }

  public getAll(): KeptFrame[] {
    return [...this.list];
  }

  public getForStudy(studyInstanceUID: string): KeptFrame[] {
    return forStudy(this.list, studyInstanceUID);
  }

  public getBySeries(studyInstanceUID: string) {
    return bySeries(this.list, studyInstanceUID);
  }

  public isKept(imageId: string): boolean {
    return isKept(this.list, imageId);
  }

  /** Keeps the frame if it is not kept, forgets it if it is. Returns the new state. */
  public toggle(frame: Omit<KeptFrame, 'keptAt'>): boolean {
    this.commit(toggle(this.list, { ...frame, keptAt: new Date().toISOString() }));
    return this.isKept(frame.imageId);
  }

  public forget(imageId: string): void {
    this.commit(this.list.filter(frame => frame.imageId !== imageId));
  }

  public clearStudy(studyInstanceUID: string): void {
    this.commit(this.list.filter(frame => frame.studyInstanceUID !== studyInstanceUID));
  }

  private commit(list: KeptFrame[]): void {
    this.list = list;
    this.write(serialise(list));
    this._broadcastEvent(ReadingListService.EVENTS.CHANGED, { list: this.getAll() });
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
      // The list still works for this session; it just will not outlive it.
    }
  }
}
