// GPU against CPU parity with the accretion disk (spec section 10, items 7 and 11): plane
// crossings, disk light per ray and rendered images, WGSL in f32 against the f64 library.
// Run with npm run test:gpu.
import { expect, test, type Page } from '@playwright/test';
import { encodeImage, renderImage, type RenderSettings } from '../../src/cpu-renderer/render.ts';
import { DEFAULT_DISK, GOLDEN_SCENES } from '../../src/cpu-renderer/scenes.ts';
import {
  autoFieldOfView,
  cameraFrame,
  compositeDisk,
  criticalImpactParameter,
  impactParameterFromLocalAngle,
  luminance,
  pixelDirection,
  staticObserverFactor,
  traceRay,
  type CameraParams,
  type DiskSettings,
  type Vec3,
} from '../../src/physics/index.ts';
import type { HarnessImageRequest, HarnessRay } from './harness-api.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const TERMINATIONS = ['escaped', 'captured', 'stepLimit'] as const;
/** Translucent, so that every crossing inside the disk contributes to the light. */
const DISK: DiskSettings = { ...DEFAULT_DISK, opacity: 0.6 };

const CAMERAS: Record<string, CameraParams> = {
  'inclined, 30 M': { distance: 30, azimuthDeg: 30, elevationDeg: 12, fovYDeg: 60 },
  'nearly face-on, 30 M': { distance: 30, azimuthDeg: 0, elevationDeg: 80, fovYDeg: 60 },
  'nearly edge-on, 30 M': { distance: 30, azimuthDeg: 0, elevationDeg: 1, fovYDeg: 60 },
  'in the disk plane, 30 M': { distance: 30, azimuthDeg: 0, elevationDeg: 0, fovYDeg: 60 },
  'close, 5 M': {
    distance: 5,
    azimuthDeg: 0,
    elevationDeg: 20,
    fovYDeg: autoFieldOfView(5, M, 60),
  },
  'far and narrow, 100 M': { distance: 100, azimuthDeg: 0, elevationDeg: 30, fovYDeg: 25 },
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

async function openHarness(page: Page) {
  await page.goto('/tests/gpu/harness.html');
  const info = await page.evaluate(() => window.harness!.ready);
  expect(info.isFallbackAdapter).toBe(false);
}

test.describe('GPU against CPU parity with the disk', () => {
  test('plane crossings and disk light per ray', async ({ page }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    for (const [name, camera] of Object.entries(CAMERAS)) {
      const f = cameraFrame(camera, M);
      const gObserver = staticObserverFactor(camera.distance, M);
      const rays: { ray: HarnessRay; b: number }[] = [];
      for (let j = 0; j < 36; j++) {
        for (let i = 0; i < 64; i++) {
          const d = pixelDirection(f, 64, 36, i + 0.5, j + 0.5);
          const psi = Math.acos(Math.max(-1, Math.min(1, dot(d, f.position) / camera.distance)));
          rays.push({
            ray: { origin: f.position, direction: d },
            b: impactParameterFromLocalAngle(camera.distance, psi, M),
          });
        }
      }
      const gpu = await page.evaluate(([r, disk]) => window.harness!.traceRays(r, disk), [
        rays.map((r) => r.ray),
        DISK,
      ] as const);

      let compared = 0;
      let terminationMismatches = 0;
      let countMismatches = 0;
      let crossingsSeen = 0;
      let worstRadius = 0;
      let worstLight = 0;
      let worstTransmittance = 0;
      rays.forEach(({ ray, b }, k) => {
        if (Math.abs(b / BC - 1) < 1e-3) return;
        const g = gpu[k]!;
        const cpu = traceRay(M, ray.origin, ray.direction, { dphi: 0.0125, maxSteps: 4000 });
        compared++;
        if (TERMINATIONS[g.termination] !== cpu.termination) terminationMismatches++;
        if (g.crossings !== cpu.crossings.length) {
          countMismatches++;
          return;
        }
        crossingsSeen += g.crossings;
        const radii = cpu.crossings.map((c) => c.radius);
        g.radii.forEach((r, n) => {
          worstRadius = Math.max(worstRadius, Math.abs(r - radii[n]!) / radii[n]!);
        });
        // A crossing this close to an edge may land on either side of it in f32.
        const nearEdge = radii.some(
          (r) => Math.abs(r / DISK.rIn - 1) < 1e-4 || Math.abs(r / DISK.rOut - 1) < 1e-4,
        );
        if (nearEdge) return;
        const ref = compositeDisk(DISK, radii, cpu.lzOverE, M, gObserver);
        const scale = Math.max(1e-3, luminance(ref.emission));
        for (let c = 0; c < 3; c++) {
          worstLight = Math.max(worstLight, Math.abs(g.emission[c]! - ref.emission[c]!) / scale);
        }
        worstTransmittance = Math.max(
          worstTransmittance,
          Math.abs(g.transmittance - ref.transmittance),
        );
      });
      console.log(
        `${name}: ${compared} rays, ${crossingsSeen} crossings; count mismatches ${countMismatches}, ` +
          `radius ${worstRadius.toExponential(2)}, light ${worstLight.toExponential(2)}, ` +
          `transmittance ${worstTransmittance.toExponential(2)}`,
      );
      expect(terminationMismatches, name).toBe(0);
      expect(countMismatches, name).toBe(0);
      expect(crossingsSeen, name).toBeGreaterThan(0);
      expect(worstRadius, name).toBeLessThan(1e-4);
      expect(worstLight, name).toBeLessThan(1e-2);
      expect(worstTransmittance, name).toBeLessThan(1e-5);
    }
  });

  test('rendered images against the CPU reference (160 x 90, one sample per pixel)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openHarness(page);
    const one = { samplesPerAxis: 1 };
    const inclined: RenderSettings = { ...GOLDEN_SCENES.diskInclined, ...one };
    const cases: [string, RenderSettings][] = [
      ['inclined disk', inclined],
      ['face-on disk', { ...GOLDEN_SCENES.diskFaceOn, ...one }],
      [
        'camera in the disk plane',
        { ...inclined, camera: { ...inclined.camera, elevationDeg: 0 } },
      ],
      ['close view at 5 M', { ...inclined, camera: CAMERAS['close, 5 M']! }],
      ['translucent disk (opacity 0.6)', { ...inclined, disk: DISK }],
      ['termination view with the disk', { ...inclined, mode: 'termination' }],
    ];
    for (const [label, s] of cases) {
      const request: HarnessImageRequest = {
        width: s.width,
        height: s.height,
        camera: s.camera,
        mode: s.mode,
        sky: s.sky,
        exposure: s.exposure,
        toneMapping: s.toneMapping,
        disk: s.disk,
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
      expect(over2 / cpu.length, label).toBeLessThan(5e-3);
    }
  });
});
