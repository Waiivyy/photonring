// The ISCO overlay against the shipped WGSL (Stage 4): the f64 curves must lie on the edge of the
// disk the f32 GPU tracer renders. For on-screen vertices of the direct (n = 0) and secondary
// (n = 1) images, the GPU crossing radius 0.05 px inside and outside along the image radius must
// bracket 6M (measured: 0.01 px holds in every view). Far off screen, at view angles near 89
// degrees, the gnomonic projection magnifies f32 direction rounding to most of a pixel, so those
// vertices are not checked. Run with npm run test:gpu.
import { expect, test } from '@playwright/test';
import { DEFAULT_DISK } from '../../src/cpu-renderer/scenes.ts';
import {
  autoFieldOfView,
  cameraFrame,
  type DiskSettings,
  type Vec3,
} from '../../src/physics/index.ts';
import { ringCurve, type TanPoint } from '../../src/ui/overlay-geometry.ts';
import type { HarnessRay } from './harness-api.ts';
import { openHarness } from './page.ts';

const M = 1;
const H = 1080;
/** Bracket half-width in pixels at 1080 rows. */
const PX = 0.05;
const ASPECT = 16 / 9;
/**
 * Crossings are logged only while a disk is set; the parity entry point never stops at an opaque
 * crossing, and the radius is logged before the disk's range check, so any disk works.
 */
const DISK: DiskSettings = { ...DEFAULT_DISK, opacity: 0.6 };

const VIEWS = [
  { name: '30 M, elevation 12', distance: 30, azimuthDeg: 0, elevationDeg: 12 },
  { name: '30 M, face-on', distance: 30, azimuthDeg: 0, elevationDeg: 90 },
  { name: '30 M, elevation 2', distance: 30, azimuthDeg: 0, elevationDeg: 2 },
  { name: '5 M, elevation 20', distance: 5, azimuthDeg: 0, elevationDeg: 20 },
  { name: '200 M, elevation 12', distance: 200, azimuthDeg: 0, elevationDeg: 12 },
];

test('on-screen ISCO overlay vertices lie within 0.05 px of the GPU disk edge', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openHarness(page);
  for (const v of VIEWS) {
    const camera = { ...v, fovYDeg: autoFieldOfView(v.distance, M, 60) };
    const f = cameraFrame(camera, M);
    const t = f.tanHalfFovY;
    const direction = ([sx, sy]: TanPoint): Vec3 => {
      const d: Vec3 = [
        f.forward[0] + sx * f.right[0] + sy * f.up[0],
        f.forward[1] + sx * f.right[1] + sy * f.up[1],
        f.forward[2] + sx * f.right[2] + sy * f.up[2],
      ];
      const n = Math.hypot(...d);
      return [d[0] / n, d[1] / n, d[2] / n];
    };
    for (const order of [0, 1] as const) {
      const curve = ringCurve({
        rObs: v.distance,
        elevationDeg: v.elevationDeg,
        R: 6,
        order,
        tanHalfFovY: t,
        aspect: ASPECT,
      });
      const onScreen = (p: TanPoint) => Math.abs(p[0]) <= ASPECT * t && Math.abs(p[1]) <= t;
      const points = curve.segments.flat().filter((p, i) => i % 4 === 0 && onScreen(p));
      const rays: HarnessRay[] = [];
      for (const p of points) {
        const rho = Math.hypot(p[0], p[1]);
        for (const px of [-PX, PX]) {
          const k = (rho + (px * 2 * t) / H) / rho;
          rays.push({ origin: f.position, direction: direction([p[0] * k, p[1] * k]) });
        }
      }
      const gpu = await page.evaluate(([r, disk]) => window.harness!.traceRays(r, disk), [
        rays,
        DISK,
      ] as const);
      // Radius of crossing n, or 0 below (captured first) and Infinity above (escaped first).
      const radius = (i: number) => {
        const g = gpu[i]!;
        if (g.crossings > order) return g.radii[order]!;
        return g.termination === 1 ? 0 : Infinity;
      };
      let checked = 0;
      for (let i = 0; i < points.length; i++) {
        const where = `${v.name}, n = ${order}, on-screen vertex ${i}`;
        expect(radius(2 * i), where).toBeLessThan(6);
        expect(radius(2 * i + 1), where).toBeGreaterThan(6);
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
      console.log(`${v.name}, n = ${order}: ${checked} vertices bracketed`);
    }
  }
});
