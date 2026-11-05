// Photon subrings measured with the shipped WGSL tracer (f32): fans of rays across the inner and
// outer edge of the subrings n = 1, 2 and 3 of the default disk, at 5, 30 and 200 M. The order of
// a ray is the index of its first disk-plane crossing inside the disk; where it flips is the
// measured edge, compared with the 64-bit library (docs/PHYSICS.md, section 6b). The f64
// reference for each ray is computed from the f32 values the GPU receives. Run with
// npm run test:gpu.
import { expect, test } from '@playwright/test';
import { DEFAULT_DISK } from '../../src/cpu-renderer/scenes.ts';
import {
  cameraFrame,
  criticalImpactParameter,
  firstPlaneCrossingAngle,
  shadowAngularRadius,
  subringOffset,
  traceRay,
  type Vec3,
} from '../../src/physics/index.ts';
import type { HarnessRay, HarnessRayResult } from './harness-api.ts';
import { openHarness } from './page.ts';

const M = 1;
const BC = criticalImpactParameter(M);
const DISK = DEFAULT_DISK;
const ORDERS = [1, 2, 3] as const;
const EDGES = [DISK.rIn, DISK.rOut] as const;
const DISTANCES = [5, 30, 200] as const;
const VIEWS = [
  { name: 'face-on', el: 90, theta: 0 },
  { name: 'elevation 12, image top', el: 12, theta: 90 },
  { name: 'elevation 12, image right', el: 12, theta: 0 },
] as const;
/** Rays in each of the two fans across an edge. */
const RAYS_PER_FAN = 201;
const NONE = -1;
const STEP_LIMIT = 2;

/**
 * Tolerance in eps = b/b_c - 1. The shader gets sin(psi) as the length of d - cos(psi) e1, a
 * difference of numbers of order 1; without fused multiply-adds its absolute error is a few
 * times 2^-24, and its relative error that divided by sin(psi_sh). The tolerance is four times
 * that bound, so it holds on GPUs that round each operation; the bands actually measured on the
 * Apple M5 are logged and are much smaller.
 */
function tolerance(rObs: number): number {
  return (4 * 2 ** -24) / Math.sin(shadowAngularRadius(rObs, M));
}

const f32 = (v: Vec3): Vec3 => [Math.fround(v[0]), Math.fround(v[1]), Math.fround(v[2])];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Fan {
  readonly view: string;
  readonly n: number;
  readonly R: number;
  /** f64 edge for this fan's ray plane. */
  readonly edge: number;
  /** Half-width of the wide fan: ten tolerances, or less where the next band edge is near. */
  readonly halfWidth: number;
  /** Whether rays above the edge (larger eps) have order n. */
  readonly insideAbove: boolean;
  /** The wide fan extends at least two tolerances each side, so the test can assert on it. */
  readonly resolved: boolean;
  /** The wide fan's rays, then the fine fan's (one tolerance each side, centred on the edge). */
  readonly rays: HarnessRay[];
  /** eps of each ray as the GPU receives it, evaluated in f64. */
  readonly eps: number[];
}

/** Index of the first crossing radius inside the disk, or NONE. */
const orderOf = (radii: readonly number[]): number =>
  radii.findIndex((r) => r >= DISK.rIn && r <= DISK.rOut);

