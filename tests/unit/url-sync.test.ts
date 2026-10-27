// Writing the view state to the URL hash (Stage 4): debounced, no history entries, never
// depending on a write succeeding.
import { describe, expect, it } from 'vitest';
import { createUrlSync } from '../../src/ui/url-sync.ts';
import { fakeClock } from '../helpers/fake-clock.ts';

function setup(throwing = 0) {
  const clock = fakeClock();
  const writes: string[] = [];
  let failures = throwing;
  const sync = createUrlSync({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    replaceHash: (h) => {
      if (failures > 0) {
        failures--;
        throw new Error('SecurityError: too many calls');
      }
      writes.push(h);
    },
  });
  return { clock, writes, sync };
}

describe('URL sync', () => {
  it('writes once, 300 ms after the last of a burst of changes', () => {
    const { clock, writes, sync } = setup();
    for (let i = 0; i < 100; i++) {
      sync.schedule(`r=${i}`);
      clock.advance(2);
    }
    expect(writes).toEqual([]);
    clock.advance(299);
    expect(writes).toEqual(['r=99']);
    clock.advance(10_000);
    expect(writes).toEqual(['r=99']);
  });

  it('does not write a hash equal to the last one written', () => {
    const { clock, writes, sync } = setup();
    sync.schedule('a');
    clock.advance(300);
    sync.schedule('a');
    clock.advance(300);
    expect(writes).toEqual(['a']);
    expect(sync.lastWritten).toBe('a');
  });

  it('knows a hash it wrote itself, so the hashchange it might cause is ignored', () => {
    const { clock, sync } = setup();
    sync.schedule('a');
    clock.advance(300);
    expect(sync.isOwn('#a')).toBe(true);
    expect(sync.isOwn('a')).toBe(true);
    expect(sync.isOwn('#b')).toBe(false);
  });

  it('catches a failing write and retries once after 2 s', () => {
    const { clock, writes, sync } = setup(1);
    sync.schedule('a');
    clock.advance(300);
    expect(writes).toEqual([]);
    clock.advance(2000);
    expect(writes).toEqual(['a']);
  });

  it('after a second failure it waits for the next change', () => {
    const { clock, writes, sync } = setup(2);
    sync.schedule('a');
    clock.advance(300);
    clock.advance(2000);
    clock.advance(60_000);
    expect(writes).toEqual([]);
    sync.schedule('b');
    clock.advance(300);
    expect(writes).toEqual(['b']);
  });

  it('cancel drops a pending write; flush writes it now', () => {
    const { clock, writes, sync } = setup();
    sync.schedule('a');
    sync.cancel();
    clock.advance(1000);
    expect(writes).toEqual([]);
    sync.schedule('b');
    sync.flush();
    expect(writes).toEqual(['b']);
    clock.advance(1000);
    expect(writes).toEqual(['b']);
    expect(clock.pendingTimers).toBe(0);
  });
});
