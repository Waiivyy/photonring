// Orbit camera state for the controls: pure updates with clamping and wrapping, rounded to the
// precision of the URL. Pointer, wheel, pinch, keyboard and button input all go through these.
import { autoFieldOfView, type CameraParams } from '../physics/index.ts';
import { ORBIT_LIMITS, quantiseOrbit } from './quantise.ts';

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

export function viewCamera(s: OrbitState): CameraParams {
  return {
    distance: s.distance,
    azimuthDeg: s.azimuthDeg,
    elevationDeg: s.elevationDeg,
    fovYDeg: autoFieldOfView(s.distance, 1, s.baseFovDeg),
  };
}
