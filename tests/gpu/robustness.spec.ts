// Numerical robustness on the GPU (spec section 10, item 10): no NaN or Inf in the readback for
// rays through the exact centre, along the polar axis, and from cameras at both distance limits,
// with and without the disk. Mirrors the CPU cases in tests/unit/raytrace.test.ts through the
// shipped WGSL. Run with npm run test:gpu.
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_DISK } from '../../src/cpu-renderer/scenes.ts';
import {
  autoFieldOfView,
  cameraFrame,
  pixelDirection,
  type DiskSettings,
  type Vec3,
} from '../../src/physics/index.ts';
import type { HarnessRay, HarnessRayResult } from './harness-api.ts';
import { openHarness } from './page.ts';

const M = 1;
const ESCAPED = 0;
const CAPTURED = 1;
const STEP_LIMIT = 2;

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** One call per set: all rays of a set start at the same distance, as the harness requires. */
const trace = (page: Page, rays: HarnessRay[], disk: DiskSettings | null) =>
  page.evaluate(([r, d]) => window.harness!.traceRays(r, d), [rays, disk] as const);

function finite(r: HarnessRayResult): boolean {
  return [...r.direction, r.phiEnd, ...r.emission, r.transmittance, ...r.radii].every((x) =>
    Number.isFinite(x),
  );
}

const atHoleOrigin: Vec3 = [10, -20, 15];
const atHole: HarnessRay[] = [
  { origin: atHoleOrigin, direction: unit([-10, 20, -15]) },
  { origin: atHoleOrigin, direction: unit(atHoleOrigin) },
];

// From a camera on the polar axis: straight up and down, and tilted by 1e-12, by the shader's
// radial threshold (1e-6) and by 1e-5.
const axis: Vec3 = [0, 0, 30];
const polar: HarnessRay[] = [
  { origin: axis, direction: [0, 0, 1] },
  { origin: axis, direction: [0, 0, -1] },
  ...[1e-12, 1e-6, 1e-5].flatMap((t) => [
    { origin: axis, direction: [t, 0, Math.sqrt(1 - t * t)] as Vec3 },
    { origin: axis, direction: [t, 0, -Math.sqrt(1 - t * t)] as Vec3 },
  ]),
];

/** Pixel-corner and pixel-edge rays over a 20 x 12 image, including the exact centre. */
function cameraGrid(distance: number, elevationDeg: number): HarnessRay[] {
  const f = cameraFrame({
    distance,
    azimuthDeg: 0,
    elevationDeg,
    fovYDeg: autoFieldOfView(distance, M, 60),
  });
  const rays: HarnessRay[] = [];
  for (let j = 0; j <= 12; j++) {
    for (let i = 0; i <= 20; i++) {
      rays.push({ origin: f.position, direction: pixelDirection(f, 20, 12, i, j) });
    }
  }
  return rays;
}

test('every GPU result stays finite at the hole, on the polar axis and at both distance limits', async ({
  page,
}) => {
  await openHarness(page);
  const sets: [string, HarnessRay[]][] = [
    ['at the hole', atHole],
    ['polar axis', polar],
  ];
  for (const distance of [5, 200]) {
    for (const el of [20, 90, -90])
      sets.push([`${distance} M, ${el} deg`, cameraGrid(distance, el)]);
  }
  let checked = 0;
  for (const disk of [DEFAULT_DISK, null]) {
    for (const [name, rays] of sets) {
      const results = await trace(page, rays, disk);
      results.forEach((r, i) => {
        const where = `${name}, ray ${i}, ${disk ? 'disk' : 'no disk'}`;
        expect(r.termination, where).not.toBe(STEP_LIMIT);
        expect(finite(r), where).toBe(true);
      });
      checked += results.length;
      if (name === 'at the hole') {
        expect(results[0]!.termination).toBe(CAPTURED);
        expect(results[0]!.crossings).toBe(0);
      }
      if (name === 'polar axis') {
        expect(results[0]!.termination).toBe(ESCAPED);
        expect(results[1]!.termination).toBe(CAPTURED);
      }
    }
  }
  console.log(`${checked} GPU results finite, none at the step limit`);
});
