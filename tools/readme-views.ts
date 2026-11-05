// The README's gallery views and page states: what each image shows, its size, its byte cap and
// the page hash that opens it. The gallery is rendered by the CPU reference renderer
// (tools/render-readme.ts; G1 and G9, which carry labels, by tests/gallery/readme.spec.ts with the
// page's own saved-image composer); the page states are captured from the running page by the same
// spec. Pure, so tests/unit/readme-views.test.ts can check it without rendering or a browser.
import type { RenderSettings } from '../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../src/cpu-renderer/scenes.ts';
import { EHT_PRESET } from '../src/ui/eht-legend.ts';
import { initialOrbit, viewCamera, type OrbitState } from '../src/ui/orbit.ts';
import type { OverlayId } from '../src/ui/overlay-style.ts';
import { quantiseOrbit } from '../src/ui/quantise.ts';
import { formatHash } from '../src/ui/url-state.ts';
import { DEFAULT_VIEW, type ViewMode, type ViewState } from '../src/ui/view-state.ts';

/** Per-file caps: git keeps every version of every image, so the tools refuse larger files. */
export const GALLERY_MAX_BYTES = 200_000;
export const STRIP_MAX_BYTES = 300_000;
export const PAGE_MAX_BYTES = 300_000;
/** All new README images together (docs/DESIGN.md plan for Stage 7). */
export const BUDGET_BYTES = 2_500_000;

/** Where the tools write, and where tools/accept-readme.ts copies approved files to. */
export const OUT = {
  gallery: 'artifacts/stage7/readme/gallery/',
  page: 'artifacts/stage7/readme/page/',
} as const;
export const DOCS = { gallery: 'docs/images/gallery/', page: 'docs/images/page/' } as const;
export const MANIFEST = 'manifest.json';

/** Width at which GitHub shows the images: a cell of the two-column table, or the full column. */
export const CELL_WIDTH_CSS = 390;
export const COLUMN_WIDTH_CSS = 838;

const orbit = (distance: number, elevationDeg: number, azimuthDeg = 0): OrbitState =>
  quantiseOrbit({ ...initialOrbit, distance, azimuthDeg, elevationDeg });

/** The EHT preset's orbit (the page's "Tilt 17°, as for M87*" button keeps the requested fov). */
const PRESET = orbit(EHT_PRESET.distance, EHT_PRESET.elevationDeg, EHT_PRESET.azimuthDeg);

/**
 * Labels drawn by composeImage (src/ui/screenshot.ts) into a canvas of `width` x `height` with the
 * render at its top left. `scale` is the composer's internal pixels per CSS px, chosen so the
 * legend text is about 10 CSS px where GitHub shows the image (`shownWidth`).
 */
export interface GalleryLabels {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly shownWidth: number;
}

export interface GalleryView {
  readonly file: string;
  readonly title: string;
  readonly orbit: OrbitState;
  readonly view: ViewMode;
  /** The view whose camera rule frames the image, if not its own (G2: the EHT-style view's). */
  readonly framing: ViewMode | null;
  readonly disk: boolean;
  readonly width: number;
  readonly height: number;
  readonly samplesPerAxis: number;
  readonly maxBytes: number;
  /** Composed in the page with its labels (tests/gallery/readme.spec.ts), or null: plain render. */
  readonly labels: GalleryLabels | null;
  /**
   * 'exact': the hash opens the same camera on the page (at the page's own size); 'orbit': the
   * same camera position, but the page frames it its own way.
   */
  readonly page: 'exact' | 'orbit';
  /** The committed image of the unsupported-browser page made with the same settings, if any. */
  readonly sameAs: string | null;
}

const colour = (o: OrbitState) => ({
  orbit: o,
  view: 'colour' as ViewMode,
  framing: null,
  disk: true,
  width: 640,
  height: 360,
  samplesPerAxis: 3,
  maxBytes: GALLERY_MAX_BYTES,
  labels: null,
  page: 'exact' as const,
  sameAs: null,
});

