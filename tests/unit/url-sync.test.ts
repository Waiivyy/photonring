// Writing the view state to the URL hash (Stage 4): debounced, no history entries, never
// depending on a write succeeding, and always compared with the hash actually in the address
// bar (which the user can change).
import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, RETRY_MS, createUrlSync } from '../../src/ui/url-sync.ts';
import { fakeClock } from '../helpers/fake-clock.ts';

function setup(throwing = 0) {
  const clock = fakeClock();
  const writes: string[] = [];
  let failures = throwing;
  const bar = { hash: '' };
  const sync = createUrlSync({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    getHash: () => bar.hash,
    replaceHash: (h) => {
      if (failures > 0) {
        failures--;
        throw new Error('SecurityError: too many calls');
      }
      writes.push(h);
      bar.hash = h;
    },
  });
  return { clock, writes, sync, bar };
}

describe('URL sync', () => {
  it('writes once, exactly 300 ms after the last of a burst of changes', () => {
    expect(DEBOUNCE_MS).toBe(300);
    const { clock, writes, sync } = setup();
    for (let i = 0; i < 100; i++) {
      sync.schedule(`r=${i}`);
      clock.advance(2);
    }
    // The last schedule was 2 ms ago.
    clock.advance(297);
    expect(writes).toEqual([]);
    clock.advance(1);
    expect(writes).toEqual(['r=99']);
    clock.advance(10_000);
    expect(writes).toEqual(['r=99']);
  });

  it('does not write a hash the address bar already shows', () => {
    const { clock, writes, sync } = setup();
    sync.schedule('a');
    clock.advance(300);
    sync.schedule('a');
    clock.advance(300);
    expect(writes).toEqual(['a']);
    expect(sync.lastWritten).toBe('a');
  });

  it('writes again after the address bar was changed from outside', () => {
    const { clock, writes, sync, bar } = setup();
    sync.schedule('disk=1');
    clock.advance(300);
    bar.hash = 'disk=0'; // edited in the address bar; the page applies it
    sync.schedule('disk=1'); // the user toggles the disk back on
    clock.advance(300);
    expect(writes).toEqual(['disk=1', 'disk=1']);
    expect(bar.hash).toBe('disk=1');
  });

  it('catches a failing write and retries once, 2 s later', () => {
    expect(RETRY_MS).toBe(2000);
    const { clock, writes, sync } = setup(1);
    sync.schedule('a');
    clock.advance(300);
    expect(writes).toEqual([]);
    clock.advance(1999);
    expect(writes).toEqual([]);
    clock.advance(1);
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
