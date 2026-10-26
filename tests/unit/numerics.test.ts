import { describe, expect, it } from 'vitest';
import { carlsonRF, gaussLegendre } from '../../src/physics/index.ts';
import { relErr } from '../helpers/numeric.ts';

describe('Gauss-Legendre nodes', () => {
  it.each([4, 10, 20, 32])('n = %i: weights sum to 2 and nodes are symmetric', (n) => {
    const { nodes, weights } = gaussLegendre(n);
    expect(nodes).toHaveLength(n);
    expect(weights.reduce((s, w) => s + w, 0)).toBeCloseTo(2, 14);
    for (let i = 0; i < n; i++) {
      expect(nodes[i]).toBeCloseTo(-(nodes[n - 1 - i] as number), 14);
    }
  });

  it.each([4, 10, 20])('n = %i integrates x^(2n-2) exactly on [-1, 1]', (n) => {
    const { nodes, weights } = gaussLegendre(n);
    const k = 2 * n - 2;
    const sum = nodes.reduce((s, x, i) => s + (weights[i] as number) * x ** k, 0);
    expect(relErr(sum, 2 / (k + 1))).toBeLessThan(1e-13);
  });
});

describe('Carlson R_F', () => {
  // Reference values from Carlson (1995), Numer. Algorithms 10, 13-26, section 3 test values,
  // and the complete elliptic integral K(1/sqrt 2) = R_F(0, 1/2, 1).
  it.each([
    [1, 2, 0, 1.3110287771461],
    [2, 3, 4, 0.58408284167715],
    [0, 0.5, 1, 1.8540746773013719],
  ])('R_F(%d, %d, %d) = %d', (x, y, z, expected) => {
    expect(relErr(carlsonRF(x, y, z), expected)).toBeLessThan(1e-12);
  });

  it('R_F(x, x, x) = x^(-1/2)', () => {
    for (const x of [1e-6, 0.3, 1, 7, 1e6]) {
      expect(relErr(carlsonRF(x, x, x), 1 / Math.sqrt(x))).toBeLessThan(1e-14);
    }
  });

  it('R_F(x, y, y) equals the closed form R_C(x, y) = acos(sqrt(x/y)) / sqrt(y - x)', () => {
    for (const [x, y] of [
      [0.1, 1],
      [0.5, 1],
      [2, 9],
    ] as const) {
      const rc = Math.acos(Math.sqrt(x / y)) / Math.sqrt(y - x);
      expect(relErr(carlsonRF(x, y, y), rc)).toBeLessThan(1e-13);
    }
  });

  it('is symmetric and homogeneous of degree -1/2', () => {
    const v = carlsonRF(0.3, 1.7, 4.2);
    expect(relErr(carlsonRF(4.2, 0.3, 1.7), v)).toBeLessThan(1e-14);
    expect(relErr(carlsonRF(1.2, 6.8, 16.8), v / 2)).toBeLessThan(1e-14);
  });
});
