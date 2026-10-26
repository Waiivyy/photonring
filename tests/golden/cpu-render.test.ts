// CPU reference renderer (spec section 10, items 6, 8, 10, 12).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_DIR,
  GOLDEN_TOLERANCE,
  compareImages,
  withinTolerance,
} from '../../src/cpu-renderer/goldens.ts';
import { decodePng, encodePng } from '../../src/cpu-renderer/png.ts';
import { encodeImage, renderImage, type RenderSettings } from '../../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES, validationScene } from '../../src/cpu-renderer/scenes.ts';
import { measureShadowRadius } from '../../src/cpu-renderer/shadow.ts';
import {
  autoFieldOfView,
  cameraFrame,
  pixelDirection,
  shadowAngularRadius,
  skyRadiance,
} from '../../src/physics/index.ts';

const small = (s: RenderSettings): RenderSettings => ({ ...s, width: 64, height: 36 });

describe('12. determinism and goldens', () => {
  it('the same settings give the same bytes', () => {
    const s = small(GOLDEN_SCENES.diskInclined);
    const a = encodePng(s.width, s.height, encodeImage(renderImage(s), s));
    const b = encodePng(s.width, s.height, encodeImage(renderImage(s), s));
    expect(a.equals(b)).toBe(true);
  });

  it.each(Object.keys(GOLDEN_SCENES))('%s matches its golden image', (name) => {
    const path = join(GOLDEN_DIR, `${name}.png`);
    expect(existsSync(path), `missing golden ${path}; run npm run golden:update`).toBe(true);
    const golden = decodePng(readFileSync(path));
    const s = GOLDEN_SCENES[name as keyof typeof GOLDEN_SCENES];
    const rgb = encodeImage(renderImage(s), s);
    const diff = compareImages(golden, { width: s.width, height: s.height, rgb });
    expect(
      withinTolerance(diff),
      `${name}: max channel difference ${diff.maxChannelDiff}, ${diff.differingChannels} channels differ (tolerance ${JSON.stringify(GOLDEN_TOLERANCE)})`,
    ).toBe(true);
  });
});

describe('8. flat-space limit', () => {
  it('with M = 0 the render equals straight-ray star field sampling exactly', () => {
    const s: RenderSettings = { ...small(GOLDEN_SCENES.flatSpace), samplesPerAxis: 2 };
    const out = encodeImage(renderImage(s), s);
    // Straight rays: sample the sky along each pixel direction, average, encode the same way.
    const frame = cameraFrame(s.camera, 1);
    const linear = new Float64Array(s.width * s.height * 3);
    const n = s.samplesPerAxis;
    for (let j = 0; j < s.height; j++) {
      for (let i = 0; i < s.width; i++) {
        for (let sy = 0; sy < n; sy++) {
          for (let sx = 0; sx < n; sx++) {
            const d = pixelDirection(
              frame,
              s.width,
              s.height,
              i + (sx + 0.5) / n,
              j + (sy + 0.5) / n,
            );
            const c = skyRadiance(d, 1);
            const p = (j * s.width + i) * 3;
            for (let k = 0; k < 3; k++) {
              linear[p + k] = (linear[p + k] as number) + (c[k] as number) / (n * n);
            }
          }
        }
      }
    }
    const expected = encodeImage(
      {
        width: s.width,
        height: s.height,
        linear,
        stats: { escaped: 0, captured: 0, stepLimit: 0, nonFinite: 0 },
      },
      s,
    );
    expect(Buffer.from(out).equals(Buffer.from(expected))).toBe(true);
  });
});

describe('10. no NaN or Inf in the output', () => {
  it.each([
    ['inclined disk', GOLDEN_SCENES.diskInclined],
    ['camera on the polar axis', GOLDEN_SCENES.diskFaceOn],
    [
      'closest camera, 5 M',
      {
        ...GOLDEN_SCENES.diskInclined,
        camera: {
          ...GOLDEN_SCENES.diskInclined.camera,
          distance: 5,
          fovYDeg: autoFieldOfView(5, 1, 60),
        },
      },
    ],
    [
      'farthest camera, 200 M',
      {
        ...GOLDEN_SCENES.diskInclined,
        camera: { ...GOLDEN_SCENES.diskInclined.camera, distance: 200 },
      },
    ],
  ] as const)('%s', (_n, scene) => {
    const out = renderImage(small(scene));
    expect(out.stats.nonFinite).toBe(0);
    expect(out.stats.stepLimit).toBe(0);
    expect(out.linear.every(Number.isFinite)).toBe(true);
  });
});

describe('6. shadow size measured on the CPU render', () => {
  it.each([5, 10, 30, 100, 200])('r_o = %d M: within 1 px or 0.5 %%, whichever is larger', (ro) => {
    const s = validationScene(ro, 320, 180);
    const out = renderImage(s);
    const m = measureShadowRadius(out, s);
    const exactPx =
      Math.tan(shadowAngularRadius(ro, 1)) /
      ((2 * Math.tan((s.camera.fovYDeg * Math.PI) / 360)) / s.height);
    expect(m.touchesBorder).toBe(false);
    expect(Math.abs(m.radiusPx - exactPx)).toBeLessThanOrEqual(Math.max(1, 0.005 * exactPx));
    expect(Math.abs(m.angularRadius - shadowAngularRadius(ro, 1))).toBeLessThan(
      Math.max(1, 0.005 * exactPx) *
        ((2 * Math.tan((s.camera.fovYDeg * Math.PI) / 360)) / s.height),
    );
  });
});

describe('termination debug view', () => {
  it('colours captured rays black and escaped rays blue, consistent with the counts', () => {
    const s: RenderSettings = { ...validationScene(30, 64, 36), mode: 'termination' };
    const out = renderImage(s);
    let black = 0;
    let blue = 0;
    for (let p = 0; p < s.width * s.height; p++) {
      const [r, g, b] = [
        out.linear[3 * p],
        out.linear[3 * p + 1],
        out.linear[3 * p + 2],
      ] as number[];
      if (r === 0 && g === 0 && b === 0) black++;
      else if ((b as number) > (r as number) && (b as number) > (g as number)) blue++;
    }
    expect(black).toBe(out.stats.captured);
    expect(blue).toBe(out.stats.escaped);
  });
});