function buildFans(rObs: number): Fan[] {
  const k = Math.sqrt(1 - (2 * M) / rObs) / rObs;
  const tol = tolerance(rObs);
  const fans: Fan[] = [];
  for (const view of VIEWS) {
    const f = cameraFrame({ distance: rObs, azimuthDeg: 0, elevationDeg: view.el, fovYDeg: 60 }, M);
    const t = (view.theta * Math.PI) / 180;
    const e2: Vec3 = [
      Math.cos(t) * f.right[0] + Math.sin(t) * f.up[0],
      Math.cos(t) * f.right[1] + Math.sin(t) * f.up[1],
      Math.cos(t) * f.right[2] + Math.sin(t) * f.up[2],
    ];
    const origin = f32(f.position);
    const r0 = Math.hypot(...origin);
    const e1: Vec3 = [origin[0] / r0, origin[1] / r0, origin[2] / r0];
    const phi0 = firstPlaneCrossingAngle(e1[2], e2[2]);
    if (phi0 === undefined) throw new Error('ray plane is the disk plane');
    const ray = (target: number) => {
      const s = k * BC * (1 + target);
      const c = Math.sqrt(1 - s * s);
      const d = f32([
        c * f.forward[0] + s * e2[0],
        c * f.forward[1] + s * e2[1],
        c * f.forward[2] + s * e2[2],
      ]);
      // The shader's impact parameter for exactly these f32 inputs, evaluated in f64.
      const cosPsi = dot(d, e1);
      const tangential = Math.hypot(
        d[0] - cosPsi * e1[0],
        d[1] - cosPsi * e1[1],
        d[2] - cosPsi * e1[2],
      );
      const b = (r0 * tangential) / Math.sqrt(1 - (2 * M) / r0);
      return { ray: { origin, direction: d }, eps: b / BC - 1 };
    };
    for (const n of ORDERS) {
      const inner = subringOffset(rObs, DISK.rIn, n, phi0, M);
      // Keep the wide fan clear of the neighbouring band edges (at least 0.9 inner edges away).
      const halfWidth = Math.min(10 * tol, 0.4 * inner);
      for (const R of EDGES) {
        const edge = subringOffset(rObs, R, n, phi0, M);
        const made = [halfWidth, Math.min(tol, halfWidth)].flatMap((w) =>
          Array.from({ length: RAYS_PER_FAN }, (_, i) =>
            ray(edge + w * ((2 * i) / (RAYS_PER_FAN - 1) - 1)),
          ),
        );
        fans.push({
          view: view.name,
          n,
          R,
          edge,
          halfWidth,
          insideAbove: R === DISK.rIn,
          resolved: halfWidth >= 2 * tol,
          rays: made.map((m) => m.ray),
          eps: made.map((m) => m.eps),
        });
      }
    }
  }
  return fans;
}

/**
 * Whether the f64 library sees this fan's band at all: rays a fan half-width inside and outside
 * the edge, traced in f64, must have order n and none. With the opaque disk an earlier crossing
 * can land on the disk first (the near side covers part of the lower half of a tilted view).
 */
function visibleInF64(fan: Fan, rObs: number): boolean {
  const k = Math.sqrt(1 - (2 * M) / rObs) / rObs;
  const origin = fan.rays[0]!.origin;
  const r0 = Math.hypot(...origin);
  const e1: Vec3 = [origin[0] / r0, origin[1] / r0, origin[2] / r0];
  const first = fan.rays[0]!.direction;
  const along = dot(first, e1);
  const t: Vec3 = [first[0] - along * e1[0], first[1] - along * e1[1], first[2] - along * e1[2]];
  const tn = Math.hypot(...t);
  const e2: Vec3 = [t[0] / tn, t[1] / tn, t[2] / tn];
  const orderAt = (eps: number) => {
    const s = k * BC * (1 + eps);
    const c = Math.sqrt(1 - s * s);
    const d: Vec3 = [-c * e1[0] + s * e2[0], -c * e1[1] + s * e2[1], -c * e1[2] + s * e2[2]];
    const n = Math.hypot(...d);
    const res = traceRay(M, origin, [d[0] / n, d[1] / n, d[2] / n], {
      dphi: 0.002,
      maxSteps: 100_000,
    });
    return orderOf(res.crossings.map((x) => x.radius));
  };
  const sign = fan.insideAbove ? 1 : -1;
  return (
    orderAt(fan.edge + sign * fan.halfWidth) === fan.n &&
    orderAt(fan.edge - sign * fan.halfWidth) === NONE
  );
}

