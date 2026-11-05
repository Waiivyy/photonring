// The README's gallery views and page states (tools/readme-views.ts): each printed hash opens the
// view on the page, the scenes are the page's, the images that match the unsupported page's are
// rendered with the same settings, the labels read at README size, and the caps and the accept
// step's file list hold.
import { describe, expect, it } from 'vitest';
import type { RenderSettings } from '../../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../../src/cpu-renderer/scenes.ts';
import { autoFieldOfView, ehtFieldOfView, M87_SKY_ROLL_DEG } from '../../src/physics/index.ts';
import { EHT_PRESET } from '../../src/ui/eht-legend.ts';
import { legendEntries } from '../../src/ui/legend-entries.ts';
import { legendLayout } from '../../src/ui/legend-layout.ts';
import { ORBIT_LIMITS, viewCamera } from '../../src/ui/orbit.ts';
import { parseHash } from '../../src/ui/url-state.ts';
import {
  acceptPlan,
  BUDGET_BYTES,
  GALLERY_IDS,
  GALLERY_MAX_BYTES,
  galleryHash,
  gallerySettings,
  galleryState,
  galleryView,
  mergeManifest,
  PAGE_IDS,
  PAGE_MAX_BYTES,
  pageHash,
  pageState,
  STRIP_MAX_BYTES,
  type ManifestEntry,
} from '../../tools/readme-views.ts';

describe('README gallery views', () => {
  it.each(GALLERY_IDS)('%s: the printed hash opens the view on the page', (id) => {
    const parsed = parseHash(`#${galleryHash(id)}`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.state).toEqual(galleryState(id));
    const g = galleryView(id);
    const s = gallerySettings(id);
    const { orbit, view } = parsed.state;
    if (g.page === 'exact') {
      // The page's camera at the image's aspect (the page's own is 16:9 or the window's).
      expect(s.camera).toEqual(viewCamera(orbit, view, g.width / g.height));
      expect(g.framing).toBeNull();
    } else {
      expect(s.camera).toEqual(viewCamera(orbit, g.framing!, g.width / g.height));
    }
    expect(s.mode).toBe(view);
    expect(s.disk !== null).toBe(parsed.state.disk);
  });

  it.each(GALLERY_IDS)('%s: within the distances the page allows', (id) => {
    const { distance } = galleryView(id).orbit;
    expect(distance).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDistance);
    expect(distance).toBeLessThanOrEqual(ORBIT_LIMITS.maxDistance);
  });

  it('renders the cameras of the design: G1 and G2 at the preset, the rest as listed', () => {
    const camera = (id: (typeof GALLERY_IDS)[number]) => gallerySettings(id).camera;
    const preset = { ...EHT_PRESET, fovYDeg: ehtFieldOfView(200, 16 / 9) };
    expect(camera('G1')).toEqual({ ...preset, rollDeg: M87_SKY_ROLL_DEG });
    // The same camera, framing and roll included, in physical colour.
    expect(camera('G2')).toEqual(camera('G1'));
    expect(gallerySettings('G2').mode).toBe('colour');
    const at = (distance: number, elevationDeg: number, fovYDeg = 60) => ({
      distance,
      azimuthDeg: 0,
      elevationDeg,
      fovYDeg,
    });
    expect(camera('G3')).toEqual(at(30, 2));
    expect(camera('G4')).toEqual(at(30, 90));
    expect(camera('G5')).toEqual(at(5, 12, autoFieldOfView(5, 1, 60)));
    expect(camera('G5').fovYDeg).toBeGreaterThan(60);
    expect(camera('G6')).toEqual(at(200, 12));
    expect(camera('G7')).toEqual(at(30, 12));
    expect(camera('G8')).toEqual(at(30, 12));
    expect(camera('G9')).toEqual(at(30, 90));
  });

  it("renders the page's scenes: stars, or a black sky in the EHT-style and strip views", () => {
    for (const id of GALLERY_IDS) {
      const s = gallerySettings(id);
      expect([s.M, s.exposure, s.toneMapping]).toEqual([1, 1, true]);
      expect(s.sky).toBe(s.mode === 'eht' || s.mode === 'subrings' ? 'black' : 'stars');
      expect(s.disk).toEqual(id === 'G8' ? null : GOLDEN_SCENES.diskInclined.disk);
    }
    expect(gallerySettings('G1').mode).toBe('eht');
    expect(gallerySettings('G7').mode).toBe('termination');
    expect(gallerySettings('G9').mode).toBe('subrings');
    // The strip's rays circle the hole up to six more half-turns: the strip tests' step budget.
    expect(gallerySettings('G9').maxSteps).toBe(8000);
  });

  it('sizes and caps: 640 x 360 with 3 x 3 samples; G1 2 x 2; G9 a wide strip with 2 x 2', () => {
    for (const id of GALLERY_IDS) {
      const s = gallerySettings(id);
      const g = galleryView(id);
      const size = [s.width, s.height, s.samplesPerAxis];
      if (id === 'G9') {
        expect(size).toEqual([1280, 720, 2]);
        expect(g.maxBytes).toBe(STRIP_MAX_BYTES);
      } else {
        expect(size).toEqual([640, 360, id === 'G1' ? 2 : 3]);
        expect(g.maxBytes).toBe(GALLERY_MAX_BYTES);
      }
      expect(g.file).toMatch(/^[A-Za-z0-9-]+\.png$/);
    }
    expect(new Set(GALLERY_IDS.map((id) => galleryView(id).file)).size).toBe(GALLERY_IDS.length);
    expect([GALLERY_MAX_BYTES, STRIP_MAX_BYTES, PAGE_MAX_BYTES, BUDGET_BYTES]).toEqual([
      200_000, 300_000, 300_000, 2_500_000,
    ]);
  });

  it("G4, G5 and G8 use exactly the unsupported page's scenes (tools/render-gallery.ts)", () => {
    const size = (s: RenderSettings): RenderSettings => ({
      ...s,
      width: 640,
      height: 360,
      samplesPerAxis: 3,
    });
    const inclined = GOLDEN_SCENES.diskInclined;
    const scenes = {
      G4: size(GOLDEN_SCENES.diskFaceOn),
      G5: size({
        ...inclined,
        camera: { ...inclined.camera, distance: 5, fovYDeg: autoFieldOfView(5, 1, 60) },
      }),
      G8: size(GOLDEN_SCENES.noDisk),
    } as const;
    for (const [id, scene] of Object.entries(scenes) as [keyof typeof scenes, RenderSettings][]) {
      expect(gallerySettings(id)).toEqual(scene);
      expect(galleryView(id).sameAs).toMatch(/^src\/ui\/gallery\/[A-Za-z0-9-]+\.png$/);
    }
    for (const id of GALLERY_IDS.filter((i) => !(i in scenes))) {
      expect(galleryView(id).sameAs).toBeNull();
    }
  });
});

