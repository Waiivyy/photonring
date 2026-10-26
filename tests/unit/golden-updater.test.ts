// The golden updater must never overwrite a golden image without an explicit acceptance.
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyGoldenUpdate,
  planGoldenUpdate,
  type Image8,
} from '../../src/cpu-renderer/goldens.ts';
import { encodePng } from '../../src/cpu-renderer/png.ts';

const image = (fill: number): Image8 => ({
  width: 4,
  height: 3,
  rgb: new Uint8Array(4 * 3 * 3).fill(fill),
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'goldens-'));
  writeFileSync(join(dir, 'same.png'), encodePng(4, 3, image(10).rgb));
  writeFileSync(join(dir, 'changed.png'), encodePng(4, 3, image(10).rgb));
  const rendered = new Map([
    ['same', image(10)],
    ['changed', image(200)],
    ['new', image(50)],
  ]);
  return { dir, rendered };
}

describe('golden updater', () => {
  it('classifies each image as unchanged, changed or new', () => {
    const { dir, rendered } = setup();
    const plan = planGoldenUpdate(rendered, dir);
    expect(Object.fromEntries(plan.map((p) => [p.name, p.status]))).toEqual({
      same: 'unchanged',
      changed: 'changed',
      new: 'new',
    });
    expect(plan.find((p) => p.name === 'changed')?.diff?.maxChannelDiff).toBe(190);
  });

  it('writes nothing without an explicit acceptance', () => {
    const { dir, rendered } = setup();
    const before = readFileSync(join(dir, 'changed.png'));
    const written = applyGoldenUpdate(planGoldenUpdate(rendered, dir), rendered, dir, new Set());
    expect(written).toEqual([]);
    expect(readFileSync(join(dir, 'changed.png')).equals(before)).toBe(true);
    expect(existsSync(join(dir, 'new.png'))).toBe(false);
  });

  it('writes only the accepted images', () => {
    const { dir, rendered } = setup();
    const written = applyGoldenUpdate(
      planGoldenUpdate(rendered, dir),
      rendered,
      dir,
      new Set(['changed']),
    );
    expect(written).toEqual(['changed']);
    expect(existsSync(join(dir, 'new.png'))).toBe(false);
    const after = readFileSync(join(dir, 'changed.png'));
    expect(after.equals(encodePng(4, 3, image(200).rgb))).toBe(true);
  });

  it('accepting everything never rewrites unchanged images', () => {
    const { dir, rendered } = setup();
    const written = applyGoldenUpdate(planGoldenUpdate(rendered, dir), rendered, dir, 'all');
    expect(written.sort()).toEqual(['changed', 'new']);
  });
});
