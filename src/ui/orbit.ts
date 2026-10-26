// Orbit camera state for the controls: pure updates with clamping and wrapping. Pointer, wheel,
// pinch and keyboard input all go through these functions.
import { autoFieldOfView, type CameraParams } from '../physics/index.ts';

export interface OrbitState {
  readonly distance: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  /** Requested vertical field of view; widened automatically near the hole. */
  readonly baseFovDeg: number;
}

export const ORBIT_LIMITS = { minDistance: 5, maxDistance: 200 } as const;

export const initialOrbit: OrbitState = {
  distance: 30,
  azimuthDeg: 0,
  elevationDeg: 12,
  baseFovDeg: 60,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function orbitBy(s: OrbitState, dAzimuthDeg: number, dElevationDeg: number): OrbitState {
  if (!Number.isFinite(dAzimuthDeg) || !Number.isFinite(dElevationDeg)) return s;
  return {
    ...s,
    azimuthDeg: (((s.azimuthDeg + dAzimuthDeg) % 360) + 360) % 360,
    elevationDeg: clamp(s.elevationDeg + dElevationDeg, -90, 90),
  };
}

export function zoomBy(s: OrbitState, factor: number): OrbitState {
  if (!(Number.isFinite(factor) && factor > 0)) return s;
  return {
    ...s,
    distance: clamp(s.distance * factor, ORBIT_LIMITS.minDistance, ORBIT_LIMITS.maxDistance),
  };
}

export function viewCamera(s: OrbitState): CameraParams {
  return {
    distance: s.distance,
    azimuthDeg: s.azimuthDeg,
    elevationDeg: s.elevationDeg,
    fovYDeg: autoFieldOfView(s.distance, 1, s.baseFovDeg),
  };
}
