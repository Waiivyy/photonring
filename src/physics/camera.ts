// Static-observer camera: a position on a sphere around the hole, looking at it, and the pinhole
// mapping from pixels to view directions in the observer's local frame. Shared by both renderers.
import { shadowAngularRadius, type Vec3 } from './observer.ts';

export interface CameraParams {
  /** Observer radius r_o, in units of M. */
  readonly distance: number;
  readonly azimuthDeg: number;
  /** Angle above the disk (equatorial) plane, -90 to 90. */
  readonly elevationDeg: number;
  /** Vertical field of view, strictly between 0 and 180. */
  readonly fovYDeg: number;
}

/** Camera position and orthonormal basis; right = forward x up, so up x right = forward. */
export interface CameraFrame {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly tanHalfFovY: number;
}

const DEG = Math.PI / 180;

/** Largest field of view the automatic widening may choose, in degrees. */
export const MAX_AUTO_FOV_DEG = 120;
/** Largest shadow radius allowed, as a fraction of the image half-height. */
export const MAX_SHADOW_FRACTION = 0.6;

export function cameraFrame(p: CameraParams, M = 1): CameraFrame {
  const finite = [p.distance, p.azimuthDeg, p.elevationDeg, p.fovYDeg].every(Number.isFinite);
  if (!finite) throw new RangeError('camera parameters must be finite numbers');
  if (!(p.distance > 2 * M)) throw new RangeError(`camera must be outside the horizon`);
  if (Math.abs(p.elevationDeg) > 90) throw new RangeError('elevation must be within [-90, 90]');
  if (!(p.fovYDeg > 0 && p.fovYDeg < 180)) throw new RangeError('fov must be in (0, 180)');

  const az = p.azimuthDeg * DEG;
  const el = p.elevationDeg * DEG;
  const ce = Math.cos(el);
  const se = Math.sin(el);
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const outward: Vec3 = [ce * ca, ce * sa, se];
  // up is the derivative of the position with respect to elevation: defined at the poles too.
  const up: Vec3 = [-se * ca, -se * sa, ce];
  const forward: Vec3 = [-outward[0], -outward[1], -outward[2]];
  const right: Vec3 = [
    forward[1] * up[2] - forward[2] * up[1],
    forward[2] * up[0] - forward[0] * up[2],
    forward[0] * up[1] - forward[1] * up[0],
  ];
  return {
    position: [p.distance * outward[0], p.distance * outward[1], p.distance * outward[2]],
    forward,
    right,
    up,
    tanHalfFovY: Math.tan((p.fovYDeg * DEG) / 2),
  };
}

/**
 * Unit view direction through image point (x, y), in pixels from the top-left corner of a
 * width x height image. Directions depend only on x/width and y/height, so the device pixel
 * ratio does not change them.
 */
export function pixelDirection(
  frame: CameraFrame,
  width: number,
  height: number,
  x: number,
  y: number,
): Vec3 {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new RangeError('image size must be positive and finite');
  }
  const sx = ((2 * x) / width - 1) * (width / height) * frame.tanHalfFovY;
  const sy = (1 - (2 * y) / height) * frame.tanHalfFovY;
  const { forward: f, right: r, up: u } = frame;
  const d: Vec3 = [
    f[0] + sx * r[0] + sy * u[0],
    f[1] + sx * r[1] + sy * u[1],
    f[2] + sx * r[2] + sy * u[2],
  ];
  const n = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / n, d[1] / n, d[2] / n];
}

/**
 * Vertical field of view that keeps the shadow radius at most MAX_SHADOW_FRACTION of the image
 * half-height: never narrower than the requested one, never wider than MAX_AUTO_FOV_DEG.
 */
export function autoFieldOfView(rObs: number, M: number, baseFovDeg: number): number {
  const shadow = shadowAngularRadius(rObs, M);
  if (shadow >= Math.PI / 2) return MAX_AUTO_FOV_DEG;
  const needed = (2 * Math.atan(Math.tan(shadow) / MAX_SHADOW_FRACTION)) / DEG;
  return Math.min(MAX_AUTO_FOV_DEG, Math.max(baseFovDeg, needed));
}