describe('README gallery labels', () => {
  const labelled = GALLERY_IDS.filter((id) => galleryView(id).labels !== null);

  it('only G1 and G9 carry labels, drawn by the page composer', () => {
    expect(labelled).toEqual(['G1', 'G9']);
  });

  it.each(labelled)('%s: the legend fits at the chosen scale and reads at about 10 px', (id) => {
    const g = galleryView(id);
    const s = gallerySettings(id);
    const L = g.labels!;
    const entries = legendEntries([], g.view, { distance: s.camera.distance, disk: true });
    const box = legendLayout(L.width, L.height, entries, L.scale)!;
    // Not shrunk by the layout: the text is drawn at 12 CSS px times the chosen scale...
    expect(box.fontSize).toBeCloseTo(12 * L.scale, 12);
    // ...which is at least 10 CSS px where GitHub shows the image.
    expect((box.fontSize * L.shownWidth) / L.width).toBeGreaterThanOrEqual(10);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(L.height);
    expect(L.width).toBe(s.width);
  });

  it('G1: the legend sits on black below the render, not over the ring', () => {
    const g = galleryView('G1');
    const s = gallerySettings('G1');
    const L = g.labels!;
    const entries = legendEntries([], 'eht', { distance: s.camera.distance, disk: true });
    const box = legendLayout(L.width, L.height, entries, L.scale)!;
    expect(L.height).toBeGreaterThan(s.height);
    expect(box.y).toBeGreaterThanOrEqual(s.height);
  });

  it('G9: the strip fills the canvas, since its lines are drawn in canvas coordinates', () => {
    const s = gallerySettings('G9');
    const L = galleryView('G9').labels!;
    expect([L.width, L.height]).toEqual([s.width, s.height]);
  });
});

