// Shadow size measured on a validation render (disk off, uniform sky, no tone mapping, one
// sample per pixel): count the black pixels, treat them as a disc centred on the image centre,
// and convert its radius to an angle through the pinhole projection. A cone of half-angle psi
// around the optical axis images to a circle of radius tan(psi) / tan(fov/2) half-heights.
import { coneAngleFromImageRadius } from '../physics/index.ts';
import type { RenderOutput, RenderSettings } from './render.ts';

export interface ShadowMeasurement {
  /** Equivalent radius of the black region, in pixels: sqrt(area / pi). */
  readonly radiusPx: number;
  /** Corresponding angular radius from the image centre, radians. */
  readonly angularRadius: number;
  /** True if the black region reaches the image border, making the measurement invalid. */
  readonly touchesBorder: boolean;
}

export function measureShadowRadius(out: RenderOutput, s: RenderSettings): ShadowMeasurement {
  let area = 0;
  let touchesBorder = false;
  for (let j = 0; j < out.height; j++) {
    for (let i = 0; i < out.width; i++) {
      const p = (j * out.width + i) * 3;
      const black = out.linear[p] === 0 && out.linear[p + 1] === 0 && out.linear[p + 2] === 0;
      if (!black) continue;
      area++;
      if (i === 0 || j === 0 || i === out.width - 1 || j === out.height - 1) touchesBorder = true;
    }
  }
  const radiusPx = Math.sqrt(area / Math.PI);
  const tanHalfFovY = Math.tan((s.camera.fovYDeg * Math.PI) / 360);
  return {
    radiusPx,
    angularRadius: coneAngleFromImageRadius(radiusPx, s.height, tanHalfFovY),
    touchesBorder,
  };
}
