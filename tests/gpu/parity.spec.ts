// GPU against CPU parity (spec section 10, item 11). The GPU (WGSL, f32, d phi = 0.05) is
// compared with the f64 reference library on a fixed ray set. Run with npm run test:gpu.
import { expect, test, type Page } from '@playwright/test';
import { encodeImage, renderImage, type RenderSettings } from '../../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../../src/cpu-renderer/scenes.ts';
import {
  autoFieldOfView,
  cameraFrame,
  criticalImpactParameter,
  deflectionAngleElliptic,
  impactParameterFromLocalAngle,
  luminance,
  pixelDirection,
  skyRadiance,
  STAR_LAYERS,
  starAt,
  traceRay,
  type Vec3,
} from '../../src/physics/index.ts';
import { exactSweptAngle, inwardPsiForImpactParameter } from '../helpers/reference.ts';
import type { HarnessImageRequest, HarnessRay, HarnessRayResult } from './harness-api.ts';

const M = 1;
const BC = criticalImpactParameter(M);
/** 0.25 px at 1080 rows and a 60 degree vertical field of view (target from docs/DESIGN.md). */
const DIRECTION_TOLERANCE = 0.25 * ((60 * Math.PI) / 180 / 1080);
const TERMINATIONS = ['escaped', 'captured', 'stepLimit'] as const;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angle = (a: Vec3, b: Vec3) => {
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...c), dot(a, b));
};

async function openHarness(page: Page) {
  await page.goto('/tests/gpu/harness.html');
  const info = await page.evaluate(() => window.harness!.ready);
  console.log(`GPU: ${info.vendor} ${info.architecture}, fallback ${info.isFallbackAdapter}`);
  expect(info.isFallbackAdapter).toBe(false);
  return info;
}

const trace = (page: Page, rays: HarnessRay[]) =>
  page.evaluate((r) => window.harness!.traceRays(r), rays) as Promise<HarnessRayResult[]>;

/** Pixel-centre rays of cameras at 5, 30 and 200 M over a 64 x 36 grid. */
function cameraRays(): { ray: HarnessRay; b: number }[] {
  const out: { ray: HarnessRay; b: number }[] = [];
  for (const [distance, el] of [
    [5, 20],
    [30, 12],
    [200, -40],
  ] as const) {
    const f = cameraFrame(
      { distance, azimuthDeg: 30, elevationDeg: el, fovYDeg: autoFieldOfView(distance, M, 60) },
      M,
    );
    for (let j = 0; j < 36; j++) {
      for (let i = 0; i < 64; i++) {
        const d = pixelDirection(f, 64, 36, i + 0.5, j + 0.5);
        const psi = Math.acos(Math.max(-1, Math.min(1, dot(d, f.position) / distance)));
        out.push({
          ray: { origin: f.position, direction: d },
          b: impactParameterFromLocalAngle(distance, psi, M),
        });
      }
    }
  }
  return out;
}

