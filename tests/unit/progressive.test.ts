// Progressive refinement and reduced resolution while interacting (Stage 3): the frame-by-frame
// plan of the interactive page, driven with explicit times so it can be tested without a GPU.
import { describe, expect, it } from 'vitest';
import {
  choosePreviewScale,
  ProgressiveRenderer,
  type FrameAction,
} from '../../src/gpu/host/progressive.ts';

describe('preview scale', () => {
  it('is half resolution before any cost is known', () => {
    expect(choosePreviewScale(null, 1920 * 1080, 12)).toBe(0.5);
  });

  it('is full resolution when a whole one-sample frame fits the budget', () => {
    expect(choosePreviewScale(5 / (1920 * 1080), 1920 * 1080, 12)).toBe(1);
  });

  it('shrinks with the estimated cost, in steps of 1/8, between 1/4 and 1/2', () => {
    const pixels = 3840 * 2160;
    const scale = (fullMs: number) => choosePreviewScale(fullMs / pixels, pixels, 12);
    expect(scale(20)).toBe(0.5);
    expect(scale(48)).toBe(0.5);
    expect(scale(80)).toBe(0.375);
    expect(scale(1000)).toBe(0.25);
    for (const ms of [13, 30, 60, 100, 200, 400]) {
      expect((scale(ms) * 8) % 1).toBe(0);
      // A preview at that scale fits the budget unless the floor of 1/4 is reached.
      if (scale(ms) > 0.25) expect(ms * scale(ms) ** 2).toBeLessThanOrEqual(12);
    }
  });
});

const W = 1024;
const H = 512;
const options = { budgetMs: 12, settleMs: 120, tileSize: 256 };

/** Runs frames every 16 ms until the plan is done or `limit` frames pass. */
function runUntilDone(p: ProgressiveRenderer, start: number, limit = 200) {
  const actions: FrameAction[] = [];
  let now = start;
  for (let i = 0; i < limit && !p.done; i++) {
    const a = p.next(now);
    actions.push(a);
    if (a.kind === 'trace' || a.kind === 'refine') p.completed(a, 4);
    if (a.kind === 'preview') p.completed(a, 1);
    now += 16;
  }
  return { actions, now };
}

describe('progressive renderer', () => {
  it('starts with a preview, then after the settle time renders full resolution and refines', () => {
    const p = new ProgressiveRenderer(W, H, options);
    p.sceneChanged(0, true);
    const first = p.next(0);
    expect(first).toMatchObject({ kind: 'preview', scale: 0.5, reset: true, present: 'preview' });
    p.completed(first, 1);
    expect(p.next(50).kind).toBe('idle');
    const { actions } = runUntilDone(p, 130);
    const kinds = actions.map((a) => a.kind);
    expect(kinds).toContain('trace');
    expect(kinds).toContain('refine');
    expect(kinds.indexOf('refine')).toBeGreaterThan(kinds.lastIndexOf('trace'));
    const traced = actions.flatMap((a) => (a.kind === 'trace' ? a.tiles : []));
    const refined = actions.flatMap((a) => (a.kind === 'refine' ? a.tiles : []));
    expect(traced).toHaveLength(8);
    expect(refined).toHaveLength(8);
    // The full image is shown only once every tile of the first pass is in.
    const lastTrace = actions.filter((a) => a.kind === 'trace').at(-1)!;
    expect(lastTrace.present).toBe('full');
    for (const a of actions.filter((x) => x.kind === 'trace').slice(0, -1)) {
      expect(a.present).toBeNull();
    }
    expect(p.done).toBe(true);
  });

  it('is not done from the moment the scene changes', () => {
    const p = new ProgressiveRenderer(W, H, options);
    p.sceneChanged(0, false);
    p.completed(p.next(0), 1);
    runUntilDone(p, 200);
    expect(p.done).toBe(true);
    p.sceneChanged(1000, false);
    expect(p.done).toBe(false);
    expect(p.stage).not.toBe('done');
  });

  it('keeps previewing while the scene keeps changing and a full frame does not fit', () => {
    const p = new ProgressiveRenderer(W, H, options);
    for (let t = 0; t < 500; t += 16) {
      p.sceneChanged(t, true);
      const a = p.next(t);
      expect(a.kind).toBe('preview');
      // 6 ms for a quarter of the pixels: a full frame would take about 24 ms.
      p.completed(a, 6);
    }
  });

  it('renders full resolution directly when it fits the budget, and refines only after settling', () => {
    const p = new ProgressiveRenderer(W, H, options);
    p.sceneChanged(0, true);
    p.completed(p.next(0), 1); // preview: 1 ms for 1/4 of the pixels
    runUntilDone(p, 200); // full frame measured at 4 ms per batch
    p.sceneChanged(1000, true);
    const a = p.next(1000);
    expect(a).toMatchObject({ kind: 'trace', reset: true, present: 'full' });
    expect(a.kind === 'trace' && a.tiles.length).toBe(8);
    p.completed(a, 4);
    expect(p.next(1016).kind).toBe('idle');
    expect(p.next(1130).kind).toBe('refine');
  });

  it('skips anti-aliasing when it is off', () => {
    const p = new ProgressiveRenderer(W, H, options);
    p.sceneChanged(0, false);
    p.completed(p.next(0), 1);
    const { actions } = runUntilDone(p, 200);
    expect(actions.some((a) => a.kind === 'refine')).toBe(false);
    expect(p.done).toBe(true);
  });

  it('waits while a batch is in flight', () => {
    const p = new ProgressiveRenderer(W, H, options);
    p.sceneChanged(0, true);
    const a = p.next(0);
    expect(p.next(16).kind).toBe('idle');
    p.completed(a, 1);
    expect(p.next(200).kind).toBe('trace');
  });

  it('a change during refinement starts over with a reset', () => {
    const p = new ProgressiveRenderer(W, H, { ...options, budgetMs: 4 });
    p.sceneChanged(0, true);
    p.completed(p.next(0), 1);
    let now = 200;
    let a = p.next(now);
    while (a.kind !== 'refine') {
      if (a.kind !== 'idle') p.completed(a, 4);
      now += 16;
      a = p.next(now);
    }
    p.completed(a, 4);
    expect(p.remaining.refine).toBeGreaterThan(0);
    p.sceneChanged(now, true);
    const b = p.next(now + 16);
    expect(b.kind === 'preview' || b.kind === 'trace').toBe(true);
    expect(b.kind !== 'idle' && b.reset).toBe(true);
    expect(p.done).toBe(false);
  });

  it('a resize starts over at the new size', () => {
    const p = new ProgressiveRenderer(W, H, options);
    p.sceneChanged(0, false);
    p.completed(p.next(0), 1);
    runUntilDone(p, 200);
    p.resize(512, 256, 5000);
    const a = p.next(5000);
    expect(a.kind === 'preview' || a.kind === 'trace').toBe(true);
    expect(p.width).toBe(512);
  });
});
