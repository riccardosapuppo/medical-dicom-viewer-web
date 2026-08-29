import { nearbyImageIndexes, SmartImageLoadManager } from './smartImageLoadManager';

describe('smart image loading', () => {
  it('starts interaction requests ahead of queued prefetch work', async () => {
    const manager = new SmartImageLoadManager<string>(1);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const first = manager.request({ id: 'first', viewportId: 'v', seriesInstanceUID: 's', kind: 'thumbnail', load: () => new Promise(resolve => { releaseFirst = () => resolve('first'); }) }).then(value => order.push(value));
    const prefetch = manager.request({ id: 'prefetch', viewportId: 'v', seriesInstanceUID: 's', kind: 'prefetch', load: async () => 'prefetch' }).then(value => order.push(value));
    const interaction = manager.request({ id: 'interaction', viewportId: 'v', seriesInstanceUID: 's', kind: 'interaction', load: async () => 'interaction' }).then(value => order.push(value));
    releaseFirst();
    await Promise.all([first, prefetch, interaction]);

    expect(order).toEqual(['first', 'interaction', 'prefetch']);
  });

  it('orders nearby prefetch indexes forward then backward', () => {
    expect(nearbyImageIndexes(3, 8, 2)).toEqual([4, 2, 5, 1]);
  });
});

