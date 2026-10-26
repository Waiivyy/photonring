// Static observer at Schwarzschild radius r_o: local angles, impact parameters, shadow size.
// Derivations: docs/PHYSICS.md, section "Static observer".
import { criticalImpactParameter } from './constants.ts';

export type Vec3 = readonly [number, number, number];

function checkOutsideHorizon(r: number, M: number): void {
  if (!(r > 2 * M)) throw new RangeError(`radius must be outside the horizon, got r = ${r}`);
}

/**
 * Angular radius of the shadow, measured from the direction to the black hole, for a static
 * observer at r_o: sin(psi) = (b_c / r_o) sqrt(1 - 2M/r_o), with
 * cos(psi) = (r_o - 3M) sqrt(r_o + 6M) / r_o^(3/2). The atan2 form keeps full precision
 * near r_o = 3M and selects the psi > pi/2 branch inside the photon sphere.
 */
export function shadowAngularRadius(rObs: number, M: number): number {
  checkOutsideHorizon(rObs, M);
  const sinPsi = (criticalImpactParameter(M) / rObs) * Math.sqrt(1 - (2 * M) / rObs);
  const cosPsi = ((rObs - 3 * M) * Math.sqrt(rObs + 6 * M)) / rObs ** 1.5;
  return Math.atan2(sinPsi, cosPsi);
}

/** Impact parameter of a photon seen by a static observer at angle psi from the radial direction. */
export function impactParameterFromLocalAngle(rObs: number, psi: number, M: number): number {
  checkOutsideHorizon(rObs, M);
  return (rObs * Math.sin(psi)) / Math.sqrt(1 - (2 * M) / rObs);
}

/**
 * Converts a direction d, given in the static observer's orthonormal frame (expressed along the
 * Euclidean axes of Schwarzschild coordinates), into the initial velocity of the Euclidean
 * geodesic equation x'' = -3 M h^2 x / r^5. The radial component is scaled by sqrt(1 - 2M/r);
 * tangential components are unchanged. The result is not normalised.
 */
export function localDirectionToEuclidean(x: Vec3, d: Vec3, M: number): Vec3 {
  const r = Math.hypot(x[0], x[1], x[2]);
  checkOutsideHorizon(r, M);
  const radial = (d[0] * x[0] + d[1] * x[1] + d[2] * x[2]) / r;
  const shrink = (1 - Math.sqrt(1 - (2 * M) / r)) * (radial / r);
  return [d[0] - shrink * x[0], d[1] - shrink * x[1], d[2] - shrink * x[2]];
}
