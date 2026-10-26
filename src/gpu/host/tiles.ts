// Tiling and time budget: the image is rendered in tiles, centre first, and each animation frame
// dispatches only as many tiles as fit in its time budget, so no frame or single submission
// keeps the GPU busy for long. Tile cost is estimated from measured time per pixel.

export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Tiles covering a width x height image exactly once, sorted by distance from the centre. */
export function planTiles(width: number, height: number, tileSize: number): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({
        x,
        y,
        width: Math.min(tileSize, width - x),
        height: Math.min(tileSize, height - y),
      });
    }
  }
  const cx = width / 2;
  const cy = height / 2;
  const dist = (t: Tile) => Math.hypot(t.x + t.width / 2 - cx, t.y + t.height / 2 - cy);
  return tiles.sort((a, b) => dist(a) - dist(b));
}

export class TileScheduler {
  private queue: Tile[] = [];
  private msPerPixel: number | null = null;

  reset(tiles: readonly Tile[]): void {
    this.queue = [...tiles];
  }

  get done(): boolean {
    return this.queue.length === 0;
  }

  get remaining(): number {
    return this.queue.length;
  }

  /** Tiles to dispatch this frame: at least one, then more while the estimate fits the budget. */
  takeForFrame(budgetMs: number): Tile[] {
    if (this.queue.length === 0) return [];
    if (this.msPerPixel === null) return this.queue.splice(0, 1);
    let spent = 0;
    let count = 0;
    while (count < this.queue.length) {
      const t = this.queue[count] as Tile;
      const cost = t.width * t.height * this.msPerPixel;
      if (count > 0 && spent + cost > budgetMs) break;
      spent += cost;
      count++;
    }
    return this.queue.splice(0, count);
  }

  /** Feeds back the measured GPU time for a batch of pixels (moving average). */
  recordCost(pixels: number, ms: number): void {
    if (!(pixels > 0 && ms >= 0 && Number.isFinite(ms))) return;
    const sample = ms / pixels;
    this.msPerPixel = this.msPerPixel === null ? sample : 0.5 * (this.msPerPixel + sample);
  }
}
