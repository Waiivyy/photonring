// Small, independent numerical helpers for tests. Deliberately simple and separate from
// src/physics so that tests do not validate the library with its own machinery.

export function relErr(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

const INV_PHI = (Math.sqrt(5) - 1) / 2;

/** Golden-section search for the minimum of a unimodal function on [a, b]. */
export function goldenSectionMin(f: (x: number) => number, a: number, b: number, tol = 1e-10) {
  let lo = a;
  let hi = b;
  let x1 = hi - INV_PHI * (hi - lo);
  let x2 = lo + INV_PHI * (hi - lo);
  let f1 = f(x1);
  let f2 = f(x2);
  while (hi - lo > tol) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - INV_PHI * (hi - lo);
      f1 = f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + INV_PHI * (hi - lo);
      f2 = f(x2);
    }
  }
  return (lo + hi) / 2;
}

export function goldenSectionMax(f: (x: number) => number, a: number, b: number, tol = 1e-10) {
  return goldenSectionMin((x) => -f(x), a, b, tol);
}

/** Adaptive Simpson quadrature, for smooth integrands only. */
export function adaptiveSimpson(f: (x: number) => number, a: number, b: number, tol = 1e-13) {
  const simpson = (fa: number, fm: number, fb: number, h: number) => (h / 6) * (fa + 4 * fm + fb);
  const recurse = (
    lo: number,
    hi: number,
    flo: number,
    fmid: number,
    fhi: number,
    whole: number,
    eps: number,
    depth: number,
  ): number => {
    const mid = (lo + hi) / 2;
    const fl = f((lo + mid) / 2);
    const fr = f((mid + hi) / 2);
    const left = simpson(flo, fl, fmid, mid - lo);
    const right = simpson(fmid, fr, fhi, hi - mid);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) {
      return left + right + (left + right - whole) / 15;
    }
    return (
      recurse(lo, mid, flo, fl, fmid, left, eps / 2, depth - 1) +
      recurse(mid, hi, fmid, fr, fhi, right, eps / 2, depth - 1)
    );
  };
  const fa = f(a);
  const fb = f(b);
  const fm = f((a + b) / 2);
  return recurse(a, b, fa, fm, fb, simpson(fa, fm, fb, b - a), tol, 50);
}

/** Least-squares slope of y against x. */
export function slope(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx;
    num += dx * ((ys[i] as number) - my);
    den += dx * dx;
  }
  return num / den;
}
