import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clampPage,
  DEFAULT_MONTAGE_GRID,
  framesOnPage,
  framesPerPage,
  pageCount,
  pageOfFrame,
  sampleFrames,
} from './montageLayout.ts';

const grid = { rows: 2, columns: 3 };

describe('framesPerPage', () => {
  it('multiplies the grid', () => {
    assert.equal(framesPerPage(grid), 6);
    assert.equal(framesPerPage(DEFAULT_MONTAGE_GRID), 12);
  });

  it('never returns zero, so paging cannot divide by it', () => {
    assert.equal(framesPerPage({ rows: 0, columns: 4 }), 1);
  });
});

describe('pageCount', () => {
  it('rounds up, because a short last page is still a page', () => {
    assert.equal(pageCount(12, grid), 2);
    assert.equal(pageCount(13, grid), 3);
  });

  it('reports one page for an empty series rather than none', () => {
    assert.equal(pageCount(0, grid), 1);
  });
});

describe('clampPage', () => {
  it('keeps the page inside the series', () => {
    assert.equal(clampPage(-4, 13, grid), 0);
    assert.equal(clampPage(99, 13, grid), 2);
  });

  it('survives a page that is not a number', () => {
    assert.equal(clampPage(Number.NaN, 13, grid), 0);
  });
});

describe('pageOfFrame', () => {
  it('finds the page holding a frame', () => {
    assert.equal(pageOfFrame(0, 13, grid), 0);
    assert.equal(pageOfFrame(5, 13, grid), 0);
    assert.equal(pageOfFrame(6, 13, grid), 1);
    assert.equal(pageOfFrame(12, 13, grid), 2);
  });

  it('clamps a frame beyond the series to the last page', () => {
    assert.equal(pageOfFrame(500, 13, grid), 2);
  });
});

describe('framesOnPage', () => {
  it('returns a full page', () => {
    assert.deepEqual(framesOnPage(0, 13, grid), [0, 1, 2, 3, 4, 5]);
  });

  it('does not pad the short last page', () => {
    assert.deepEqual(framesOnPage(2, 13, grid), [12]);
  });

  it('returns nothing for an empty series', () => {
    assert.deepEqual(framesOnPage(0, 0, grid), []);
  });

  it('covers every frame exactly once across all pages', () => {
    const frameCount = 137;
    const seen: number[] = [];
    for (let page = 0; page < pageCount(frameCount, grid); page++) {
      seen.push(...framesOnPage(page, frameCount, grid));
    }
    assert.deepEqual(
      seen,
      Array.from({ length: frameCount }, (_, i) => i)
    );
  });
});

describe('sampleFrames', () => {
  it('spreads the samples across the series instead of taking the first ones', () => {
    assert.deepEqual(sampleFrames(100, 4), [12, 37, 62, 87]);
  });

  it('returns every frame when asked for more than there are', () => {
    assert.deepEqual(sampleFrames(3, 10), [0, 1, 2]);
  });

  it('never points past the last frame', () => {
    for (const count of [1, 7, 12, 99]) {
      for (const total of [1, 5, 137, 512]) {
        const sampled = sampleFrames(total, count);
        assert.ok(sampled.every(i => i >= 0 && i < total));
      }
    }
  });
});
