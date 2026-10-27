// One table for the overlays: drawn lines, legend swatches, saved images, the About text and the
// contrast test all read it. Okabe-Ito colours, each with its own dash pattern, so colour is
// never the only cue, and a dark halo under every line so it reads on the bright disk too.

export type OverlayId = 'edge' | 'horizon' | 'photon' | 'isco';

/** Canonical order: also the order in the URL, the Controls panel and the legends. */
export const OVERLAY_IDS: readonly OverlayId[] = ['edge', 'horizon', 'photon', 'isco'];

export interface OverlayStyle {
  readonly id: OverlayId;
  /** Keyboard shortcut, upper case. */
  readonly key: string;
  readonly label: string;
  readonly colour: string;
  /** Dash and gap lengths in CSS px; empty for a solid line. */
  readonly dash: readonly number[];
  /** Line width in CSS px, and the width of the secondary (n = 1) image where one is drawn. */
  readonly width: number;
  readonly secondaryWidth?: number;
  readonly legend: string;
}

export const OVERLAY_STYLES: Readonly<Record<OverlayId, OverlayStyle>> = {
  edge: {
    id: 'edge',
    key: 'E',
    label: 'Shadow edge',
    colour: '#56b4e9',
    dash: [],
    width: 1.5,
    legend:
      'Shadow edge: rays aimed inside it fall into the black hole. It is also the apparent ' +
      'outline of both the event horizon and the photon sphere, because every ray inside it ' +
      'reaches both.',
  },
  horizon: {
    id: 'horizon',
    key: 'H',
    label: 'Horizon ring',
    colour: '#cc79a7',
    dash: [2, 3],
    width: 1.5,
    legend:
      'Horizon ring: where the circle r = 2M in the disk plane appears through bent light ' +
      "(direct image). For a disk reaching the horizon this would be the edge of the 'inner " +
      "shadow'; this disk stops at the ISCO, so no brightness edge appears here.",
  },
  photon: {
    id: 'photon',
    key: 'P',
    label: 'Photon sphere ring',
    colour: '#f0e442',
    dash: [6, 3],
    width: 1.5,
    legend:
      'Photon sphere ring: where the circle r = 3M in the disk plane appears through bent ' +
      'light (direct image).',
  },
  isco: {
    id: 'isco',
    key: 'I',
    label: 'ISCO ring',
    colour: '#009e73',
    dash: [10, 4],
    width: 1.5,
    secondaryWidth: 1,
    legend:
      'ISCO ring: where the circle r = 6M in the disk plane appears: the direct image ' +
      '(thicker) and the image of light that passed behind the hole (thinner). With the disk ' +
      "on, these are the inner edges of the disk's two images.",
  },
};

/** Solid halo under each line: black at this opacity, this much wider than the line. */
export const HALO = { rgb: [0, 0, 0] as [number, number, number], alpha: 0.85, extraWidth: 2.5 };

export const OVERLAY_NOTE = 'Lines are drawn even where the disk hides that part of the ring.';

export const TERMINATION_LEGEND =
  'Blue: escaped. Black: captured (crossed r = 3M moving inward, which is exact: such rays ' +
  'never return). Magenta: step limit (1000 steps) reached, which should not happen; please ' +
  'report it. The disk is ignored in this view.';
