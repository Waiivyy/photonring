// Overlay curves in the image plane (Stage 4): the analytic shadow edge and the lensed images of
// the disk-plane circles r = 2M, 3M and 6M, checked against traced rays in the real camera.
import { describe, expect, it } from 'vitest';
import {
  autoFieldOfView,
  cameraFrame,
  firstPlaneCrossingAngle,
  pixelDirection,
  shadowAngularRadius,
  traceRay,
  type CameraFrame,
  type Vec3,
} from '../../src/physics/index.ts';
import {
  BASE_SAMPLES,
  MAX_IMAGE_ANGLE,
  MAX_VERTICES,
  chordTolerance,
  edgeEllipse,
  edgeTanRadius,
  pathData,
  projectTan,
  ringCurve,
  ringCurveJob,
  ringImagePoint,
  type ImageOrder,
  type RingCurveRequest,
  type RingRadius,
  type TanCurve,
  type TanPoint,
} from '../../src/ui/overlay-geometry.ts';
import { binetRadiusAt } from '../helpers/rings.ts';

const M = 1;
const W = 1920;
const H = 1080;
const ASPECT = W / H;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface View {
  readonly name: string;
  readonly distance: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
}

const VIEWS: View[] = [
  { name: '30 M, elevation 12', distance: 30, azimuthDeg: 0, elevationDeg: 12 },
  { name: '30 M, elevation 2', distance: 30, azimuthDeg: 0, elevationDeg: 2 },
  { name: '30 M, in the disk plane', distance: 30, azimuthDeg: 0, elevationDeg: 0 },
  { name: '30 M, face-on', distance: 30, azimuthDeg: 0, elevationDeg: 90 },
  { name: '30 M, below the disk', distance: 30, azimuthDeg: 0, elevationDeg: -45 },
  { name: '5 M, elevation 20 (inside the ISCO)', distance: 5, azimuthDeg: 0, elevationDeg: 20 },
  { name: '6 M, elevation 12 (on the ISCO)', distance: 6, azimuthDeg: 0, elevationDeg: 12 },
  { name: '200 M, elevation 12', distance: 200, azimuthDeg: 0, elevationDeg: 12 },
  { name: '30 M, azimuth 137', distance: 30, azimuthDeg: 137, elevationDeg: 12 },
];

const CURVES: [RingRadius, ImageOrder][] = [
  [2, 0],
  [3, 0],
  [6, 0],
  [6, 1],
];

function frameOf(v: View): CameraFrame {
  return cameraFrame({ ...v, fovYDeg: autoFieldOfView(v.distance, M, 60) }, M);
}

function request(v: View, R: RingRadius, order: ImageOrder): RingCurveRequest {
  return {
    rObs: v.distance,
    elevationDeg: v.elevationDeg,
    R,
    order,
    tanHalfFovY: frameOf(v).tanHalfFovY,
    aspect: ASPECT,
  };
}

/** Unit view direction of the tan-plane point (sx, sy) in a camera frame. */
function directionOf(f: CameraFrame, [sx, sy]: TanPoint): Vec3 {
  const d: Vec3 = [
    f.forward[0] + sx * f.right[0] + sy * f.up[0],
    f.forward[1] + sx * f.right[1] + sy * f.up[1],
    f.forward[2] + sx * f.right[2] + sy * f.up[2],
  ];
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
}

/**
 * Radius of the order-n image point of the ray through (sx, sy) in the real camera: from the
 * 3D tracer's crossing log for R = 6, and from the planar integrator in that ray's plane for
 * R <= 3M, which the tracer captures at 3M before reaching. 0 below (captured), Infinity above.
 */
function tracedRadius(v: View, f: CameraFrame, p: TanPoint, R: RingRadius, order: number) {
  const d = directionOf(f, p);
  if (R === 6) {
    const ray = traceRay(M, f.position, d, { dphi: 0.0125, maxSteps: 20000 });
    const c = ray.crossings[order];
    if (c) return c.radius;
    return ray.termination === 'captured' ? 0 : Infinity;
  }
  const e1: Vec3 = [
    f.position[0] / v.distance,
    f.position[1] / v.distance,
    f.position[2] / v.distance,
  ];
  const c = dot(d, e1);
  const t: Vec3 = [d[0] - c * e1[0], d[1] - c * e1[1], d[2] - c * e1[2]];
  const s = Math.hypot(t[0], t[1], t[2]);
  const phi0 = firstPlaneCrossingAngle(e1[2], t[2] / s) as number;
  const alpha = Math.atan2(s, -c);
  return binetRadiusAt(v.distance, R, alpha, phi0 + order * Math.PI, 0.0125);
}

/** The point moved by `px` pixels (at H rows) along its image radius. */
function alongRadius(p: TanPoint, px: number, t: number): TanPoint {
  const rho = Math.hypot(p[0], p[1]);
  const k = (rho + (px * 2 * t) / H) / rho;
  return [p[0] * k, p[1] * k];
}

const vertices = (c: TanCurve) => c.segments.flat();

