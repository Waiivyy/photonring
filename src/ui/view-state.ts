// Everything a shared link describes: the camera and the scene toggles. Pure, DOM-free.
import { initialOrbit, type OrbitState } from './orbit.ts';
import { OVERLAY_IDS, type OverlayId } from './overlay-style.ts';

export type ViewMode = 'colour' | 'termination';

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
