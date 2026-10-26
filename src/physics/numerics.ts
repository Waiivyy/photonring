// General numerical building blocks for the reference computations (f64).

export interface QuadratureRule {
  readonly nodes: readonly number[];
  readonly weights: readonly number[];
}

const legendreCache = new Map<number, QuadratureRule>();

/** n-point Gauss-Legendre rule on [-1, 1], nodes found by Newton iteration on P_n. */
export function gaussLegendre(n: number): QuadratureRule {
  const cached = legendreCache.get(n);
  if (cached) return cached;
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`gaussLegendre needs n >= 1, got ${n}`);

  const nodes = new Array<number>(n);
  const weights = new Array<number>(n);
  const legendre = (x: number) => {
    let p0 = 1;
    let p1 = x;
    for (let k = 2; k <= n; k++) {
      const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
      p0 = p1;
      p1 = p2;
    }
    // P_n(x) and P_n'(x)
    return { p: p1, dp: (n * (x * p1 - p0)) / (x * x - 1) };
  };

  for (let i = 0; i < Math.floor((n + 1) / 2); i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    for (let iter = 0; iter < 100; iter++) {
      const { p, dp } = legendre(x);
      const dx = p / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    const { dp } = legendre(x);
    const w = 2 / ((1 - x * x) * dp * dp);
    nodes[i] = -x;
    nodes[n - 1 - i] = x;
    weights[i] = w;
    weights[n - 1 - i] = w;
  }
  if (n % 2 === 1) nodes[(n - 1) / 2] = 0;

  const rule = { nodes, weights };
  legendreCache.set(n, rule);
  return rule;
}

/** Composite Gauss-Legendre: `panels` equal panels of an `order`-point rule on [a, b]. */
export function integrate(
  f: (x: number) => number,
  a: number,
  b: number,
  panels: number,
  order = 20,
): number {
  const { nodes, weights } = gaussLegendre(order);
  const width = (b - a) / panels;
  let sum = 0;
  for (let p = 0; p < panels; p++) {
    const mid = a + (p + 0.5) * width;
    let panel = 0;
    for (let i = 0; i < order; i++) {
      panel += (weights[i] as number) * f(mid + 0.5 * width * (nodes[i] as number));
    }
    sum += 0.5 * width * panel;
  }
  return sum;
}

/**
 * Carlson's symmetric elliptic integral of the first kind,
 * R_F(x, y, z) = (1/2) * integral_0^inf dt / sqrt((t + x)(t + y)(t + z)),
 * by the duplication algorithm of Carlson (1995), Numer. Algorithms 10, 13-26.
 * x, y, z >= 0 with at most one of them zero.
 */
export function carlsonRF(x: number, y: number, z: number): number {
  if (!(x >= 0 && y >= 0 && z >= 0) || x + y === 0 || x + z === 0 || y + z === 0) {
    throw new RangeError(`carlsonRF needs non-negative arguments, at most one zero`);
  }
  const a0 = (x + y + z) / 3;
  // Iterate until the remainder of the series is below about 1e-16 relative.
  const q = Math.max(Math.abs(a0 - x), Math.abs(a0 - y), Math.abs(a0 - z)) / (3 * 1e-16) ** (1 / 6);
  let xm = x;
  let ym = y;
  let zm = z;
  let am = a0;
  let scale = 1; // 4^n
  while (q / scale >= Math.abs(am)) {
    const sx = Math.sqrt(xm);
    const sy = Math.sqrt(ym);
    const sz = Math.sqrt(zm);
    const lambda = sx * sy + sx * sz + sy * sz;
    xm = (xm + lambda) / 4;
    ym = (ym + lambda) / 4;
    zm = (zm + lambda) / 4;
    am = (am + lambda) / 4;
    scale *= 4;
  }
  const dx = (a0 - x) / (scale * am);
  const dy = (a0 - y) / (scale * am);
  const dz = -dx - dy;
  const e2 = dx * dy - dz * dz;
  const e3 = dx * dy * dz;
  return (1 - e2 / 10 + e3 / 14 + (e2 * e2) / 24 - (3 * e2 * e3) / 44) / Math.sqrt(am);
}
