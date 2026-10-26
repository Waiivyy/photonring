// Independent 3D reference tracer: x'' = -3 M h^2 x / r^5 with classical RK4 in Cartesian
// coordinates, written separately from src/physics so it can check the planar reduction.
type V = [number, number, number];
type ReadonlyV = readonly [number, number, number];

const dot = (a: ReadonlyV, b: ReadonlyV) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: ReadonlyV, b: ReadonlyV): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: ReadonlyV, b: ReadonlyV, s: number): V => [
  a[0] + s * b[0],
  a[1] + s * b[1],
  a[2] + s * b[2],
];
const len = (a: ReadonlyV) => Math.hypot(a[0], a[1], a[2]);

export interface Cartesian3DResult {
  termination: 'escaped' | 'captured' | 'stepLimit';
  /** Unit velocity direction at the escape radius. */
  direction: V;
  /** Largest |x . n| / |x| along the path, n the normal of the initial plane. */
  planeDeviation: number;
}

export function traceCartesian3D(
  M: number,
  origin: ReadonlyV,
  localDir: ReadonlyV,
  eta = 0.004,
  rEscape = 1e5,
  maxSteps = 200000,
): Cartesian3DResult {
  const r0 = len(origin);
  const rhat: V = [origin[0] / r0, origin[1] / r0, origin[2] / r0];
  const radial = dot(localDir, rhat);
  // Static frame to Euclidean velocity: shrink the radial component by sqrt(1 - 2M/r).
  let v = add(localDir, rhat, -radial * (1 - Math.sqrt(1 - (2 * M) / r0)));
  let x: V = [...origin];
  const hv = cross(x, v);
  const h = len(hv);
  const n: V = [hv[0] / h, hv[1] / h, hv[2] / h];
  const k = 3 * M * h * h;
  const acc = (p: V): V => {
    const r = len(p);
    const s = -k / r ** 5;
    return [s * p[0], s * p[1], s * p[2]];
  };
  let planeDeviation = 0;
  for (let i = 0; i < maxSteps; i++) {
    const dl = (eta * len(x)) / len(v);
    const a1 = acc(x);
    const x2 = add(x, v, dl / 2);
    const v2 = add(v, a1, dl / 2);
    const a2 = acc(x2);
    const x3 = add(x, v2, dl / 2);
    const v3 = add(v, a2, dl / 2);
    const a3 = acc(x3);
    const x4 = add(x, v3, dl);
    const v4 = add(v, a3, dl);
    const a4 = acc(x4);
    x = [0, 1, 2].map(
      (j) => (x[j] as number) + (dl / 6) * ((v[j] as number) + 2 * v2[j]! + 2 * v3[j]! + v4[j]!),
    ) as V;
    v = [0, 1, 2].map(
      (j) => (v[j] as number) + (dl / 6) * (a1[j]! + 2 * a2[j]! + 2 * a3[j]! + a4[j]!),
    ) as V;
    const r = len(x);
    planeDeviation = Math.max(planeDeviation, Math.abs(dot(x, n)) / r);
    const out = dot(x, v) > 0;
    if (r >= rEscape && out) {
      const s = len(v);
      return { termination: 'escaped', direction: [v[0] / s, v[1] / s, v[2] / s], planeDeviation };
    }
    if (r <= 3 * M && !out)
      return { termination: 'captured', direction: [NaN, NaN, NaN], planeDeviation };
  }
  return { termination: 'stepLimit', direction: [NaN, NaN, NaN], planeDeviation };
}
