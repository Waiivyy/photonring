// The EHT-style view on the GPU against the CPU reference (docs/PHYSICS.md, section 10d): the
// brightness per crossing in f32, the linear image, the post-process passes, the final image end
// to end, a preview against the full image, and that presenting leaves the interactive images
// untouched. Run with npm run test:gpu.
import { expect, test, type Page } from '@playwright/test';
import { ehtIntensity, renderImage, type RenderSettings } from '../../src/cpu-renderer/render.ts';
import { DEFAULT_DISK } from '../../src/cpu-renderer/scenes.ts';
import { colourMapTable, ehtPlan, postProcessEht } from '../../src/gpu/host/eht-post.ts';
import {
  cameraFrame,
  compositeDiskBolometric,
  ehtFieldOfView,
  M87_SKY_ROLL_DEG,
  pixelDirection,
  staticObserverFactor,
  traceRay,
  type CameraParams,
  type DiskSettings,
} from '../../src/physics/index.ts';
import type { HarnessImageRequest, HarnessRay } from './harness-api.ts';
import { openHarness } from './page.ts';

const M = 1;

const camera = (distance: number, elevationDeg: number, aspect: number): CameraParams => ({
  distance,
  azimuthDeg: 0,
  elevationDeg,
  fovYDeg: ehtFieldOfView(distance, aspect),
  rollDeg: M87_SKY_ROLL_DEG,
});
const CAMERAS: Record<string, (aspect: number) => CameraParams> = {
  preset: (a) => camera(200, -73, a),
  'default camera, 30 M': (a) => camera(30, 12, a),
  'close, 5 M': (a) => camera(5, 20, a),
};

function request(
  cam: CameraParams,
  width: number,
  height: number,
  antialias = false,
): HarnessImageRequest {
  return {
    width,
    height,
    camera: cam,
    mode: 'eht',
    sky: 'black',
    exposure: 1,
    toneMapping: false,
    disk: DEFAULT_DISK,
    antialias,
  };
}

function cpuSettings(cam: CameraParams, width: number, height: number): RenderSettings {
  return {
    width,
    height,
    M,
    camera: cam,
    disk: DEFAULT_DISK,
    sky: 'black',
    mode: 'eht',
    samplesPerAxis: 1,
    dphi: 0.0125,
    maxSteps: 4000,
    exposure: 1,
    toneMapping: false,
  };
}

const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));
const floats = (b64: string) => {
  const b = bytes(b64);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};

async function renderEht(page: Page, req: HarnessImageRequest, previewScale?: number) {
  const out = await page.evaluate(([r, s]) => window.harness!.renderEht(r, s), [
    req,
    previewScale,
  ] as const);
  return {
    rgb: bytes(out.rgb),
    linear: floats(out.linear),
    peak: out.peak,
    untouched: out.untouched,
  };
}

function maxDiff(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i]! - b[i]!));
  return d;
}