test.describe('photon subrings measured on the GPU', () => {
  for (const rObs of DISTANCES) {
    test(`subring edges n = 1 to 3 at ${rObs} M`, async ({ page }) => {
      test.setTimeout(300_000);
      const info = await openHarness(page);
      const fans = buildFans(rObs);
      // One call per view: each view's f32 origin has its own rounded distance.
      const results: HarnessRayResult[] = [];
      for (const view of VIEWS) {
        const rays = fans.filter((fan) => fan.view === view.name).flatMap((fan) => fan.rays);
        results.push(
          ...(await page.evaluate(([r, d]) => window.harness!.traceRays(r, d), [
            rays,
            DISK,
          ] as const)),
        );
      }
      const perFan = 2 * RAYS_PER_FAN;
      expect(results).toHaveLength(fans.length * perFan);
      const tol = tolerance(rObs);
      const edges = new Map<string, number>();
      let worstBand = 0;
      let stepLimits = 0;
      console.log(
        `${rObs} M on ${info.vendor} ${info.architecture}: tolerance ${tol.toExponential(2)}`,
      );

      fans.forEach((fan, f) => {
        const out = results.slice(f * perFan, (f + 1) * perFan);
        stepLimits += out.filter((r) => r.termination === STEP_LIMIT).length;
        const label = `${rObs} M, ${fan.view}, n = ${fan.n}, R = ${fan.R} M`;
        if (!visibleInF64(fan, rObs)) {
          console.log(`${label}: hidden by an earlier crossing in f64, not compared`);
          return;
        }
        let band = 0;
        let lowestInside = Infinity;
        let highestInside = -Infinity;
        let lowestOutside = Infinity;
        let highestOutside = -Infinity;
        out.forEach((r, i) => {
          const eps = fan.eps[i]!;
          const expected = eps > fan.edge === fan.insideAbove ? fan.n : NONE;
          const got = orderOf(r.radii);
          if (got !== expected) band = Math.max(band, Math.abs(eps - fan.edge));
          if (got === fan.n) {
            lowestInside = Math.min(lowestInside, eps);
            highestInside = Math.max(highestInside, eps);
          } else {
            lowestOutside = Math.min(lowestOutside, eps);
            highestOutside = Math.max(highestOutside, eps);
          }
        });
        const measuredEdge = fan.insideAbove
          ? (lowestInside + highestOutside) / 2
          : (highestInside + lowestOutside) / 2;
        console.log(
          `${label}: f64 edge ${fan.edge.toExponential(6)}, GPU edge ` +
            `${measuredEdge.toExponential(6)}, mismatch band ${band.toExponential(2)}` +
            `${fan.resolved ? '' : ' (fan narrower than two tolerances: logged only)'}`,
        );
        if (!fan.resolved) return;
        worstBand = Math.max(worstBand, band);
        expect(band, `${label}: rays beyond the tolerance have the f64 order`).toBeLessThanOrEqual(
          tol,
        );
        edges.set(`${fan.view}|${fan.R}|${fan.n}`, measuredEdge);
      });
      expect(stepLimits).toBe(0);
      console.log(`${rObs} M: largest mismatch band ${worstBand.toExponential(2)}`);

      // Successive measured edges against e^pi, where both edges were resolved.
      for (const view of VIEWS) {
        for (const R of EDGES) {
          for (const n of [1, 2]) {
            const a = edges.get(`${view.name}|${R}|${n}`);
            const b = edges.get(`${view.name}|${R}|${n + 1}`);
            if (a === undefined || b === undefined) continue;
            const fanA = fans.find((x) => x.view === view.name && x.R === R && x.n === n)!;
            const fanB = fans.find((x) => x.view === view.name && x.R === R && x.n === n + 1)!;
            const exact = fanA.edge / fanB.edge;
            const gpu = a / b;
            console.log(
              `${rObs} M, ${view.name}, R = ${R} M: n = ${n} to ${n + 1} ratio GPU ` +
                `${gpu.toFixed(4)}, f64 ${exact.toFixed(4)}, e^pi ${Math.exp(Math.PI).toFixed(4)}`,
            );
            // Each measured edge lies within the tolerance of its f64 edge.
            expect(Math.abs(gpu / exact - 1)).toBeLessThanOrEqual(
              tol * (1 / fanA.edge + 1 / fanB.edge),
            );
          }
        }
      }
    });
  }
});
