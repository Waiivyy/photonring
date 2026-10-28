// Readable contrast (spec section 4): overlay lines against the image and the halo under them,
// and the page's text tokens against the panels, by the WCAG 2 contrast ratio.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HALO, OVERLAY_IDS, OVERLAY_STYLES } from '../../src/ui/overlay-style.ts';
import { measured } from '../helpers/measured.ts';

type Rgb = [number, number, number];

/** WCAG 2 relative luminance of an sRGB colour with channels in 0..1. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Source-over compositing in sRGB, as browsers blend. */
function over(top: Rgb, alpha: number, below: Rgb): Rgb {
  return [0, 1, 2].map((i) => alpha * top[i]! + (1 - alpha) * below[i]!) as Rgb;
}

function hex(h: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (!m) throw new Error(`not a #rrggbb colour: ${h}`);
  return [1, 2, 3].map((i) => parseInt(m[i]!, 16) / 255) as Rgb;
}

const css = readFileSync(new URL('../../src/ui/style.css', import.meta.url), 'utf8');

/** A colour token from :root, as #rgb, #rrggbb or rgba(r, g, b, a). */
function token(name: string): { rgb: Rgb; alpha: number } {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  const v = m[1]!.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short)
    return {
      rgb: hex(`#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}`),
      alpha: 1,
    };
  if (v.startsWith('#')) return { rgb: hex(v), alpha: 1 };
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v);
  if (!rgba) throw new Error(`unsupported colour ${v}`);
  return { rgb: [1, 2, 3].map((i) => Number(rgba[i]) / 255) as Rgb, alpha: Number(rgba[4]) };
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [1, 1, 1];
const haloOverWhite = over(HALO.rgb, HALO.alpha, WHITE);

describe('overlay lines', () => {
  it('are at least 3:1 against a black sky and against their halo over a white disk', () => {
    for (const id of OVERLAY_IDS) {
      const c = hex(OVERLAY_STYLES[id].colour);
      const onBlack = measured('Stage 4: overlay line contrast on black', ratio(c, BLACK), 'min');
      expect(onBlack, id).toBeGreaterThanOrEqual(3);
      const onHalo = measured(
        'Stage 4: overlay line contrast on its halo over white',
        ratio(c, haloOverWhite),
        'min',
      );
      expect(onHalo, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('the halo over white is at least 3:1 against white, so the line stands out on any image', () => {
    const halo = measured(
      'Stage 4: halo over white against white',
      ratio(haloOverWhite, WHITE),
      'min',
    );
    expect(halo).toBeGreaterThanOrEqual(3);
  });

  it('every overlay has its own dash pattern, so colour is never the only cue', () => {
    const dashes = OVERLAY_IDS.map((id) => OVERLAY_STYLES[id].dash.join(' '));
    expect(new Set(dashes).size).toBe(OVERLAY_IDS.length);
  });
});

describe('page text', () => {
  for (const panel of ['panel', 'panel-solid']) {
    for (const backdrop of [BLACK, WHITE]) {
      const p = token(panel);
      const bg = over(p.rgb, p.alpha, backdrop);
      const where = `on --${panel} over ${backdrop === BLACK ? 'black' : 'white'}`;
      it(`text tokens are at least 4.5:1 ${where}`, () => {
        for (const name of ['fg', 'muted', 'accent']) {
          const r = measured(
            'Stage 4: text contrast on the panels',
            ratio(token(name).rgb, bg),
            'min',
          );
          expect(r, `--${name} ${where}`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  it('the swatch outline is at least 3:1 on the solid panel', () => {
    const p = token('panel-solid');
    for (const backdrop of [BLACK, WHITE]) {
      const r = ratio(token('fg').rgb, over(p.rgb, p.alpha, backdrop));
      expect(
        measured('Stage 4: swatch outline contrast on the solid panel', r, 'min'),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
