// Everything a shared link describes: the camera and the scene toggles. Pure, DOM-free.
import { initialOrbit, type OrbitState } from './orbit.ts';
import { OVERLAY_IDS, type OverlayId } from './overlay-style.ts';

/** The views, in canonical order: the URL parser, the Controls panel and the tests use it. */
export const VIEW_MODES = ['colour', 'termination'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** Name of each view in the Controls panel and in announcements. */
export const VIEW_NAMES: Readonly<Record<ViewMode, string>> = {
  colour: 'Colour',
  termination: 'Termination (debug)',
};

export function isViewMode(v: string): v is ViewMode {
  return (VIEW_MODES as readonly string[]).includes(v);
}

/** The view a view key or button leads to: its view, or colour when that view is shown. */
export function toggledView(current: ViewMode, mode: ViewMode): ViewMode {
  return current === mode ? 'colour' : mode;
}

export interface ViewState {
  readonly orbit: OrbitState;
  readonly disk: boolean;
  readonly antialias: boolean;
  readonly view: ViewMode;
  /** Enabled overlays, unique and in canonical order. */
  readonly overlays: readonly OverlayId[];
  readonly validationOpen: boolean;
}

export const DEFAULT_VIEW: ViewState = {
  orbit: initialOrbit,
  disk: true,
  antialias: true,
  view: 'colour',
  overlays: [],
  validationOpen: false,
};

/** The given overlays, unique and in canonical order. */
export function canonicalOverlays(ids: Iterable<OverlayId>): OverlayId[] {
  const set = new Set(ids);
  return OVERLAY_IDS.filter((id) => set.has(id));
}

export function toggleOverlay(s: ViewState, id: OverlayId): ViewState {
  const on = s.overlays.includes(id);
  return {
    ...s,
    overlays: canonicalOverlays(on ? s.overlays.filter((o) => o !== id) : [...s.overlays, id]),
  };
}
