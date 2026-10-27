// Teardown on restart after device loss (Stage 4): every listener, timer and animation frame the
// app creates is released at once, and nothing runs afterwards.
import { describe, expect, it } from 'vitest';
import { createLifecycle } from '../../src/ui/lifecycle.ts';
import { fakeClock } from '../helpers/fake-clock.ts';

function setup() {
  const clock = fakeClock();
  const life = createLifecycle({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  return { clock, life };
}

describe('lifecycle', () => {
  it('runs timers and frames while alive', () => {
    const { clock, life } = setup();
    const ran: string[] = [];
    life.timeout(() => ran.push('timer'), 10);
    life.frame(() => ran.push('frame'));
    clock.advance(10);
    clock.runFrames();
    expect(ran).toEqual(['timer', 'frame']);
  });

  it('a cancelled timer does not run', () => {
    const { clock, life } = setup();
    const ran: string[] = [];
    const id = life.timeout(() => ran.push('timer'), 10);
    life.cancel(id);
    clock.advance(100);
    expect(ran).toEqual([]);
  });

  it('after dispose: no callback runs, the signal is aborted, hooks run once in reverse order', () => {
    const { clock, life } = setup();
    const ran: string[] = [];
    life.timeout(() => ran.push('timer'), 10);
    life.frame(() => ran.push('frame'));
    life.onDispose(() => ran.push('first'));
    life.onDispose(() => ran.push('second'));
    let aborted = false;
    life.signal.addEventListener('abort', () => (aborted = true));
    life.dispose();
    // Released by dispose itself, before any time passes.
    expect(clock.pendingTimers).toBe(0);
    expect(clock.pendingFrames).toBe(0);
    clock.advance(100);
    clock.runFrames();
    expect(ran).toEqual(['second', 'first']);
    expect(aborted).toBe(true);
    expect(life.signal.aborted).toBe(true);
    expect(life.disposed).toBe(true);
    expect(clock.pendingTimers).toBe(0);
    expect(clock.pendingFrames).toBe(0);
    life.dispose();
    expect(ran).toEqual(['second', 'first']);
  });

  it('timers, frames and hooks registered after dispose never run', () => {
    const { clock, life } = setup();
    life.dispose();
    const ran: string[] = [];
    life.timeout(() => ran.push('timer'), 1);
    life.frame(() => ran.push('frame'));
    life.onDispose(() => ran.push('hook'));
    clock.advance(10);
    clock.runFrames();
    expect(ran).toEqual([]);
  });

  it('a hook that throws does not stop the others', () => {
    const { life } = setup();
    const ran: string[] = [];
    life.onDispose(() => ran.push('a'));
    life.onDispose(() => {
      throw new Error('boom');
    });
    expect(() => life.dispose()).not.toThrow();
    expect(ran).toEqual(['a']);
  });
});