test.describe('EHT-style view on the GPU', () => {
  test('brightness per crossing: f32 against compositeDiskBolometric on the same radii', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const disk: DiskSettings = { ...DEFAULT_DISK, opacity: 0.6 };
    let worst = 0;
    let compared = 0;
    for (const [name, make] of Object.entries(CAMERAS)) {
      const cam = make(16 / 9);
      const f = cameraFrame(cam, M);
      const rays: HarnessRay[] = [];
      for (let j = 0; j < 36; j++) {
        for (let i = 0; i < 64; i++) {
          rays.push({ origin: f.position, direction: pixelDirection(f, 64, 36, i + 0.5, j + 0.5) });
        }
      }
      const gpu = await page.evaluate(([r, d]) => window.harness!.traceRays(r, d, 'eht'), [
        rays,
        disk,
      ] as const);
      const gObs = staticObserverFactor(cam.distance, M);
      let peak = 0;
      const pairs: [number, number][] = [];
      gpu.forEach((g, k) => {
        if (g.crossings > g.radii.length) return; // light of crossings beyond the log is unknown
        const ray = rays[k]!;
        const lz = traceRay(M, ray.origin, ray.direction, { dphi: 0.05, maxSteps: 1 }).lzOverE;
        const cpu = compositeDiskBolometric(disk, g.radii, lz, M, gObs).intensity;
        expect(g.emission[1]).toBe(g.emission[0]);
        pairs.push([g.emission[0], cpu]);
        peak = Math.max(peak, cpu);
      });
      let local = 0;
      for (const [g, c] of pairs) {
        if (c < 1e-3 * peak) continue;
        local = Math.max(local, Math.abs(g / c - 1));
        compared++;
      }
      console.log(`${name}: largest relative difference ${local.toExponential(2)}`);
      worst = Math.max(worst, local);
    }
    console.log(`brightness per crossing: ${compared} rays, largest ${worst.toExponential(2)}`);
    expect(compared).toBeGreaterThan(1000);
    // f32 rounding of g and T-hat, raised to the fourth power: measured 1.7e-5 on the Apple M5.
    expect(worst).toBeLessThan(1e-4);
  });

  test('linear image against the CPU reference', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const W = 160;
    const H = 90;
    for (const [name, make] of Object.entries(CAMERAS)) {
      const cam = make(W / H);
      const gpu = (await renderEht(page, request(cam, W, H))).linear;
      const cpu = ehtIntensity(renderImage(cpuSettings(cam, W, H)));
      const peak = Math.max(...cpu);
      const diffs = [...gpu].map((v, i) => Math.abs(v - cpu[i]!) / peak).sort((a, b) => b - a);
      const over = (t: number) => diffs.filter((d) => d > t).length;
      console.log(
        `${name}: largest ${diffs[0]!.toExponential(2)} of the peak, then ${diffs[5]!.toExponential(2)} (6th), ` +
          `${diffs[Math.floor(W * H * 0.005)]!.toExponential(2)} at 0.5 %; over 1e-2: ${over(1e-2)}, over 1e-3: ${over(1e-3)} of ${W * H}`,
      );
      // The first pass is stored as rgba16float, which rounds to 2^-11 (4.9e-4) of the value;
      // 2e-3 of the peak is four times that. Rays on either side of a disk or band edge can differ
      // more, so 0.5 % of the pixels may (the image parity allowance of docs/VALIDATION.md, item
      // 11). Measured on the Apple M5: no pixel over 7.1e-4.
      expect(over(2e-3), name).toBeLessThanOrEqual(0.005 * W * H);
      expect(over(5e-2), name).toBe(0);
    }
  });

  for (const [W, H] of [
    [960, 540],
    [1920, 1080],
  ] as const) {
    test(`post-process at ${W} x ${H}: the GPU passes against the CPU reference on the same linear image`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openHarness(page);
      for (const name of ['preset', 'default camera, 30 M']) {
        const cam = CAMERAS[name]!(W / H);
        const out = await renderEht(page, request(cam, W, H));
        const plan = ehtPlan(cam, W, H, M);
        const cpu = postProcessEht(out.linear, W, H, plan, colourMapTable());
        const d = maxDiff(out.rgb, cpu);
        console.log(`${name} ${W}x${H}: reduce ${plan.f}, largest channel difference ${d} levels`);
        expect(out.untouched).toBe(true);
        expect(d).toBeLessThanOrEqual(1);
      }
    });
  }

  test('end to end at 960 x 540: GPU final image against the CPU final image', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const W = 960;
    const H = 540;
    const cam = CAMERAS.preset!(W / H);
    const gpu = (await renderEht(page, request(cam, W, H))).rgb;
    const s = cpuSettings(cam, W, H);
    const cpu = postProcessEht(
      ehtIntensity(renderImage(s)),
      W,
      H,
      ehtPlan(cam, W, H, M),
      colourMapTable(),
    );
    let over = 0;
    for (let i = 0; i < gpu.length; i++) if (Math.abs(gpu[i]! - cpu[i]!) > 2) over++;
    console.log(
      `end to end: ${over} of ${gpu.length} channels more than 2 levels off, largest ${maxDiff(gpu, cpu)}`,
    );
    expect(over).toBeLessThanOrEqual(0.005 * gpu.length);
  });

  test('a half-resolution preview presents like the full image', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const W = 1920;
    const H = 1080;
    const cam = CAMERAS.preset!(W / H);
    const full = await renderEht(page, request(cam, W, H));
    const preview = await renderEht(page, request(cam, W, H), 0.5);
    let sum = 0;
    for (let i = 0; i < full.rgb.length; i++) sum += Math.abs(full.rgb[i]! - preview.rgb[i]!);
    const mean = sum / full.rgb.length;
    const ratio = preview.peak / full.peak;
    console.log(
      `preview against full: mean ${mean.toFixed(3)} levels, largest ${maxDiff(full.rgb, preview.rgb)}, peak ratio ${ratio.toFixed(5)}`,
    );
    expect(preview.untouched).toBe(true);
    expect(mean).toBeLessThanOrEqual(2);
    expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(0.01);
  });

  test('anti-aliasing changes the presented image little (logged)', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const W = 960;
    const H = 540;
    const cam = CAMERAS['default camera, 30 M']!(W / H);
    const off = await renderEht(page, request(cam, W, H, false));
    const on = await renderEht(page, request(cam, W, H, true));
    let sum = 0;
    for (let i = 0; i < off.rgb.length; i++) sum += Math.abs(off.rgb[i]! - on.rgb[i]!);
    console.log(
      `anti-aliasing on against off: largest ${maxDiff(off.rgb, on.rgb)} levels, mean ${(sum / off.rgb.length).toFixed(3)}`,
    );
    expect(on.untouched).toBe(true);
  });
});
