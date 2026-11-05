// The README's images (docs/images/): within the size budget and their caps, every image the README
// shows is there, and nothing there is unused, so git does not keep images nobody sees.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url).pathname;
const IMAGES = join(ROOT, 'docs/images');
/** The hero (Stage 6) plus the 2.5 MB budget of Stage 7. */
const TOTAL_BYTES = 3_000_000;
const CAPS: readonly [RegExp, number][] = [
  [/^hero\.png$/, 600_000],
  [/^gallery\/subrings-strip\.png$/, 300_000],
  [/^gallery\/[^/]+\.png$/, 200_000],
  [/^page\/[^/]+\.png$/, 300_000],
  [/^diagrams\/[^/]+\.svg$/, 30_000],
];

function files(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

describe('README images', () => {
  const all = files(IMAGES);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const referenced = [...readme.matchAll(/docs\/images\/([\w./-]+\.(?:png|svg))/g)].map(
    (m) => m[1]!,
  );

  it('stay within the total budget', () => {
    const total = all.reduce((n, f) => n + statSync(join(IMAGES, f)).size, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_BYTES);
  });

  it.each(all)('%s is within its cap', (file) => {
    const cap = CAPS.find(([re]) => re.test(file));
    expect(cap, `no cap for ${file}`).toBeDefined();
    expect(statSync(join(IMAGES, file)).size).toBeLessThanOrEqual(cap![1]);
  });

  it('every image the README shows exists', () => {
    expect(referenced.length).toBeGreaterThan(15);
    for (const file of referenced) expect(all, file).toContain(file);
  });

  it('every file in docs/images is shown by the README', () => {
    for (const file of all) expect(referenced, file).toContain(file);
  });
});
