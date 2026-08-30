import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  coverage,
  forStudy,
  isValidPreset,
  parse,
  remove,
  resolve,
  save,
  serialise,
  type AvailableSeries,
  type LayoutPreset,
} from './layoutPresets.ts';

const preset = (over: Partial<LayoutPreset> = {}): LayoutPreset => ({
  id: 'p1',
  name: 'Renal three phase',
  rows: 1,
  columns: 3,
  slots: [
    { seriesDescription: 'Pre contrast' },
    { seriesDescription: 'BONE' },
    { seriesDescription: 'po 7min' },
  ],
  studyDescription: 'CT ABDOMEN',
  modality: 'CT',
  savedAt: '2026-01-01T10:00:00.000Z',
  ...over,
});

const series = (description: string, uid = description): AvailableSeries => ({
  displaySetInstanceUID: uid,
  seriesDescription: description,
});

describe('isValidPreset', () => {
  it('needs a name and a grid that could be shown', () => {
    assert.equal(isValidPreset(preset()), true);
    assert.equal(isValidPreset({ ...preset(), rows: 0 }), false);
    assert.equal(isValidPreset({ ...preset(), columns: 1.5 }), false);
    assert.equal(isValidPreset({ ...preset(), name: '' }), false);
    assert.equal(isValidPreset(null), false);
  });
});

describe('save', () => {
  it('adds a layout', () => {
    assert.equal(save([], preset()).length, 1);
  });

  it('replaces one saved under the same name for the same kind of study', () => {
    const first = save([], preset());
    const second = save(first, preset({ id: 'p2', columns: 2 }));
    assert.deepEqual(second.map(p => p.id), ['p2']);
  });

  it('treats the name case and spacing insensitively, the way a person would', () => {
    const first = save([], preset());
    const second = save(first, preset({ id: 'p2', name: '  renal THREE phase ' }));
    assert.equal(second.length, 1);
  });

  it('keeps a layout of the same name saved for a different modality', () => {
    const first = save([], preset());
    const second = save(first, preset({ id: 'p2', modality: 'MR' }));
    assert.equal(second.length, 2);
  });

  it('refuses to store something that could not be applied', () => {
    assert.deepEqual(save([], { ...preset(), rows: 0 }), []);
  });
});

describe('forStudy', () => {
  it('offers only layouts saved from the same kind of study', () => {
    const list = [
      preset({ id: 'ct' }),
      preset({ id: 'mr', modality: 'MR' }),
      preset({ id: 'chest', studyDescription: 'CT CHEST' }),
    ];
    assert.deepEqual(
      forStudy(list, { studyDescription: 'CT ABDOMEN', modality: 'CT' }).map(p => p.id),
      ['ct']
    );
  });

  it('puts the most recently saved first', () => {
    const list = [
      preset({ id: 'old', name: 'a', savedAt: '2026-01-01T00:00:00.000Z' }),
      preset({ id: 'new', name: 'b', savedAt: '2026-06-01T00:00:00.000Z' }),
    ];
    assert.deepEqual(
      forStudy(list, { studyDescription: 'CT ABDOMEN', modality: 'CT' }).map(p => p.id),
      ['new', 'old']
    );
  });
});

describe('resolve', () => {
  it('puts each saved series back in its viewport', () => {
    const available = [series('BONE'), series('po 7min'), series('Pre contrast')];
    assert.deepEqual(resolve(preset(), available), ['Pre contrast', 'BONE', 'po 7min']);
  });

  it('ignores case and stray spacing in the description', () => {
    const available = [series('  pre CONTRAST '), series('bone'), series('PO 7MIN')];
    assert.deepEqual(resolve(preset(), available).filter(Boolean).length, 3);
  });

  it('leaves a viewport empty rather than guessing at a series that is not there', () => {
    const available = [series('Pre contrast'), series('BONE')];
    assert.deepEqual(resolve(preset(), available), ['Pre contrast', 'BONE', null]);
  });

  it('never shows one series twice, which would imply a comparison that does not exist', () => {
    const twice = preset({
      slots: [{ seriesDescription: 'Pre contrast' }, { seriesDescription: 'Pre contrast' }],
    });
    assert.deepEqual(resolve(twice, [series('Pre contrast')]), ['Pre contrast', null]);
  });

  it('fills both viewports when the study really does have two such series', () => {
    const twice = preset({
      slots: [{ seriesDescription: 'Pre contrast' }, { seriesDescription: 'Pre contrast' }],
    });
    const available = [series('Pre contrast', 'a'), series('Pre contrast', 'b')];
    assert.deepEqual(resolve(twice, available), ['a', 'b']);
  });
});

describe('coverage', () => {
  it('reports how much of the layout the study can satisfy', () => {
    assert.deepEqual(coverage(preset(), [series('BONE')]), { filled: 1, total: 3 });
  });
});

describe('remove', () => {
  it('removes only the layout named', () => {
    const list = [preset({ id: 'a' }), preset({ id: 'b' })];
    assert.deepEqual(remove(list, 'a').map(p => p.id), ['b']);
  });
});

describe('parse', () => {
  it('reads back what serialise wrote', () => {
    const list = [preset()];
    assert.deepEqual(parse(serialise(list)), list);
  });

  it('starts empty rather than throwing on damaged storage', () => {
    assert.deepEqual(parse('{not json'), []);
    assert.deepEqual(parse(null), []);
  });

  it('drops layouts that could not be applied, and keeps the rest', () => {
    const stored = JSON.stringify([preset({ id: 'good' }), { name: 'broken' }, null]);
    assert.deepEqual(parse(stored).map(p => p.id), ['good']);
  });
});
