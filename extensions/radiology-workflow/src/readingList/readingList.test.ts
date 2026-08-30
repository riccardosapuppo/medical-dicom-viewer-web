import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  bySeries,
  forget,
  forStudy,
  isKeepable,
  isKept,
  keep,
  parse,
  serialise,
  toggle,
  type KeptFrame,
} from './readingList.ts';

const frame = (over: Partial<KeptFrame> = {}): KeptFrame => ({
  imageId: 'wadors:/studies/1/series/2/instances/3/frames/1',
  studyInstanceUID: '1',
  seriesInstanceUID: '2',
  seriesDescription: 'Pre contrast',
  instanceNumber: '3',
  keptAt: '2026-01-01T10:00:00.000Z',
  ...over,
});

describe('isKeepable', () => {
  it('needs an image id and the study and series it belongs to', () => {
    assert.equal(isKeepable(frame()), true);
    assert.equal(isKeepable({ ...frame(), imageId: '' }), false);
    assert.equal(isKeepable({ ...frame(), studyInstanceUID: undefined }), false);
    assert.equal(isKeepable(null), false);
  });
});

describe('keep', () => {
  it('adds a frame', () => {
    assert.deepEqual(keep([], frame()).map(f => f.imageId), [frame().imageId]);
  });

  it('does not duplicate a frame already kept', () => {
    const once = keep([], frame());
    assert.equal(keep(once, frame()).length, 1);
  });

  it('leaves the list alone rather than storing something unusable', () => {
    assert.deepEqual(keep([], { ...frame(), imageId: '' }), []);
  });

  it('does not mutate the list it was given', () => {
    const original: KeptFrame[] = [];
    keep(original, frame());
    assert.equal(original.length, 0);
  });
});

describe('toggle', () => {
  it('keeps a frame that is not kept, and forgets one that is', () => {
    const kept = toggle([], frame());
    assert.equal(isKept(kept, frame().imageId), true);
    assert.equal(isKept(toggle(kept, frame()), frame().imageId), false);
  });
});

describe('forget', () => {
  it('removes only the frame named', () => {
    const list = [frame(), frame({ imageId: 'other' })];
    assert.deepEqual(forget(list, 'other').map(f => f.imageId), [frame().imageId]);
  });

  it('is silent about a frame that was never kept', () => {
    assert.equal(forget([frame()], 'absent').length, 1);
  });
});

describe('forStudy', () => {
  it('returns only that study, in the order the frames were kept', () => {
    const list = [
      frame({ imageId: 'b', keptAt: '2026-01-01T12:00:00.000Z' }),
      frame({ imageId: 'x', studyInstanceUID: 'other' }),
      frame({ imageId: 'a', keptAt: '2026-01-01T09:00:00.000Z' }),
    ];
    assert.deepEqual(forStudy(list, '1').map(f => f.imageId), ['a', 'b']);
  });
});

describe('bySeries', () => {
  it('groups a study under its series, keeping the description', () => {
    const list = [
      frame({ imageId: 'a' }),
      frame({ imageId: 'b', seriesInstanceUID: '9', seriesDescription: 'Bone kernel' }),
      frame({ imageId: 'c' }),
    ];
    assert.deepEqual(
      bySeries(list, '1').map(g => [g.description, g.frames.length]),
      [['Pre contrast', 2], ['Bone kernel', 1]]
    );
  });
});

describe('parse', () => {
  it('reads back what serialise wrote', () => {
    const list = [frame(), frame({ imageId: 'b' })];
    assert.deepEqual(parse(serialise(list)), list);
  });

  it('starts empty when there is nothing stored', () => {
    assert.deepEqual(parse(null), []);
    assert.deepEqual(parse(''), []);
  });

  it('starts empty rather than throwing on damaged storage', () => {
    assert.deepEqual(parse('{not json'), []);
    assert.deepEqual(parse('"a string"'), []);
    assert.deepEqual(parse('{"imageId":"a"}'), []);
  });

  it('drops entries that could never be shown again, and keeps the rest', () => {
    const stored = JSON.stringify([frame(), { imageId: '' }, null, frame({ imageId: 'b' })]);
    assert.deepEqual(parse(stored).map(f => f.imageId), [frame().imageId, 'b']);
  });
});
