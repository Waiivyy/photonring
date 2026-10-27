// Photosensitivity (spec section 5): the two toggles that change the brightness of the whole
// image (disk, termination view) share one limiter, from keys, checkboxes and the URL alike.
// Consecutive changes are at least 500 ms apart: at most 2 flashes per second, below the 3 of
// WCAG 2.3.1.
import { describe, expect, it } from 'vitest';
import { createBrightnessLimiter, type BrightnessPair } from '../../src/ui/rate-limit.ts';
import { fakeClock } from '../helpers/fake-clock.ts';
import { seededRandom } from '../helpers/random.ts';

const START: BrightnessPair = { disk: true, view: 'colour' };

function setup(initial = START) {
  const clock = fakeClock(1000);
  const applied: { at: number; pair: BrightnessPair }[] = [];
  const limiter = createBrightnessLimiter(
    initial,
    (pair) => applied.push({ at: clock.now(), pair }),
    {
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    },
  );
  return { clock, applied, limiter };
}

const flipDisk = (p: BrightnessPair): BrightnessPair => ({ ...p, disk: !p.disk });
const flipView = (p: BrightnessPair): BrightnessPair => ({
  ...p,
  view: p.view === 'colour' ? 'termination' : 'colour',
});

describe('brightness limiter', () => {
  it('applies a change from rest at once', () => {
    const { applied, limiter } = setup();
    limiter.request(flipDisk(START));
    expect(applied).toEqual([{ at: 1000, pair: { disk: false, view: 'colour' } }]);
    expect(limiter.isIdle()).toBe(true);
  });

  it('a second press within 500 ms is applied 500 ms after the first: one pair, never faster', () => {
    const { clock, applied, limiter } = setup();
    limiter.request(flipDisk(START));
    clock.advance(100);
    limiter.request(START);
    expect(applied).toHaveLength(1);
    expect(limiter.isIdle()).toBe(false);
    expect(limiter.requested).toEqual(START);
    expect(limiter.applied).toEqual({ disk: false, view: 'colour' });
    clock.advance(400);
    expect(applied.map((a) => a.at)).toEqual([1000, 1500]);
    expect(applied[1]?.pair).toEqual(START);
    expect(limiter.isIdle()).toBe(true);
  });

  it('two presses while a trailing change is scheduled cancel out', () => {
    const { clock, applied, limiter } = setup();
    limiter.request(flipDisk(START));
    clock.advance(50);
    limiter.request(START); // schedules the revert
    clock.advance(50);
    limiter.request(flipDisk(START)); // back to the applied pair
    clock.advance(1000);
    expect(applied).toHaveLength(1);
  });

  it('disk and termination view share the bound, and a combined change counts once', () => {
    const { clock, applied, limiter } = setup();
    limiter.request(flipDisk(START));
    clock.advance(10);
    limiter.request(flipView(flipDisk(START)));
    clock.advance(10);
    limiter.request(flipView(START));
    clock.advance(2000);
    expect(applied.map((a) => a.at)).toEqual([1000, 1500]);
    expect(applied[1]?.pair).toEqual({ disk: true, view: 'termination' });
    expect(limiter.applies).toBe(2);
  });

  it('1,000 random request sequences: applies at least 500 ms apart, final state delivered', () => {
    const rand = seededRandom(7);
    for (let run = 0; run < 1000; run++) {
      const { clock, applied, limiter } = setup();
      let want = START;
      const n = 1 + Math.floor(rand() * 40);
      for (let i = 0; i < n; i++) {
        want = rand() < 0.5 ? flipDisk(want) : flipView(want);
        limiter.request(want);
        clock.advance(Math.floor(rand() * 400));
      }
      clock.advance(1000);
      for (let i = 1; i < applied.length; i++) {
        expect(applied[i]!.at - applied[i - 1]!.at).toBeGreaterThanOrEqual(500);
      }
      // At most 3 changes in any closed one-second window.
      for (const a of applied) {
        expect(
          applied.filter((b) => b.at >= a.at && b.at <= a.at + 1000).length,
        ).toBeLessThanOrEqual(3);
      }
      expect(limiter.applied).toEqual(want);
      expect(limiter.isIdle()).toBe(true);
    }
  });

  it('reset sets both pairs without counting a change', () => {
    const { clock, applied, limiter } = setup();
    limiter.request(flipDisk(START));
    clock.advance(10);
    limiter.request(START);
    limiter.reset({ disk: false, view: 'termination' });
    clock.advance(1000);
    expect(applied).toHaveLength(1);
    expect(limiter.applied).toEqual({ disk: false, view: 'termination' });
    expect(limiter.requested).toEqual({ disk: false, view: 'termination' });
    expect(limiter.isIdle()).toBe(true);
  });

  it('records the time of the last 16 applies', () => {
    const { clock, limiter } = setup();
    let want = START;
    for (let i = 0; i < 20; i++) {
      want = flipDisk(want);
      limiter.request(want);
      clock.advance(600);
    }
    expect(limiter.applyTimes).toHaveLength(16);
    expect(limiter.applies).toBe(20);
  });

  it('dispose cancels a scheduled change', () => {
    const { clock, applied, limiter } = setup();
    limiter.request(flipDisk(START));
    limiter.request(START);
    limiter.dispose();
    clock.advance(1000);
    expect(applied).toHaveLength(1);
    expect(clock.pendingTimers).toBe(0);
  });
});
