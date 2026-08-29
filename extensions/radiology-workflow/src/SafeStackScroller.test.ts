import { SafeStackScroller } from './SafeStackScroller';

describe('safe stack scroll', () => {
  it('loads and renders every requested step in order', async () => {
    const rendered: number[] = [];
    const scroller = new SafeStackScroller(0, 10, async () => undefined, index => rendered.push(index));

    await Promise.all([scroller.step(1), scroller.step(1), scroller.step(1)]);
    expect(rendered).toEqual([1, 2, 3]);
  });
});