describe('shadow edge', () => {
  it('is the analytic cone, an ellipse in a box with another aspect', () => {
    for (const r of [5, 30, 200]) {
      const t = Math.tan((autoFieldOfView(r, M, 60) * Math.PI) / 360);
      expect(edgeTanRadius(r)).toBeCloseTo(Math.tan(shadowAngularRadius(r, M)), 14);
      const view = { width: 800, height: 600, aspect: ASPECT, tanHalfFovY: t };
      const e = edgeEllipse(r, view);
      const tanPsi = Math.tan(shadowAngularRadius(r, M));
      expect(e.cx).toBe(400);
      expect(e.cy).toBe(300);
      expect(Math.abs(e.ry - ((tanPsi / t) * 600) / 2)).toBeLessThan(1e-12 * e.ry);
      expect(Math.abs(e.rx - ((tanPsi / (ASPECT * t)) * 800) / 2)).toBeLessThan(1e-12 * e.rx);
    }
  });
});

describe('image-plane projection', () => {
  it('is the inverse of pixelDirection, also stretched into a box of another size', () => {
    const f = frameOf(VIEWS[0] as View);
    for (const [x, y] of [
      [0, 0],
      [W / 2, H / 2],
      [123.25, 987.5],
      [W, H],
    ] as const) {
      const d = pixelDirection(f, W, H, x, y);
      const a = dot(d, f.forward);
      const p: TanPoint = [dot(d, f.right) / a, dot(d, f.up) / a];
      const view = { width: W, height: H, aspect: ASPECT, tanHalfFovY: f.tanHalfFovY };
      const [px, py] = projectTan(p, view);
      expect(Math.abs(px - x)).toBeLessThan(1e-9);
      expect(Math.abs(py - y)).toBeLessThan(1e-9);
      const [cx, cy] = projectTan(p, { ...view, width: 640, height: 400 });
      expect(Math.abs(cx - (x * 640) / W)).toBeLessThan(1e-9);
      expect(Math.abs(cy - (y * 400) / H)).toBeLessThan(1e-9);
    }
  });
});

