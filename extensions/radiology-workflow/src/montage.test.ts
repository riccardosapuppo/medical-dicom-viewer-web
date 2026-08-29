import { getMontageLayout, moveMontagePage, normalizeMontagePageStart, visibleMontageSlices } from './montage';

describe('montage paging', () => {
  it('fills the last page instead of leaving mostly empty cells', () => {
    const layout = getMontageLayout('3x3');
    const next = moveMontagePage(12, 9, 0, 1);

    expect(next).toBe(3);
    expect(visibleMontageSlices(12, layout, next)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('clamps page requests in both directions', () => {
    expect(normalizeMontagePageStart(20, 4, -100)).toBe(0);
    expect(normalizeMontagePageStart(20, 4, 100)).toBe(16);
  });
});