test.describe('GPU against CPU parity', () => {
  test('termination reasons and escape directions over 6912 camera rays', async ({ page }) => {
    await openHarness(page);
    const rays = cameraRays();
    const gpu = await trace(
      page,
      rays.map((r) => r.ray),
    );
    let mismatches = 0;
    let stepLimits = 0;
    const errors: number[] = [];
    rays.forEach(({ ray, b }, k) => {
      const g = gpu[k]!;
      const cpu = traceRay(M, ray.origin, ray.direction, { dphi: 0.0125, maxSteps: 4000 });
      if (g.termination === 2) stepLimits++;
      if (Math.abs(b / BC - 1) < 1e-3) return;
      if (TERMINATIONS[g.termination] !== cpu.termination) mismatches++;
      else if (cpu.termination === 'escaped') errors.push(angle(g.direction, cpu.direction!));
    });
    errors.sort((a, b) => a - b);
    const max = errors[errors.length - 1]!;
    console.log(
      `direction error: max ${max.toExponential(2)} rad (${(max / (DIRECTION_TOLERANCE / 0.25)).toFixed(4)} px), ` +
        `p99 ${errors[Math.floor(0.99 * (errors.length - 1))]!.toExponential(2)} rad, ${errors.length} rays`,
    );
    expect(stepLimits).toBe(0);
    expect(mismatches).toBe(0);
    expect(max).toBeLessThan(DIRECTION_TOLERANCE);
  });

  test('deflection from an observer at 1e4 M, b = 1.02 to 100 b_c', async ({ page }) => {
    await openHarness(page);
    const r0 = 1e4;
    const ratios = [1.02, 1.05, 1.1, 1.3, 2, 3, 5, 10, 30, 100];
    const rays = ratios.map((ratio) => {
      const psi = inwardPsiForImpactParameter(r0, ratio * BC, M);
      return { origin: [r0, 0, 0], direction: [Math.cos(psi), Math.sin(psi), 0] } as HarnessRay;
    });
    const gpu = await trace(page, rays);
    let worst = 0;
    ratios.forEach((ratio, k) => {
      const psi = inwardPsiForImpactParameter(r0, ratio * BC, M);
      const rel =
        Math.abs(gpu[k]!.phiEnd - exactSweptAngle(r0, psi, M)) /
        deflectionAngleElliptic(ratio * BC, M);
      worst = Math.max(worst, rel);
    });
    console.log(`deflection relative error: max ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(1e-4);
  });

  test('sky radiance at star centres and random directions', async ({ page }) => {
    await openHarness(page);
    const dirs: Vec3[] = [];
    for (const layer of STAR_LAYERS) {
      for (let a = -12; a <= 12; a++) {
        for (let b = -12; b <= 12; b++) {
          const star = starAt(layer, [layer.cellsPerUnit, a, b]);
          if (star) dirs.push(star.direction);
        }
      }
    }
    expect(dirs.length).toBeGreaterThan(50);
    for (const g of [1, 1.29]) {
      const gpu = await page.evaluate(([d, gg]) => window.harness!.skyRadiance(d, gg), [
        dirs,
        g,
      ] as const);
      let worst = 0;
      dirs.forEach((d, k) => {
        const cpu = skyRadiance(d, g);
        const scale = Math.max(1e-3, luminance(cpu));
        for (let c = 0; c < 3; c++)
          worst = Math.max(worst, Math.abs(gpu[k]![c]! - cpu[c]!) / scale);
      });
      console.log(
        `sky radiance, g = ${g}: worst relative difference ${worst.toExponential(2)} over ${dirs.length} star centres`,
      );
      expect(worst).toBeLessThan(1e-2);
    }
  });

  test('rendered image against the CPU reference (no disk, 160 x 90, one sample per pixel)', async ({
    page,
  }) => {
    await openHarness(page);
    for (const [label, sky] of [
      ['uniform sky', 'uniform'],
      ['star field', 'stars'],
    ] as const) {
      const s: RenderSettings = {
        ...GOLDEN_SCENES.noDisk,
        sky,
        samplesPerAxis: 1,
        toneMapping: true,
      };
      const request: HarnessImageRequest = {
        width: s.width,
        height: s.height,
        camera: s.camera,
        mode: 'colour',
        sky,
        exposure: s.exposure,
        toneMapping: s.toneMapping,
      };
      const gpu = await page.evaluate((r) => window.harness!.renderImage(r), request);
      const cpu = encodeImage(renderImage(s), s);
      let over2 = 0;
      let maxDiff = 0;
      for (let k = 0; k < cpu.length; k++) {
        const d = Math.abs(gpu[k]! - cpu[k]!);
        if (d > 2) over2++;
        maxDiff = Math.max(maxDiff, d);
      }
      console.log(
        `${label}: max channel difference ${maxDiff}, ${over2} of ${cpu.length} channels differ by more than 2`,
      );
      expect(over2 / cpu.length).toBeLessThan(5e-3);
    }
  });
});
