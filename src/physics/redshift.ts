// Frequency ratio g = nu_obs / nu_emit between an emitter and a distant or static observer.
// Derivations: docs/PHYSICS.md, section "Redshift".

/** An emitter on a stationary orbit, u = u^t (1, 0, 0, omega) in Schwarzschild coordinates. */
export interface Emitter {
  readonly ut: number;
  readonly omega: number;
}

/** Circular Keplerian orbit: Omega = sqrt(M / r^3), u^t = 1 / sqrt(1 - 3M/r). Requires r > 3M. */
export function circularOrbitEmitter(r: number, M: number): Emitter {
  if (!(r > 3 * M)) throw new RangeError(`circular orbits need r > 3M, got r = ${r}`);
  return { ut: 1 / Math.sqrt(1 - (3 * M) / r), omega: Math.sqrt(M / r ** 3) };
}

/** Emitter at rest at radius r: u^t = 1 / sqrt(1 - 2M/r). */
export function staticEmitter(r: number, M: number): Emitter {
  if (!(r > 2 * M)) throw new RangeError(`static emitters need r > 2M, got r = ${r}`);
  return { ut: 1 / Math.sqrt(1 - (2 * M) / r), omega: 0 };
}

/**
 * g = E_obs / E_emit = 1 / (u^t (1 - Omega L_z / E)) for an observer at rest at infinity.
 * lzOverE is the photon's conserved L_z / E along its physical direction of travel; positive
 * L_z co-rotates with an emitter of positive Omega (approaching side, blueshift).
 */
export function redshiftFactor(emitter: Emitter, lzOverE: number): number {
  return 1 / (emitter.ut * (1 - emitter.omega * lzOverE));
}

/** Extra factor for a static observer at r_o instead of infinity: g_obs = g / sqrt(1 - 2M/r_o). */
export function staticObserverFactor(rObs: number, M: number): number {
  if (!(rObs > 2 * M)) throw new RangeError(`static observers need r > 2M, got r = ${rObs}`);
  return 1 / Math.sqrt(1 - (2 * M) / rObs);
}

/** Largest impact parameter of a photon that reaches radius r: b = r / sqrt(1 - 2M/r). */
export function maxImpactParameterAt(r: number, M: number): number {
  return r / Math.sqrt(1 - (2 * M) / r);
}
