export class SafeStackScroller {
  private requestedIndex: number;
  private chain = Promise.resolve();

  constructor(
    initialIndex: number,
    private readonly imageCount: number,
    private readonly load: (index: number) => Promise<void>,
    private readonly render: (index: number) => void,
    private readonly loop = false
  ) {
    this.requestedIndex = initialIndex;
  }

  step(delta: -1 | 1) {
    this.requestedIndex = this.nextIndex(this.requestedIndex + delta);
    const index = this.requestedIndex;
    this.chain = this.chain.then(async () => {
      await this.load(index);
      this.render(index);
    });
    return this.chain;
  }

  synchronize(index: number) {
    this.requestedIndex = this.nextIndex(index);
  }

  private nextIndex(index: number) {
    if (this.loop) return (index + this.imageCount) % this.imageCount;
    return Math.max(0, Math.min(this.imageCount - 1, index));
  }
}
