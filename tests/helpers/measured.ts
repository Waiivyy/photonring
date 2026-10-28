// The values docs/VALIDATION.md reports as measured. A test passes each number it checks against
// a tolerance through measured(), which returns it unchanged and keeps the worst value per key
// (the largest, or the smallest for 'min'). With MEASURE=1 (npm run measure) each test file writes
// its values to artifacts/measured/ when it finishes, and tools/measured-report.ts prints them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { afterAll, expect } from 'vitest';

export type Worst = 'max' | 'min';

const values = new Map<string, { value: number; worst: Worst }>();

export function measured(key: string, value: number, worst: Worst = 'max'): number {
  const prev = values.get(key);
  if (prev === undefined || (worst === 'max' ? value > prev.value : value < prev.value)) {
    values.set(key, { value, worst });
  }
  return value;
}

if (process.env.MEASURE) {
  const file = basename(expect.getState().testPath ?? 'unknown');
  afterAll(() => {
    const dir = new URL('../../artifacts/measured/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      new URL(`${file}.json`, dir),
      JSON.stringify(Object.fromEntries(values), null, 1),
    );
  });
}
