/**
 * Saved layouts: how a reader wants a kind of study arranged on screen.
 *
 * A radiologist reading the same protocol every day arranges the screen the
 * same way every day, and doing it by hand each time is the work this removes.
 *
 * The important decision is what a saved layout stores. Storing which display
 * sets were in which viewport would only ever work for the study it was saved
 * from, since those identifiers are unique to it. Storing the *series
 * descriptions* makes it apply to the next study acquired under the same
 * protocol, which is the point of a hanging protocol at all.
 */

export type LayoutSlot = {
  /** The series description this viewport held, as the archive reported it. */
  seriesDescription: string;
};

export type LayoutPreset = {
  id: string;
  name: string;
  rows: number;
  columns: number;
  slots: LayoutSlot[];
  /** What kind of study this was saved from, used to offer it again. */
  studyDescription: string;
  modality: string;
  savedAt: string;
};

export type AvailableSeries = {
  displaySetInstanceUID: string;
  seriesDescription: string;
};

export const STORAGE_KEY = 'radiology-workflow.layouts';

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const normalise = (description: string) => description.trim().toLowerCase();

export function isValidPreset(preset: unknown): preset is LayoutPreset {
  const candidate = preset as Partial<LayoutPreset> | null;
  return (
    !!candidate &&
    isNonEmpty(candidate.id) &&
    isNonEmpty(candidate.name) &&
    Number.isInteger(candidate.rows) &&
    Number.isInteger(candidate.columns) &&
    (candidate.rows as number) > 0 &&
    (candidate.columns as number) > 0 &&
    Array.isArray(candidate.slots) &&
    candidate.slots.every(slot => typeof slot?.seriesDescription === 'string')
  );
}

/** Saving under a name that already exists for the same kind of study replaces it. */
export function save(list: readonly LayoutPreset[], preset: LayoutPreset): LayoutPreset[] {
  if (!isValidPreset(preset)) {
    return [...list];
  }
  const replaces = (other: LayoutPreset) =>
    normalise(other.name) === normalise(preset.name) &&
    normalise(other.studyDescription) === normalise(preset.studyDescription) &&
    other.modality === preset.modality;

  return [...list.filter(other => !replaces(other)), preset];
}

export function remove(list: readonly LayoutPreset[], id: string): LayoutPreset[] {
  return list.filter(preset => preset.id !== id);
}

/**
 * The layouts worth offering for a study: the ones saved from the same kind of
 * study, most recently saved first. Modality has to match, because a layout for
 * a five sequence MR means nothing on a plain chest film; the description is
 * matched loosely, since archives are not consistent about how they write it.
 */
export function forStudy(
  list: readonly LayoutPreset[],
  study: { studyDescription: string; modality: string }
): LayoutPreset[] {
  return list
    .filter(
      preset =>
        preset.modality === study.modality &&
        normalise(preset.studyDescription) === normalise(study.studyDescription)
    )
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Works out which series goes in which viewport when a layout is applied.
 *
 * A series is used once: two viewports saved with the same description, in a
 * study that has only one such series, fill the first and leave the second
 * empty rather than showing the same images twice and implying a comparison
 * that does not exist. A slot with no match is left empty for the same reason.
 */
export function resolve(
  preset: LayoutPreset,
  available: readonly AvailableSeries[]
): Array<string | null> {
  const unused = available.map(series => ({ ...series, taken: false }));

  return preset.slots.map(slot => {
    const wanted = normalise(slot.seriesDescription);
    const exact = unused.find(
      series => !series.taken && normalise(series.seriesDescription) === wanted
    );
    if (exact) {
      exact.taken = true;
      return exact.displaySetInstanceUID;
    }
    return null;
  });
}

/** How much of a layout a study can actually satisfy, for showing before applying it. */
export function coverage(preset: LayoutPreset, available: readonly AvailableSeries[]) {
  const resolved = resolve(preset, available);
  return {
    filled: resolved.filter(Boolean).length,
    total: preset.slots.length,
  };
}

export function parse(stored: string | null): LayoutPreset[] {
  if (!stored) {
    return [];
  }
  try {
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value.filter(isValidPreset) : [];
  } catch {
    return [];
  }
}

export function serialise(list: readonly LayoutPreset[]): string {
  return JSON.stringify(list);
}
