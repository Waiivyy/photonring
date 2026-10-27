// The single source of rounding for the view state. The app's camera is always held at the
// precision of the URL, so the rendered view, the HUD, the hash, the saved file name and the
// overlay cache keys all describe the same view, and a shared link reproduces it exactly.
import type { OrbitState } from './orbit.ts';

/** Allowed observer distances in M: never at or inside the horizon, never unbounded. */
export const ORBIT_LIMITS = { minDistance: 5, maxDistance: 200 } as const;
export const DISTANCE_DECIMALS = 3;
export const ANGLE_DECIMALS = 2;

/** toFixed, with trailing zeros and a trailing point stripped, and negative zero written as 0. */
export function formatNumber(x: number, decimals: number): string {
  const s = x
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

/** x rounded to `decimals` places, exactly the number its formatted string denotes. */
export function quantise(x: number, decimals: number): number {
  return Number(formatNumber(x, decimals)) + 0;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** deg in [0, 360); a single remainder, exact for any finite input (no + 360 then % 360). */
function wrap360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Azimuth wrapped into [0, 360), rounded, and wrapped again where rounding reaches 360. */
function wrappedAzimuth(deg: number): number {
  const a = quantise(wrap360(deg), ANGLE_DECIMALS);
  return a >= 360 ? 0 : a;
}

/** Clamps and wraps the orbit, then rounds it; the azimuth is wrapped again after rounding. */
export function quantiseOrbit(s: OrbitState): OrbitState {
  return {
    ...s,
    distance: quantise(
      clamp(s.distance, ORBIT_LIMITS.minDistance, ORBIT_LIMITS.maxDistance),
      DISTANCE_DECIMALS,
    ),
    azimuthDeg: wrappedAzimuth(s.azimuthDeg),
    elevationDeg: quantise(clamp(s.elevationDeg, -90, 90), ANGLE_DECIMALS),
  };
}