/** The gallery, in README order. */
export const GALLERY = {
  G1: {
    ...colour(PRESET),
    file: 'eht-style.png',
    title: 'EHT-style view at the preset (false colour, blurred)',
    view: 'eht',
    samplesPerAxis: 2,
    // At 640 px wide the legend needs most of the width to be readable in a 390 px cell, so it
    // sits on black below the 640 x 360 render instead of over the ring (the view's background
    // is black, afmhot(0)). Scale 1.38: 16.6 px text, about 10 CSS px at 390.
    labels: { scale: 1.38, width: 640, height: 640, shownWidth: CELL_WIDTH_CSS },
  },
  G2: {
    ...colour(PRESET),
    file: 'eht-camera-colour.png',
    title: "The EHT-style view's camera (framing and roll) in the colour view",
    framing: 'eht',
    page: 'orbit',
  },
  G3: { ...colour(orbit(30, 2)), file: 'edge-on-2deg.png', title: 'Nearly edge-on, 30 M, 2°' },
  G4: {
    ...colour(orbit(30, 90)),
    file: 'face-on.png',
    title: 'Face-on, 30 M',
    sameAs: 'src/ui/gallery/disk-face-on.png',
  },
  G5: {
    ...colour(orbit(5, 12)),
    file: 'close-5M.png',
    title: 'Close camera, 5 M, automatic field of view',
    sameAs: 'src/ui/gallery/close-up-5M.png',
  },
  G6: { ...colour(orbit(200, 12)), file: 'far-200M.png', title: 'Far camera, 200 M' },
  G7: {
    ...colour(orbit(30, 12)),
    file: 'termination.png',
    title: 'Termination view, 30 M',
    view: 'termination',
  },
  G8: {
    ...colour(orbit(30, 12)),
    file: 'no-disk.png',
    title: 'No disk: shadow and lensed stars, 30 M',
    disk: false,
    sameAs: 'src/ui/gallery/shadow-and-stars.png',
  },
  G9: {
    ...colour(orbit(30, 90)),
    file: 'subrings-strip.png',
    title: 'Photon subring strip, face-on, 30 M',
    view: 'subrings',
    width: 1280,
    height: 720,
    samplesPerAxis: 2,
    maxBytes: STRIP_MAX_BYTES,
    // Scale 1.3: 15.6 px text, about 10 CSS px at 838. The legend covers the lower right; face-on
    // every column of the strip is the same, so it hides no band.
    labels: { scale: 1.3, width: 1280, height: 720, shownWidth: COLUMN_WIDTH_CSS },
  },
} satisfies Record<string, GalleryView>;

export type GalleryId = keyof typeof GALLERY;
export const GALLERY_IDS = Object.keys(GALLERY) as GalleryId[];

export const galleryView = (id: GalleryId): GalleryView => GALLERY[id];

/**
 * The page's scene for the view (src/ui/app.ts): star sky in the colour and termination views,
 * black in the EHT-style and subring views, exposure 1, tone mapping, the default disk, and the
 * camera viewCamera gives at the image's aspect (the EHT-style view's framing and roll included).
 * The strip gets the step budget of the strip tests (tests/unit/strip.test.ts): its rays circle
 * the hole up to six more half-turns.
 */
export function gallerySettings(id: GalleryId): RenderSettings {
  const g = galleryView(id);
  const base = GOLDEN_SCENES.diskInclined;
  return {
    ...base,
    camera: viewCamera(g.orbit, g.framing ?? g.view, g.width / g.height),
    width: g.width,
    height: g.height,
    samplesPerAxis: g.samplesPerAxis,
    disk: g.disk ? base.disk : null,
    mode: g.view,
    sky: g.view === 'eht' || g.view === 'subrings' ? 'black' : 'stars',
    maxSteps: g.view === 'subrings' ? 8000 : base.maxSteps,
  };
}

/** The page state that shows the view. */
export const galleryState = (id: GalleryId): ViewState => {
  const g = galleryView(id);
  return { ...DEFAULT_VIEW, orbit: g.orbit, view: g.view, disk: g.disk };
};

/** The URL hash that opens the view on the page (without the leading #). */
export const galleryHash = (id: GalleryId): string => formatHash(galleryState(id));

/** Capture of a page state: the whole page, a crop of one panel, or the page's Save image. */
export type PageCapture =
  | { readonly kind: 'page' }
  | {
      readonly kind: 'crop';
      readonly selector: string;
      /** Toolbar button to press first (exact accessible name), if the hash does not open it. */
      readonly open: string | null;
      /** Text in an element that must lie wholly inside the crop (the first match). */
      readonly mustShow: string;
    }
  | { readonly kind: 'save' };

export interface PageState {
  readonly file: string;
  readonly title: string;
  readonly state: ViewState;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly capture: PageCapture;
  readonly maxBytes: number;
}

const ALL_OVERLAYS: readonly OverlayId[] = ['edge', 'horizon', 'photon', 'isco'];
const WIDE = { width: 960, height: 540 } as const;
/** The Validation panel needs more than 540 px to show its Result row. */
const TALL = { width: 960, height: 900 } as const;
const state = (patch: Partial<ViewState>): ViewState => ({ ...DEFAULT_VIEW, ...patch });

