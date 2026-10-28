// The views and sizes of the README image and the social preview, rendered by the CPU reference
// renderer (tools/render-hero.ts). Pure, so tests/unit/hero-views.test.ts can check them without
// rendering: each view is an orbit the page can show, rendered with the page's scene.
import type { RenderSettings } from '../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../src/cpu-renderer/scenes.ts';
import { initialOrbit, viewCamera, type OrbitState } from '../src/ui/orbit.ts';
import { quantiseOrbit } from '../src/ui/quantise.ts';
import { formatHash } from '../src/ui/url-state.ts';
import { DEFAULT_VIEW } from '../src/ui/view-state.ts';

const view = (distance: number, elevationDeg: number): OrbitState =>
  quantiseOrbit({ ...initialOrbit, distance, azimuthDeg: 0, elevationDeg });

/** Candidate views, in the order of their files (01 to 04). */
export const VIEWS = {
  default: view(30, 12),
  'edge-on': view(30, 2),
  'close-5M': view(5, 20),
  'wide-60M': view(60, 8),
} satisfies Record<string, OrbitState>;

export type ViewName = keyof typeof VIEWS;

/** The view in docs/images/hero.png: the page's opening view, until the owner picks another. */
export const HERO_VIEW: ViewName = 'default';

export interface ImageSize {
  readonly width: number;
  readonly height: number;
  /** The script refuses to write a larger file: git keeps every version. */
  readonly maxBytes: number;
  readonly path: string;
}

export const HERO: ImageSize = {
  width: 1600,
  height: 900,
  maxBytes: 600_000,
  path: 'docs/images/hero.png',
};

/** GitHub's recommended social preview size; under its 1 MB limit. */
export const SOCIAL: ImageSize = {
  width: 1280,
  height: 640,
  maxBytes: 999_999,
  path: 'public/social-preview.png',
};

export const viewOrbit = (name: ViewName): OrbitState => VIEWS[name];

/** The page's scene (src/ui/app.ts: star sky, exposure 1, tone mapping, the default disk). */
export function heroSettings(name: ViewName, size: ImageSize): RenderSettings {
  return {
    ...GOLDEN_SCENES.diskInclined,
    camera: viewCamera(viewOrbit(name)),
    width: size.width,
    height: size.height,
    samplesPerAxis: 3,
  };
}

/** The URL hash that opens the view on the page (without the leading #). */
export const viewHash = (name: ViewName): string =>
  formatHash({ ...DEFAULT_VIEW, orbit: viewOrbit(name) });
