// Golden images: comparison with a documented tolerance, and an update step that never
// overwrites a golden unless that golden was explicitly accepted.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.ts';

export const GOLDEN_DIR = fileURLToPath(new URL('../../tests/golden/images/', import.meta.url));

/**
 * Renders are deterministic on one machine, so goldens normally match exactly. The tolerance
 * absorbs last-bit differences in Math.exp, Math.sin and friends between JavaScript engines or
 * platforms: at most 2 levels (of 255) in any channel, in at most 0.1 % of channels.
 */
export const GOLDEN_TOLERANCE = { maxChannelDiff: 2, maxFraction: 1e-3 } as const;

export interface Image8 {
  readonly width: number;
  readonly height: number;
  readonly rgb: Uint8Array;
}

export interface ImageDiff {
  readonly maxChannelDiff: number;
  readonly differingChannels: number;
  readonly fraction: number;
}

export function compareImages(a: Image8, b: Image8): ImageDiff {
  if (a.width !== b.width || a.height !== b.height) {
    return { maxChannelDiff: 255, differingChannels: Infinity, fraction: 1 };
  }
  let maxChannelDiff = 0;
  let differingChannels = 0;
  for (let k = 0; k < a.rgb.length; k++) {
    const d = Math.abs((a.rgb[k] as number) - (b.rgb[k] as number));
    if (d > 0) differingChannels++;
    if (d > maxChannelDiff) maxChannelDiff = d;
  }
  return { maxChannelDiff, differingChannels, fraction: differingChannels / a.rgb.length };
}

export function withinTolerance(diff: ImageDiff): boolean {
  return (
    diff.maxChannelDiff <= GOLDEN_TOLERANCE.maxChannelDiff &&
    diff.fraction <= GOLDEN_TOLERANCE.maxFraction
  );
}

export interface GoldenPlanEntry {
  readonly name: string;
  readonly status: 'new' | 'unchanged' | 'changed';
  readonly diff?: ImageDiff;
}

/** Compares fresh renders with the goldens on disk. Unchanged means identical bytes of pixels. */
export function planGoldenUpdate(
  rendered: ReadonlyMap<string, Image8>,
  dir: string,
): GoldenPlanEntry[] {
  return [...rendered].map(([name, image]) => {
    const path = join(dir, `${name}.png`);
    if (!existsSync(path)) return { name, status: 'new' };
    const diff = compareImages(decodePng(readFileSync(path)), image);
    return diff.maxChannelDiff === 0
      ? { name, status: 'unchanged' }
      : { name, status: 'changed', diff };
  });
}

/** Writes the new or changed goldens that were accepted by name (or all of them), nothing else. */
export function applyGoldenUpdate(
  plan: readonly GoldenPlanEntry[],
  rendered: ReadonlyMap<string, Image8>,
  dir: string,
  accept: ReadonlySet<string> | 'all',
): string[] {
  const written: string[] = [];
  for (const entry of plan) {
    if (entry.status === 'unchanged') continue;
    if (accept !== 'all' && !accept.has(entry.name)) continue;
    const image = rendered.get(entry.name);
    if (!image) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${entry.name}.png`), encodePng(image.width, image.height, image.rgb));
    written.push(entry.name);
  }
  return written;
}
