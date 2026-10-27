// 3D ray tracing from a static observer, reduced to the planar Binet integrator.
// Geometry and sign conventions: docs/PHYSICS.md, sections 6, 7 and 9.
import { f64, integrateBinet, RADIAL_SIN, type Round, type Termination } from './integrators.ts';
import type { Vec3 } from './observer.ts';

export interface RayOptions {
  /** Fixed step in the orbital angle, radians. */
  readonly dphi: number;
  readonly maxSteps: number;
  /** Inward rays inside this radius are captured (exact for any value in (2M, 3M]). Default 3M. */
  readonly captureRadius?: number;
  readonly round?: Round;
}

/** A crossing of the equatorial plane z = 0, in order along the traced path. */
export interface PlaneCrossing {
  readonly radius: number;
  /** Orbital angle in the ray plane, from the observer position. */
  readonly phi: number;
  readonly position: Vec3;
}

export interface RayResult {
  readonly termination: Termination;
  /** Unit direction to infinity for escaped rays, null otherwise. */
  readonly direction: Vec3 | null;
  readonly crossings: readonly PlaneCrossing[];
  readonly steps: number;
  readonly impactParameter: number;
  /**
   * Conserved L_z / E of the physical photon, which travels opposite to the traced ray. Positive
   * means it orbits counterclockwise seen from +z, with the disk (approaching side, blueshift).
   */
  readonly lzOverE: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * First orbital angle, in (0, pi], at which a ray plane with basis e1 (towards the observer) and
 * e2 meets the disk plane: z(phi) = r (e1z cos phi + e2z sin phi) vanishes at phi0 + k pi. An
 * observer in the plane gets pi (its own position is not a crossing). Undefined when the ray
 * plane is the disk plane itself, which a zero-thickness disk never crosses.
 */
export function firstPlaneCrossingAngle(e1z: number, e2z: number): number | undefined {
  if (!(Math.hypot(e1z, e2z) > 1e-14)) return undefined;
  let phi0 = Math.atan2(-e1z, e2z);
  phi0 -= Math.PI * Math.floor(phi0 / Math.PI);
  return phi0 > 0 ? phi0 : Math.PI;
}

function finiteVec(v: Vec3): boolean {
  return v.length === 3 && v.every(Number.isFinite);
}

/**
 * Traces a ray backwards from a static observer at `origin`, leaving in the unit `direction`
 * measured in the observer's local frame (axes aligned with the Euclidean axes of Schwarzschild
 * coordinates). The ray stays in the plane of origin and direction, where the orbital angle phi
 * runs from the observer towards the tangential part of the direction.
 */
export function traceRay(M: number, origin: Vec3, direction: Vec3, opts: RayOptions): RayResult {
  if (!(Number.isFinite(M) && M >= 0)) throw new RangeError('M must be finite and non-negative');
  if (!finiteVec(origin) || !finiteVec(direction)) throw new RangeError('non-finite input');
  const r0 = Math.hypot(origin[0], origin[1], origin[2]);
  if (!(r0 > 2 * M)) throw new RangeError('origin must be outside the horizon');
  const dn = Math.hypot(direction[0], direction[1], direction[2]);
  if (!(Math.abs(dn - 1) < 1e-9)) throw new RangeError('direction must be a unit vector');
  if (!(opts.dphi > 0 && Number.isFinite(opts.dphi))) throw new RangeError('dphi must be > 0');
  if (!(Number.isInteger(opts.maxSteps) && opts.maxSteps >= 1)) {
    throw new RangeError('maxSteps must be a positive integer');
  }
  const captureRadius = opts.captureRadius ?? 3 * M;
  if (M > 0 && !(captureRadius > 2 * M && captureRadius <= 3 * M)) {
    throw new RangeError('captureRadius must be in (2M, 3M]');
  }

  // Ray plane basis: e1 along the observer position, e2 along the tangential part of d.
  const e1: Vec3 = [origin[0] / r0, origin[1] / r0, origin[2] / r0];
  const cosPsi = dot(direction, e1);
  const t: Vec3 = [
    direction[0] - cosPsi * e1[0],
    direction[1] - cosPsi * e1[1],
    direction[2] - cosPsi * e1[2],
  ];
  const sinPsi = Math.hypot(t[0], t[1], t[2]);
  const impactParameter = (r0 * sinPsi) / Math.sqrt(1 - (2 * M) / r0);

  if (sinPsi < RADIAL_SIN) {
    // Radial rays are straight lines; inward ones end at the centre without meeting the disk.
    const escaped = cosPsi > 0 || M === 0;
    return {
      termination: escaped ? 'escaped' : 'captured',
      direction: escaped ? [direction[0], direction[1], direction[2]] : null,
      crossings: [],
      steps: 0,
      impactParameter,
      lzOverE: 0,
    };
  }

  const e2: Vec3 = [t[0] / sinPsi, t[1] / sinPsi, t[2] / sinPsi];
  const normalZ = e1[0] * e2[1] - e1[1] * e2[0];
  const lzOverE = -impactParameter * normalZ;
  const inPlane = (phi: number, r: number): Vec3 => {
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    return [r * (c * e1[0] + s * e2[0]), r * (c * e1[1] + s * e2[1]), r * (c * e1[2] + s * e2[2])];
  };

  if (M === 0) {
    // Flat space: the straight line itself, so the result is exact.
    const crossings: PlaneCrossing[] = [];
    const s = direction[2] !== 0 ? -origin[2] / direction[2] : -1;
    if (s > 0) {
      const p: Vec3 = [origin[0] + s * direction[0], origin[1] + s * direction[1], 0];
      const phi = Math.atan2(dot(p, e2), dot(p, e1));
      crossings.push({ radius: Math.hypot(p[0], p[1]), phi, position: p });
    }
    return {
      termination: 'escaped',
      direction: [direction[0], direction[1], direction[2]],
      crossings,
      steps: 0,
      impactParameter,
      lzOverE,
    };
  }

  const firstCrossing = firstPlaneCrossingAngle(e1[2], e2[2]);

  const R = opts.round ?? f64;
  const u0 = 1 / r0;
  const w0 = -u0 * Math.sqrt(1 - 2 * M * u0) * (cosPsi / sinPsi);
  const core = integrateBinet(M, R(u0), R(w0), {
    round: R,
    dphi: opts.dphi,
    maxSteps: opts.maxSteps,
    uCapture: 1 / captureRadius,
    ...(firstCrossing === undefined ? {} : { firstCrossing }),
  });

  const crossings = core.crossings.map(({ phi, u }) => {
    const radius = 1 / u;
    return { radius, phi, position: inPlane(phi, radius) };
  });
  return {
    termination: core.termination,
    direction: core.termination === 'escaped' ? inPlane(core.phiEnd, 1) : null,
    crossings,
    steps: core.steps,
    impactParameter,
    lzOverE,
  };
}