/** The page screenshots, in README order. */
export const PAGE = {
  P1: {
    file: 'default-view.png',
    title: 'Default view with the toolbar and status lines',
    state: state({}),
    viewport: WIDE,
    deviceScaleFactor: 1,
    capture: { kind: 'page' },
    maxBytes: PAGE_MAX_BYTES,
  },
  P2: {
    file: 'controls-panel.png',
    title: 'The Controls panel',
    state: state({ overlays: ['edge', 'isco'] }),
    // The panel scrolls (1825 CSS px of content at 960 px wide) and is 160 px shorter than the
    // window: at 924 px it ends in the gap after the EHT-style view's preset, not mid-paragraph.
    viewport: { width: 960, height: 924 },
    deviceScaleFactor: 2,
    capture: {
      kind: 'crop',
      selector: '#controls-panel',
      open: 'Controls',
      mustShow: 'Puts the camera 200 M away',
    },
    maxBytes: PAGE_MAX_BYTES,
  },
  P3: {
    file: 'overlays-saved.png',
    title: "Overlays on, from the page's Save image",
    state: state({ overlays: ALL_OVERLAYS }),
    // The saved image is the internal image: at 960 x 540 it was 349,483 bytes, over the cap.
    viewport: { width: 800, height: 450 },
    deviceScaleFactor: 1,
    capture: { kind: 'save' },
    maxBytes: PAGE_MAX_BYTES,
  },
  P4: {
    file: 'validation-panel.png',
    title: 'The Validation panel with a result',
    state: state({ validationOpen: true }),
    viewport: TALL,
    deviceScaleFactor: 2,
    capture: {
      kind: 'crop',
      selector: '#validation-panel',
      open: null,
      mustShow: 'Within tolerance',
    },
    maxBytes: PAGE_MAX_BYTES,
  },
  P5: {
    file: 'eht-view.png',
    title: 'The EHT-style view with its legend',
    state: state({ orbit: PRESET, view: 'eht' }),
    viewport: WIDE,
    deviceScaleFactor: 1,
    capture: { kind: 'page' },
    maxBytes: PAGE_MAX_BYTES,
  },
  P6: {
    file: 'subrings-view.png',
    title: 'The photon subring view in the default camera',
    state: state({ view: 'subrings' }),
    viewport: WIDE,
    deviceScaleFactor: 1,
    capture: { kind: 'page' },
    maxBytes: PAGE_MAX_BYTES,
  },
} satisfies Record<string, PageState>;

export type PageId = keyof typeof PAGE;
export const PAGE_IDS = Object.keys(PAGE) as PageId[];

export const pageState = (id: PageId): PageState => PAGE[id];
export const pageHash = (id: PageId): string => formatHash(pageState(id).state);

/** One image in a manifest. */
export interface ManifestEntry {
  readonly id: string;
  readonly file: string;
  readonly title: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly seconds: number;
  readonly pageHash: string;
  readonly commit: string;
  /** Whether the working tree had uncommitted changes when the image was made. */
  readonly dirty: boolean;
  readonly date: string;
  readonly os: string;
  readonly node: string;
  /** Chrome's version when the browser drew any part of the image, else null. */
  readonly chrome: string | null;
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface Manifest {
  readonly files: readonly ManifestEntry[];
  readonly totalBytes: number;
}

/**
 * The manifest after adding `entries` to `old`: an entry replaces the one with the same file, and
 * the files stay in the order of their ids. The CPU tool and the browser spec write into the same
 * gallery folder, each with its own files.
 */
export function mergeManifest(old: Manifest | null, entries: readonly ManifestEntry[]): Manifest {
  const byFile = new Map((old?.files ?? []).map((e) => [e.file, e]));
  for (const e of entries) byFile.set(e.file, e);
  const files = [...byFile.values()].sort((a, b) =>
    a.id.localeCompare(b.id, 'en', { numeric: true }),
  );
  return { files, totalBytes: files.reduce((sum, e) => sum + e.bytes, 0) };
}

/** A file that may be copied into docs/images/ by tools/accept-readme.ts. */
export interface AcceptItem {
  readonly id: GalleryId | PageId;
  readonly from: string;
  readonly to: string;
  readonly maxBytes: number;
}

/**
 * The files to accept: every gallery image and page screenshot, or only the ids given (G1 to G9,
 * P1 to P6). Throws on an unknown id, so a typo copies nothing.
 */
export function acceptPlan(ids: readonly string[]): AcceptItem[] {
  const isGallery = (id: string): id is GalleryId => Object.hasOwn(GALLERY, id);
  const isPage = (id: string): id is PageId => Object.hasOwn(PAGE, id);
  const unknown = ids.filter((id) => !isGallery(id) && !isPage(id));
  if (unknown.length > 0) {
    throw new Error(`unknown image ids: ${unknown.join(', ')} (expected G1 to G9 or P1 to P6)`);
  }
  const wanted = ids.length === 0 ? [...GALLERY_IDS, ...PAGE_IDS] : [...new Set(ids)];
  return wanted.map((id) => {
    if (isGallery(id)) {
      const g = galleryView(id);
      return {
        id,
        from: `${OUT.gallery}${g.file}`,
        to: `${DOCS.gallery}${g.file}`,
        maxBytes: g.maxBytes,
      };
    }
    const p = pageState(id as PageId);
    return {
      id: id as PageId,
      from: `${OUT.page}${p.file}`,
      to: `${DOCS.page}${p.file}`,
      maxBytes: p.maxBytes,
    };
  });
}
