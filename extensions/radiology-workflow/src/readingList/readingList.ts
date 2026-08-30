/**
 * The reading list: the frames a reader has kept while going through a study.
 *
 * Radiologists mark the images that carry the finding as they read, and come
 * back to them when writing the report. The list is deliberately a plain array
 * of plain objects with pure functions over it, so the rules about what may go
 * in it can be tested without a browser, a viewport or an archive.
 */

export type KeptFrame = {
  imageId: string;
  studyInstanceUID: string;
  seriesInstanceUID: string;
  seriesDescription: string;
  /** Instance number as the archive reports it, for showing back to the reader. */
  instanceNumber: string;
  /** When it was kept, so the list can be shown in the order the study was read. */
  keptAt: string;
};

export const STORAGE_KEY = 'radiology-workflow.reading-list';

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/** A frame with no image id cannot be shown again, so it cannot be kept. */
export function isKeepable(frame: Partial<KeptFrame> | null | undefined): frame is KeptFrame {
  return (
    !!frame &&
    isNonEmpty(frame.imageId) &&
    isNonEmpty(frame.studyInstanceUID) &&
    isNonEmpty(frame.seriesInstanceUID)
  );
}

export function isKept(list: readonly KeptFrame[], imageId: string): boolean {
  return list.some(frame => frame.imageId === imageId);
}

/**
 * Adds a frame. Keeping the same frame twice is not an error and does not
 * duplicate it: the reader pressed the star again, which means they expect
 * nothing to change.
 */
export function keep(list: readonly KeptFrame[], frame: KeptFrame): KeptFrame[] {
  if (!isKeepable(frame) || isKept(list, frame.imageId)) {
    return [...list];
  }
  return [...list, frame];
}

export function forget(list: readonly KeptFrame[], imageId: string): KeptFrame[] {
  return list.filter(frame => frame.imageId !== imageId);
}

export function toggle(list: readonly KeptFrame[], frame: KeptFrame): KeptFrame[] {
  return isKept(list, frame.imageId) ? forget(list, frame.imageId) : keep(list, frame);
}

/** The frames kept in one study, oldest first, which is the order they were read in. */
export function forStudy(list: readonly KeptFrame[], studyInstanceUID: string): KeptFrame[] {
  return list
    .filter(frame => frame.studyInstanceUID === studyInstanceUID)
    .sort((a, b) => a.keptAt.localeCompare(b.keptAt));
}

/** Groups a study's kept frames by series, for a panel that lists them under headings. */
export function bySeries(list: readonly KeptFrame[], studyInstanceUID: string) {
  const groups = new Map<string, { description: string; frames: KeptFrame[] }>();
  for (const frame of forStudy(list, studyInstanceUID)) {
    const group = groups.get(frame.seriesInstanceUID) ?? {
      description: frame.seriesDescription,
      frames: [],
    };
    group.frames.push(frame);
    groups.set(frame.seriesInstanceUID, group);
  }
  return [...groups.entries()].map(([seriesInstanceUID, group]) => ({
    seriesInstanceUID,
    ...group,
  }));
}

/**
 * Reads a stored list. Anything that is not a well formed list of keepable
 * frames is discarded rather than repaired: local storage is shared with every
 * other page on the origin, it can be edited by hand, and a viewer that trusts
 * it and then fails while rendering is worse than one that starts empty.
 */
export function parse(stored: string | null): KeptFrame[] {
  if (!stored) {
    return [];
  }
  try {
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value.filter(isKeepable) : [];
  } catch {
    return [];
  }
}

export function serialise(list: readonly KeptFrame[]): string {
  return JSON.stringify(list);
}
