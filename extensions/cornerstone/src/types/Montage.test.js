import { deriveMontageCells, clampBase } from './Montage';

describe('Montage helpers', () => {
  describe('clampBase', () => {
    it('clamps within [0, total-1] with default visibleCount=1', () => {
      expect(clampBase(-5, 100)).toBe(0);
      expect(clampBase(50, 100)).toBe(50);
      expect(clampBase(150, 100)).toBe(99);
    });
    it('returns 0 for empty series', () => {
      expect(clampBase(10, 0)).toBe(0);
    });
    it('keeps the grid full: base never exceeds total - visibleCount', () => {
      // 10 images, 4 cells, so base tops out at 6 and the last page is full
      expect(clampBase(99, 10, 4)).toBe(6);
      // 3 images, 4 cells: no scrolling is possible, base stays 0
      expect(clampBase(2, 3, 4)).toBe(0);
      expect(clampBase(0, 3, 4)).toBe(0);
    });
  });

  describe('deriveMontageCells', () => {
    it('assigns row-major image indices for 2x2 starting at 0', () => {
      const { cells, visibleCount } = deriveMontageCells(
        { rows: 2, cols: 2, firstImageIndex: 0 },
        542,
        'vp1'
      );
      expect(visibleCount).toBe(4);
      expect(cells.map(c => c.imageIndex)).toEqual([0, 1, 2, 3]);
      expect(cells[0].cellId).toBe('vp1::montage::0');
      expect(cells[3].cellId).toBe('vp1::montage::3');
    });

    it('advances by a full block (step = rows*cols)', () => {
      const { cells } = deriveMontageCells({ rows: 2, cols: 2, firstImageIndex: 4 }, 542, 'vp1');
      expect(cells.map(c => c.imageIndex)).toEqual([4, 5, 6, 7]);
    });

    it('fills a 3x3 grid with 9 sequential images', () => {
      const { cells, visibleCount } = deriveMontageCells(
        { rows: 3, cols: 3, firstImageIndex: 0 },
        542,
        'vp1'
      );
      expect(visibleCount).toBe(9);
      expect(cells.map(c => c.imageIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('keeps the grid full near the end: clamps firstImageIndex to total - visibleCount', () => {
      // 11 images in a 2x2: firstImageIndex 9 is clamped to 7, so cells hold 7 to 10
      const { cells, total } = deriveMontageCells({ rows: 2, cols: 2, firstImageIndex: 9 }, 11, 'vp1');
      expect(cells.map(c => c.imageIndex)).toEqual([7, 8, 9, 10]);
      expect(cells.filter(c => c.imageIndex >= total).length).toBe(0);
    });

    it('fewer images than cells: extra cells stay empty, no scroll past 0', () => {
      // 3 images in a 2x2: cells 0, 1 and 2 are full, cell 3 empty, firstImageIndex held at 0
      const { cells, total } = deriveMontageCells({ rows: 2, cols: 2, firstImageIndex: 5 }, 3, 'vp1');
      expect(cells.map(c => c.imageIndex)).toEqual([0, 1, 2, 3]);
      expect(cells.filter(c => c.imageIndex >= total).length).toBe(1);
    });
  });
});
