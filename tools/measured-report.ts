// Prints the measured values the tests recorded with MEASURE=1 (tests/helpers/measured.ts): the
// numbers behind docs/VALIDATION.md, worst value per key, from the last npm run measure.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../artifacts/measured/', import.meta.url));
if (!existsSync(dir)) {
  console.error('No measured values: run npm run measure');
  process.exit(1);
}

type Entry = { value: number; worst: 'max' | 'min' };
const rows: [key: string, file: string, entry: Entry][] = [];
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  const values = JSON.parse(readFileSync(`${dir}${file}`, 'utf8')) as Record<string, Entry>;
  for (const [key, entry] of Object.entries(values))
    rows.push([key, file.replace(/\.json$/, ''), entry]);
}
rows.sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
const width = Math.max(...rows.map(([key]) => key.length));
for (const [key, file, { value, worst }] of rows) {
  const mag = Math.abs(value);
  const v =
    value === 0 ? '0' : mag >= 1e-3 && mag < 1e5 ? value.toPrecision(4) : value.toExponential(2);
  console.log(
    `${key.padEnd(width)}  ${v.padStart(9)}  ${worst === 'min' ? 'smallest' : 'largest '}  ${file}`,
  );
}
