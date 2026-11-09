// Timestamp-query timing that does not trust what the queue returns: the copy of the query set
// waits until the timed work has finished, and a span is used only when it can be a duration.
// Safari 27.0 on an Apple M5 returned the previous batch's timestamps when the copy ran while the
// timed passes were still executing (docs/PERFORMANCE.md, "Timestamps in Safari").
import { describe, expect, it } from 'vitest';
import {
  timestampSpanMs,
  timeSubmissions,
  WALL_SLACK_MS,
  type TimestampSlots,
  type TimingDevice,
} from '../../src/gpu/host/timestamps.ts';

const ns = (ms: number) => BigInt(Math.round(ms * 1e6));

describe('timestampSpanMs', () => {
  it('returns the span between two timestamps in milliseconds', () => {
    expect(timestampSpanMs(ns(1000), ns(1012.5), 20)).toBe(12.5);
  });

  it('rejects an end before the beginning', () => {
    // As in Safari: a fresh beginning and the previous batch's end, 500 ms earlier.
    expect(timestampSpanMs(ns(1500), ns(1000), 20)).toBeNull();
  });

  it('counts equal timestamps as 0 ms: work shorter than one timestamp step', () => {
    // Chrome rounds timestamps to steps of 65.536 microseconds, so a short batch reads 0.
    expect(timestampSpanMs(ns(1000), ns(1000), 0.5)).toBe(0);
  });

  it('rejects a beginning of 0, the value of a query that was never written', () => {
    expect(timestampSpanMs(0n, 0n, 20)).toBeNull();
    expect(timestampSpanMs(0n, ns(5), 20)).toBeNull();
  });

  it('rejects a span longer than the wall-clock time of the same work, beyond the slack', () => {
    expect(timestampSpanMs(ns(1000), ns(1020 + WALL_SLACK_MS), 20)).toBe(20 + WALL_SLACK_MS);
    expect(timestampSpanMs(ns(1000), ns(1020.01 + WALL_SLACK_MS), 20)).toBeNull();
    // A stale beginning from seconds before and a fresh end.
    expect(timestampSpanMs(ns(1000), ns(4350), 20)).toBeNull();
  });

  it('rejects a wall-clock time that is not a finite number', () => {
    expect(timestampSpanMs(ns(1000), ns(1005), Number.NaN)).toBeNull();
    expect(timestampSpanMs(ns(1000), ns(1005), Number.POSITIVE_INFINITY)).toBeNull();
  });
});

interface Named {
  readonly name: string;
}

/** A fake device that logs the order of queue operations and drains only when told to. */
function fakeDevice(t: readonly [bigint, bigint]) {
  const log: string[] = [];
  const drains: (() => void)[] = [];
  const device: TimingDevice<string, Named, Named> = {
    queue: {
      submit: (buffers) => log.push(`submit ${buffers[0]!.name}`),
      onSubmittedWorkDone: () => {
        log.push('wait for the queue');
        return new Promise<void>((resolve) =>
          drains.push(() => {
            log.push('queue drained');
            resolve();
          }),
        );
      },
    },
    createCommandEncoder: () => ({
      resolveQuerySet: (set, first, count, destination) =>
        log.push(`resolve ${set} ${first}..${first + count - 1} into ${destination.name}`),
      copyBufferToBuffer: (source, _from, destination) =>
        log.push(`copy ${source.name} to ${destination.name}`),
      finish: () => ({ name: 'copy-out' }),
    }),
  };
  const read = {
    name: 'read',
    mapAsync: (mode: number) => {
      log.push(`map ${mode}`);
      return Promise.resolve();
    },
    getMappedRange: () => new BigUint64Array(t).buffer,
    unmap: () => log.push('unmap'),
  };
  const slots: TimestampSlots<string, Named> = {
    set: 'queries',
    resolve: { name: 'resolved' },
    read,
  };
  return { device, slots, log, drain: () => drains.shift()?.() };
}

describe('timeSubmissions', () => {
  it('copies the timestamps out only after the queue has finished the timed work', async () => {
    const { device, slots, log, drain } = fakeDevice([ns(100), ns(112)]);
    let clock = 0;
    const timing = timeSubmissions(
      device,
      slots,
      () => {
        log.push('timed work');
        device.queue.submit([{ name: 'tiles' }]);
        clock = 15;
      },
      () => clock,
    );
    await Promise.resolve();
    expect(log).toEqual(['timed work', 'submit tiles', 'wait for the queue']);
    drain();
    await expect(timing).resolves.toEqual({ gpuMs: 12, wallMs: 15 });
    expect(log).toEqual([
      'timed work',
      'submit tiles',
      'wait for the queue',
      'queue drained',
      'resolve queries 0..1 into resolved',
      'copy resolved to read',
      'submit copy-out',
      'map 1',
      'unmap',
    ]);
  });

  it('measures wall-clock time alone when there is no query set', async () => {
    const { device, log, drain } = fakeDevice([0n, 0n]);
    let clock = 3;
    const timing = timeSubmissions(
      device,
      null,
      () => (clock = 10),
      () => clock,
    );
    await Promise.resolve();
    drain();
    await expect(timing).resolves.toEqual({ gpuMs: null, wallMs: 7 });
    expect(log).toEqual(['wait for the queue', 'queue drained']);
  });

  it('keeps the wall-clock time and drops the GPU time when the timestamps are not a span', async () => {
    const { device, slots, log, drain } = fakeDevice([ns(1500), ns(1000)]);
    let clock = 0;
    const timing = timeSubmissions(
      device,
      slots,
      () => (clock = 9),
      () => clock,
    );
    await Promise.resolve();
    drain();
    await expect(timing).resolves.toEqual({ gpuMs: null, wallMs: 9 });
    expect(log.at(-1)).toBe('unmap');
  });
});
