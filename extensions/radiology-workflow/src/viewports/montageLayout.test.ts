import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cellCount,
  cellsFor,
  clampFirstIndex,
  DEFAULT_MONTAGE_GRID,
  gridForSeries,
  revealIndex,
  scrollRange,
  slideBy,
  type MontageState,
} from './montageLayout.ts';

const state = (over: Partial<MontageState> = {}): MontageState => ({
  enabled: true,
  grid: { rows: 2, columns: 2 },
  firstImageIndex: 0,
  ...over,
});

describe('cellCount', () => {
  it('multiplies the grid', () => {
    assert.equal(cellCount({ rows: 2, columns: 3 }), 6);
    assert.equal(cellCount(DEFAULT_MONTAGE_GRID), 4);
  });

  it('never returns zero, so nothing divides by it', () => {
    assert.equal(cellCount({ rows: 0, columns: 4 }), 1);
  });
});

describe('clampFirstIndex', () => {
  it('stops where the grid is still full', () => {
    // Ten images in four cells: the last window starts at six and shows 6..9.
    assert.equal(clampFirstIndex(99, 10, 4), 6);
  });

  it('does not move at all when the series is shorter than the grid', () => {
    assert.equal(clampFirstIndex(5, 3, 4), 0);
  });

  it('refuses to go below the first image', () => {
    assert.equal(clampFirstIndex(-8, 10, 4), 0);
  });

  it('survives an index that is not a number', () => {
    assert.equal(clampFirstIndex(Number.NaN, 10, 4), 0);
  });

  it('is zero for an empty series', () => {
    assert.equal(clampFirstIndex(3, 0, 4), 0);
  });
});

describe('scrollRange', () => {
  it('is how many images the window can travel', () => {
    assert.equal(scrollRange(10, { rows: 2, columns: 2 }), 6);
  });

  it('is zero when the series fits on the sheet', () => {
    assert.equal(scrollRange(4, { rows: 2, columns: 2 }), 0);
    assert.equal(scrollRange(3, { rows: 2, columns: 2 }), 0);
  });
});

describe('cellsFor', () => {
  it('fills the cells in reading order from the first index', () => {
    assert.deepEqual(cellsFor(state({ firstImageIndex: 4 }), 20), [4, 5, 6, 7]);
  });

  it('slides by one image rather than by a page', () => {
    assert.deepEqual(cellsFor(state({ firstImageIndex: 1 }), 20), [1, 2, 3, 4]);
  });

  it('keeps every cell filled at the end of the series', () => {
    // Not [9, -1, -1, -1], which is what paging would have given.
    assert.deepEqual(cellsFor(state({ firstImageIndex: 99 }), 10), [6, 7, 8, 9]);
  });

  it('leaves the tail empty when the series is shorter than the grid', () => {
    assert.deepEqual(cellsFor(state(), 3), [0, 1, 2, -1]);
  });

  it('never repeats an image to fill a cell', () => {
    const shown = cellsFor(state(), 3).filter(index => index >= 0);
    assert.equal(new Set(shown).size, shown.length);
  });

  it('returns nothing usable for an empty series', () => {
    assert.deepEqual(cellsFor(state(), 0), [-1, -1, -1, -1]);
  });
});

describe('revealIndex', () => {
  it('leaves the window alone when the image is already on the sheet', () => {
    assert.equal(revealIndex(state({ firstImageIndex: 4 }), 20, 6), 4);
  });

  it('moves the least it can when the image is below the sheet', () => {
    // Four cells showing 4..7; asking for 8 slides one image, not a page.
    assert.equal(revealIndex(state({ firstImageIndex: 4 }), 20, 8), 5);
  });

  it('moves the least it can when the image is above the sheet', () => {
    assert.equal(revealIndex(state({ firstImageIndex: 4 }), 20, 2), 2);
  });

  it('keeps the grid full when revealing the last image', () => {
    assert.equal(revealIndex(state({ firstImageIndex: 0 }), 10, 9), 6);
  });
});

describe('slideBy', () => {
  it('moves the window and stays in range', () => {
    assert.equal(slideBy(state({ firstImageIndex: 4 }), 20, 3), 7);
    assert.equal(slideBy(state({ firstImageIndex: 4 }), 20, -9), 0);
    assert.equal(slideBy(state({ firstImageIndex: 4 }), 10, 99), 6);
  });
});

describe('gridForSeries', () => {
  it('grows with the series and stops at sixteen cells', () => {
    assert.deepEqual(gridForSeries(3), { rows: 1, columns: 2 });
    assert.deepEqual(gridForSeries(10), { rows: 2, columns: 2 });
    assert.deepEqual(gridForSeries(30), { rows: 2, columns: 3 });
    assert.deepEqual(gridForSeries(63), { rows: 3, columns: 3 });
    assert.deepEqual(gridForSeries(500), { rows: 4, columns: 4 });
    assert.ok(cellCount(gridForSeries(5000)) <= 16);
  });
});
