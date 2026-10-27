// Canonical scenes for golden images and validation renders.
import { autoFieldOfView, DEFAULT_DISK } from '../physics/index.ts';
import type { RenderSettings } from './render.ts';

export { DEFAULT_DISK };

const base: RenderSettings = {
  width: 160,
  height: 90,
  M: 1,
  camera: { distance: 30, azimuthDeg: 0, elevationDeg: 12, fovYDeg: 60 },
  disk: DEFAULT_DISK,
  sky: 'stars',
  mode: 'colour',
  samplesPerAxis: 2,
  dphi: 0.0125,
  maxSteps: 4000,
  exposure: 1,
  toneMapping: true,
};

/** The four Stage 1 reference images, small enough to keep as goldens in the repository. */
export const GOLDEN_SCENES = {
  flatSpace: { ...base, M: 0, disk: null },
  noDisk: { ...base, disk: null },
  diskFaceOn: { ...base, camera: { ...base.camera, elevationDeg: 90 } },
  diskInclined: base,
} satisfies Record<string, RenderSettings>;

/**
 * Validation render for the shadow size: no disk, uniform sky of radiance 1, no tone mapping,
 * one sample at each pixel centre, and the automatic field of view so the shadow fits.
 */
export function validationScene(distance: number, width: number, height: number): RenderSettings {
  return {
    ...base,
    width,
    height,
    camera: { ...base.camera, distance, fovYDeg: autoFieldOfView(distance, 1, 60) },
    disk: null,
    sky: 'uniform',
    samplesPerAxis: 1,
    toneMapping: false,
  };
}
