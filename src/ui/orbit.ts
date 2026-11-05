// Orbit camera state for the controls: pure updates with clamping and wrapping, rounded to the
// precision of the URL. Pointer, wheel, pinch, keyboard and button input all go through these.
import {
  autoFieldOfView,
  ehtFieldOfView,
  M87_SKY_ROLL_DEG,
  type CameraParams,
} from '../physics/index.ts';
import { ORBIT_LIMITS, quantiseOrbit } from './quantise.ts';
import type { ViewMode } from './view-state.ts';

export { ORBIT_LIMITS };

export interface OrbitState {
  readonly distance: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  /** Requested vertical field of view; widened automatically near the hole. */
  readonly baseFovDeg: number;
}

export const initialOrbit: OrbitState = {
  distance: 30,
  azimuthDeg: 0,
  elevationDeg: 12,
  baseFovDeg: 60,
};

export function orbitBy(s: OrbitState, dAzimuthDeg: number, dElevationDeg: number): OrbitState {
  if (!Number.isFinite(dAzimuthDeg) || !Number.isFinite(dElevationDeg)) return s;
  return quantiseOrbit({
    ...s,
    azimuthDeg: s.azimuthDeg + dAzimuthDeg,
    elevationDeg: s.elevationDeg + dElevationDeg,
  });
}

export function zoomBy(s: OrbitState, factor: number): OrbitState {
  if (!(Number.isFinite(factor) && factor > 0)) return s;
  return quantiseOrbit({ ...s, distance: s.distance * factor });
}

/** The default camera; the scene settings are not part of the orbit and stay as they are. */
export function resetOrbit(s: OrbitState): OrbitState {
  return { ...initialOrbit, baseFovDeg: s.baseFovDeg };
}

/**
 * The camera a view renders with. The EHT-style view frames the ring by its own rule
 * (ehtFieldOfView, at the image's aspect) and turns the image so north is up as for M87*; the
 * other views widen the requested field of view near the hole and have no roll.
 */
export function viewCamera(
  s: OrbitState,
  view: ViewMode = 'colour',
  aspect = 16 / 9,
): CameraParams {
  const base = { distance: s.distance, azimuthDeg: s.azimuthDeg, elevationDeg: s.elevationDeg };
  if (view === 'eht') {
    return { ...base, fovYDeg: ehtFieldOfView(s.distance, aspect), rollDeg: M87_SKY_ROLL_DEG };
  }
  return { ...base, fovYDeg: autoFieldOfView(s.distance, 1, s.baseFovDeg) };
}