describe('lensed ring curves', () => {
  for (const v of VIEWS) {
    it(`${v.name}: every 8th vertex is within 0.01 px of the traced image at 1080 rows`, () => {
      const f = frameOf(v);
      for (const [R, order] of CURVES) {
        const curve = ringCurve(request(v, R, order));
        const points = vertices(curve);
        expect(points.length).toBeGreaterThan(0);
        for (let i = 0; i < points.length; i += 8) {
          const p = points[i] as TanPoint;
          const inner = tracedRadius(v, f, alongRadius(p, -0.01, f.tanHalfFovY), R, order);
          const outer = tracedRadius(v, f, alongRadius(p, 0.01, f.tanHalfFovY), R, order);
          expect(inner, `${v.name}, R ${R}, n ${order}, vertex ${i}`).toBeLessThan(R);
          expect(outer, `${v.name}, R ${R}, n ${order}, vertex ${i}`).toBeGreaterThan(R);
        }
      }
    });
  }

  it('each image direction crosses each curve exactly once, at the vertex', () => {
    for (const v of [VIEWS[0], VIEWS[5]] as View[]) {
      const f = frameOf(v);
      const t = f.tanHalfFovY;
      const maxRho = Math.min(t * Math.hypot(ASPECT, 1), Math.tan(MAX_IMAGE_ANGLE));
      for (const [R, order] of CURVES) {
        for (let k = 0; k < 8; k++) {
          const theta = (2 * Math.PI * (k + 0.3)) / 8;
          const vertex = ringImagePoint(v.distance, v.elevationDeg, R, order, theta);
          const sweep =
            (firstPlaneCrossingAngle(
              Math.sin((v.elevationDeg * Math.PI) / 180),
              Math.sin(theta) * Math.cos((v.elevationDeg * Math.PI) / 180),
            ) as number) +
            order * Math.PI;
          const stepTan = (2 * t) / H;
          let changes = 0;
          let at = -1;
          let last = 0;
          for (let rho = 0.5 * stepTan; rho < maxRho; rho += stepTan) {
            const s = Math.sign(binetRadiusAt(v.distance, R, Math.atan(rho), sweep, 0.025) - R);
            if (last !== 0 && s !== last) {
              changes++;
              at = rho;
            }
            last = s;
          }
          if (vertex === null || Math.hypot(...vertex) >= maxRho) {
            expect(changes).toBe(0);
          } else {
            expect(changes).toBe(1);
            expect(Math.abs(Math.hypot(...vertex) - (at - stepTan / 2))).toBeLessThan(stepTan);
          }
        }
      }
    }
  });

  it('is mirror symmetric about the vertical image axis', () => {
    for (const [R, order] of CURVES) {
      for (const theta of [0.1, 0.7, 1.3, 2.9, 4.0, 5.5]) {
        const a = ringImagePoint(30, 12, R, order, theta) as TanPoint;
        const b = ringImagePoint(30, 12, R, order, Math.PI - theta) as TanPoint;
        expect(Math.abs(a[0] + b[0])).toBeLessThan(1e-12);
        expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-12);
      }
    }
  });

  it('face-on, every curve is a circle', () => {
    for (const [R, order] of CURVES) {
      const radii = vertices(ringCurve(request(VIEWS[3] as View, R, order))).map((p) =>
        Math.hypot(p[0], p[1]),
      );
      const r0 = radii[0] as number;
      for (const r of radii) expect(Math.abs(r / r0 - 1)).toBeLessThan(1e-9);
    }
  });

  it('in the disk plane, the near side breaks where the ray plane is the disk plane', () => {
    expect(ringImagePoint(30, 0, 6, 0, 0)).toBeNull();
    expect(ringImagePoint(30, 0, 6, 0, Math.PI)).toBeNull();
    for (const [R, order] of CURVES) {
      const curve = ringCurve(request(VIEWS[2] as View, R, order));
      expect(curve.segments.length).toBeGreaterThanOrEqual(2);
      for (const p of vertices(curve)) expect(p.every(Number.isFinite)).toBe(true);
    }
  });

  it('inside the ISCO, the parts of its image beside and behind the camera are left out', () => {
    const v = VIEWS[5] as View;
    let missing = 0;
    for (let k = 0; k < 64; k++) {
      if (ringImagePoint(v.distance, v.elevationDeg, 6, 0, (2 * Math.PI * k) / 64) === null) {
        missing++;
      }
    }
    expect(missing).toBeGreaterThan(0);
    for (const p of vertices(ringCurve(request(v, 6, 0)))) {
      expect(Math.hypot(p[0], p[1])).toBeLessThanOrEqual(Math.tan(MAX_IMAGE_ANGLE) * (1 + 1e-12));
    }
  });

  it('stays within the vertex cap and the chord tolerance on screen', () => {
    for (const v of VIEWS) {
      const t = frameOf(v).tanHalfFovY;
      const tol = chordTolerance(t);
      expect(tol).toBeCloseTo((0.1 * 2 * t) / 2160, 15);
      for (const [R, order] of CURVES) {
        const req = request(v, R, order);
        const curve = ringCurve(req);
        expect(curve.vertices).toBeLessThanOrEqual(MAX_VERTICES);
        expect(curve.vertices).toBe(vertices(curve).length);
        const onScreen = (p: TanPoint) => Math.abs(p[0]) <= ASPECT * t && Math.abs(p[1]) <= t;
        for (const seg of curve.segments) {
          for (let i = 1; i < seg.length; i++) {
            const a = seg[i - 1] as TanPoint;
            const b = seg[i] as TanPoint;
            if (!onScreen(a) || !onScreen(b)) continue;
            const ta = Math.atan2(a[1], a[0]);
            let tb = Math.atan2(b[1], b[0]);
            if (tb - ta > Math.PI) tb -= 2 * Math.PI;
            if (ta - tb > Math.PI) tb += 2 * Math.PI;
            const m = ringImagePoint(v.distance, v.elevationDeg, R, order, (ta + tb) / 2);
            if (m === null) continue;
            // Distance from the true midpoint to the chord.
            const ex = b[0] - a[0];
            const ey = b[1] - a[1];
            const len = Math.hypot(ex, ey);
            const dev = len === 0 ? 0 : Math.abs((m[0] - a[0]) * ey - (m[1] - a[1]) * ex) / len;
            expect(dev, `${v.name}, R ${R}, n ${order}`).toBeLessThanOrEqual(tol * 1.01);
          }
        }
      }
    }
  });

  it('does not refine parts of the curve that lie off screen', () => {
    // A narrow view of the default camera shows only the middle of the ISCO image.
    const t = Math.tan((4 * Math.PI) / 180);
    const req: RingCurveRequest = {
      rObs: 30,
      elevationDeg: 12,
      R: 6,
      order: 0,
      tanHalfFovY: t,
      aspect: ASPECT,
    };
    const curve = ringCurve(req);
    const off = vertices(curve).filter(
      (p) => Math.abs(p[0]) > 1.1 * ASPECT * t || Math.abs(p[1]) > 1.1 * t,
    );
    expect(off.length).toBeLessThanOrEqual(BASE_SAMPLES + 2 * 8 * curve.segments.length + 8);
  });

  it('a job run in time slices gives the same curve as one run in one go', () => {
    const req = request(VIEWS[0] as View, 6, 1);
    const whole = ringCurve(req);
    const a = ringCurveJob(req);
    const b = ringCurveJob(request(VIEWS[0] as View, 2, 0));
    let ra = a.next();
    let rb = b.next();
    while (!ra.done) {
      for (let i = 0; i < 7 && !ra.done; i++) ra = a.next();
      if (!rb.done) rb = b.next();
    }
    expect(ra.value).toEqual(whole);
  });

  it('writes SVG path data with one move per segment', () => {
    const v = VIEWS[2] as View;
    const curve = ringCurve(request(v, 6, 0));
    const view = { width: 640, height: 360, aspect: ASPECT, tanHalfFovY: frameOf(v).tanHalfFovY };
    const d = pathData(curve, view);
    expect(d.match(/M/g)?.length).toBe(curve.segments.length);
    expect(d).not.toMatch(/NaN|Infinity/);
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBe(2 * curve.vertices);
  });
});
