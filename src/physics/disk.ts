// Toy thin-disk model. Not a Page-Thorne solution: no relativistic corrections to the flux.

/** Radius of peak temperature for the profile below, r = (49/36) r_in. */
const PEAK_RATIO = 49 / 36;
const PEAK_SHAPE = PEAK_RATIO ** -0.75 * (1 - Math.sqrt(1 / PEAK_RATIO)) ** 0.25;

/**
 * Temperature profile T(r) proportional to r^(-3/4) (1 - sqrt(r_in / r))^(1/4) (Newtonian thin
 * disk with zero torque at r_in), normalised to 1 at its peak. Zero at and inside r_in.
 */
export function diskTemperature(r: number, rIn: number): number {
  if (!(r > rIn)) return 0;
  const x = r / rIn;
  return (x ** -0.75 * (1 - Math.sqrt(1 / x)) ** 0.25) / PEAK_SHAPE;
}
