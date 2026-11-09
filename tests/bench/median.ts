// Medians for the benchmarks. The harness gives NaN for a repeat whose GPU span was rejected
// (src/gpu/host/timestamps.ts), so a median is taken over the finite values only, and the
// benchmarks record how many repeats were left out.

/** Median of the finite values (the upper middle for an even count), NaN if there are none. */
export function median(values: readonly number[]): number {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? Number.NaN : (s[Math.floor(s.length / 2)] as number);
}

/** How many values are not finite: repeats whose GPU span was rejected. */
export function rejected(values: readonly number[]): number {
  return values.filter((v) => !Number.isFinite(v)).length;
}
