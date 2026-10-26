// Characteristic radii of the Schwarzschild metric. Geometric units G = c = 1; lengths scale with M.

/** Event horizon, r = 2M. */
export function horizonRadius(M: number): number {
  return 2 * M;
}

/** Photon sphere (unstable circular null orbit), r = 3M. */
export function photonSphereRadius(M: number): number {
  return 3 * M;
}

/** Innermost stable circular orbit for massive particles, r = 6M. */
export function iscoRadius(M: number): number {
  return 6 * M;
}

/** Critical impact parameter for photon capture, b_c = 3 sqrt(3) M. */
export function criticalImpactParameter(M: number): number {
  return 3 * Math.sqrt(3) * M;
}
