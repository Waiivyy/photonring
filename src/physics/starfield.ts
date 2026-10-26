// Procedural star field. Stars live on a cubic lattice in direction space: lattice cell c of a
// layer holds at most one star, at point (c + jitter) / K, used only if that point lies within
// half a cell of the unit sphere. Integer hashing (pcg3d) makes the catalogue identical on the CPU
// and the GPU. A star's angular profile is truncated at half a cell, so looking up the 3 x 3 x 3
// cells around d K always finds every star that can contribute: no seams at cell boundaries.
import { blackbodyColour, luminance } from './colour.ts';
import type { Vec3 } from './observer.ts';

/**
 * pcg3d hash of Jarzynski and Olano (2020), "Hash Functions for GPU Rendering", JCGT 9(3),
 * section 6.1: three 32-bit inputs to three 32-bit outputs, all arithmetic modulo 2^32.
 */
export function pcg3d(x: number, y: number, z: number): [number, number, number] {
  let a = (Math.imul(x >>> 0, 1664525) + 1013904223) >>> 0;
  let b = (Math.imul(y >>> 0, 1664525) + 1013904223) >>> 0;
  let c = (Math.imul(z >>> 0, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0;
  b = (b ^ (b >>> 16)) >>> 0;
  c = (c ^ (c >>> 16)) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;
  return [a, b, c];
}

/** Top 24 bits of a 32-bit hash as a value in [0, 1), exact in f32. */
export function unitFromU32(u: number): number {
  return (u >>> 8) * 2 ** -24;
}

export interface StarLayer {
  /** Lattice cells per unit length: the layer's angular scale is about 1 / cellsPerUnit rad. */
  readonly cellsPerUnit: number;
  /** Probability that a cell holds a star. */
  readonly probability: number;
  /** Peak luminance of the brightest stars in the layer (6500 K blackbody = 1). */
  readonly brightness: number;
  readonly salt: number;
}

/** Three layers: few large bright stars, more medium ones, many small faint ones. */
export const STAR_LAYERS: readonly StarLayer[] = [
  { cellsPerUnit: 40, probability: 0.06, brightness: 6, salt: 0x1b873593 },
  { cellsPerUnit: 120, probability: 0.06, brightness: 1.5, salt: 0x85ebca6b },
  { cellsPerUnit: 360, probability: 0.03, brightness: 0.4, salt: 0x2b2ae35 },
];

export interface Star {
  readonly direction: Vec3;
  readonly temperature: number;
  /** Luminance at the centre of the star's profile, for an observer at infinity. */
  readonly luminance: number;
}

/** The star in a lattice cell of a layer, or null if the cell is empty. */
export function starAt(layer: StarLayer, cell: readonly [number, number, number]): Star | null {
  const h1 = pcg3d(cell[0], cell[1], cell[2] ^ layer.salt);
  if (unitFromU32(h1[0]) >= layer.probability) return null;
  const h2 = pcg3d(h1[0], h1[1], h1[2]);
  const k = layer.cellsPerUnit;
  const q: Vec3 = [
    (cell[0] + unitFromU32(h1[1])) / k,
    (cell[1] + unitFromU32(h1[2])) / k,
    (cell[2] + unitFromU32(h2[0])) / k,
  ];
  const r = Math.hypot(q[0], q[1], q[2]);
  if (Math.abs(r - 1) * k >= 0.5) return null;
  return {
    direction: [q[0] / r, q[1] / r, q[2] / r],
    temperature: 2500 + 30000 * unitFromU32(h2[2]) ** 3,
    luminance: layer.brightness * unitFromU32(h2[1]) ** 4,
  };
}

const TAIL = Math.exp(-8);

/**
 * Linear sRGB radiance of the star field in direction d (unit), as seen by an observer whose
 * frequencies are shifted by g relative to infinity (g = 1 / sqrt(1 - 2M/r_o) for a static
 * observer): each star is a blackbody whose temperature becomes g T.
 */
export function skyRadiance(d: Vec3, g: number): Vec3 {
  let r = 0;
  let gr = 0;
  let b = 0;
  for (const layer of STAR_LAYERS) {
    const k = layer.cellsPerUnit;
    const cx = Math.floor(d[0] * k);
    const cy = Math.floor(d[1] * k);
    const cz = Math.floor(d[2] * k);
    // Profile: Gaussian in chord distance with sigma = rho / 4, cut at rho = half a cell.
    const rho2 = (0.5 / k) ** 2;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let l = -1; l <= 1; l++) {
          const star = starAt(layer, [cx + i, cy + j, cz + l]);
          if (!star) continue;
          const s = star.direction;
          const chord2 = (d[0] - s[0]) ** 2 + (d[1] - s[1]) ** 2 + (d[2] - s[2]) ** 2;
          if (chord2 >= rho2) continue;
          const weight = (Math.exp((-8 * chord2) / rho2) - TAIL) / (1 - TAIL);
          const colour = blackbodyColour(g * star.temperature);
          const scale = (weight * star.luminance) / luminance(blackbodyColour(star.temperature));
          r += scale * colour[0];
          gr += scale * colour[1];
          b += scale * colour[2];
        }
      }
    }
  }
  return [Math.max(0, r), Math.max(0, gr), Math.max(0, b)];
}