describe('README page states', () => {
  it.each(PAGE_IDS)('%s: the hash parses back to the state', (id) => {
    const parsed = parseHash(`#${pageHash(id)}`);
    expect(parsed.issues).toEqual([]);
    expect(parsed.state).toEqual(pageState(id).state);
    expect(pageState(id).maxBytes).toBe(PAGE_MAX_BYTES);
  });

  it('the states of the design', () => {
    expect(pageHash('P1')).toBe('v=1&r=30&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=0');
    expect(pageState('P2').state.overlays).toEqual(['edge', 'isco']);
    expect(pageState('P3').state.overlays).toEqual(['edge', 'horizon', 'photon', 'isco']);
    expect(pageState('P3').capture.kind).toBe('save');
    expect(pageState('P4').state.validationOpen).toBe(true);
    const p5 = pageState('P5').state;
    expect([p5.view, p5.orbit.distance, p5.orbit.azimuthDeg, p5.orbit.elevationDeg]).toEqual([
      'eht',
      EHT_PRESET.distance,
      EHT_PRESET.azimuthDeg,
      EHT_PRESET.elevationDeg,
    ]);
    const p6 = parseHash(`#${pageHash('P6')}`).state;
    expect([p6.view, p6.orbit.distance, p6.orbit.elevationDeg]).toEqual(['subrings', 30, 12]);
    for (const id of PAGE_IDS) {
      const p = pageState(id);
      const ratio = p.capture.kind === 'crop' ? 2 : 1;
      expect(p.deviceScaleFactor).toBe(ratio);
      expect(p.file).toMatch(/^[A-Za-z0-9-]+\.png$/);
    }
    expect(new Set(PAGE_IDS.map((id) => pageState(id).file)).size).toBe(PAGE_IDS.length);
  });
});

describe('README manifests and the accept step', () => {
  const entry = (id: string, file: string, bytes: number): ManifestEntry => ({
    id,
    file,
    title: id,
    bytes,
    sha256: `${id}-sha`,
    seconds: 1,
    pageHash: 'v=1',
    commit: 'abc',
    dirty: false,
    date: '2026-11-05T00:00:00.000Z',
    os: 'test',
    node: 'v25',
    chrome: null,
    settings: {},
  });

  it('merging replaces an entry with the same file and keeps the files in id order', () => {
    const a = mergeManifest(null, [entry('G3', 'c.png', 30), entry('G1', 'a.png', 10)]);
    expect(a.files.map((e) => e.id)).toEqual(['G1', 'G3']);
    expect(a.totalBytes).toBe(40);
    const b = mergeManifest(a, [entry('G2', 'b.png', 20), entry('G1', 'a.png', 15)]);
    expect(b.files.map((e) => [e.id, e.bytes])).toEqual([
      ['G1', 15],
      ['G2', 20],
      ['G3', 30],
    ]);
    expect(b.totalBytes).toBe(65);
  });

  it('accepts every image by default, or only the ids given, and refuses unknown ids', () => {
    const all = acceptPlan([]);
    expect(all.map((i) => i.id)).toEqual([...GALLERY_IDS, ...PAGE_IDS]);
    expect(acceptPlan(['P3', 'G1', 'G1'])).toEqual([
      {
        id: 'P3',
        from: 'artifacts/stage7/readme/page/overlays-saved.png',
        to: 'docs/images/page/overlays-saved.png',
        maxBytes: PAGE_MAX_BYTES,
      },
      {
        id: 'G1',
        from: 'artifacts/stage7/readme/gallery/eht-style.png',
        to: 'docs/images/gallery/eht-style.png',
        maxBytes: GALLERY_MAX_BYTES,
      },
    ]);
    expect(() => acceptPlan(['G10'])).toThrow(/unknown image ids: G10/);
    for (const i of all) {
      expect(i.to.startsWith('docs/images/gallery/') || i.to.startsWith('docs/images/page/')).toBe(
        true,
      );
    }
  });
});
