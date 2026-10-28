// The overlay layer: one SVG over the canvas whose viewBox is the canvas's CSS size, so line
// widths and dashes are CSS px at every distance, field of view, resolution and pixel ratio. It
// always follows the camera of the image last presented, so lines never run ahead of the image.
// The shadow edge is closed form and always live; ring curves are computed in time slices once
// the presented view has been still for the renderer's settle time, cached, and shown only when
// complete. Also owns the compact legend.
import type { CameraParams } from '../physics/index.ts';
import { el, svgEl } from './dom.ts';
import type { Lifecycle } from './lifecycle.ts';
import {
  edgeEllipse,
  pathData,
  ringCurveJob,
  type ImageOrder,
  type ImageView,
  type RingRadius,
  type TanCurve,
} from './overlay-geometry.ts';
import { HALO, OVERLAY_STYLES, type OverlayId } from './overlay-style.ts';
import { TERMINATION_LABELS, colourSwatch, lineSwatch, type TerminationKind } from './swatch.ts';

export interface OverlayFrame {
  /** Camera of the presented image, or null before the first one. */
  readonly camera: CameraParams | null;
  /** Internal image width over height. */
  readonly aspect: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly overlays: readonly OverlayId[];
  readonly termination: boolean;
  readonly controlsOpen: boolean;
}

export type RingsState = 'off' | 'pending' | 'ready';

/** Quiet time of the presented view before ring curves are computed (the renderer's settle). */
const SETTLE_MS = 120;
/** Main-thread time per animation frame given to the ring solver (half of a 60 Hz frame). */
const SLICE_MS = 8;
const CACHE_SIZE = 8;

const RINGS: Readonly<Partial<Record<OverlayId, readonly [RingRadius, ImageOrder][]>>> = {
  horizon: [[2, 0]],
  photon: [[3, 0]],
  isco: [
    [6, 0],
    [6, 1],
  ],
};

interface Job {
  readonly key: string;
  readonly cacheKey: string;
  readonly gen: Generator<void, TanCurve, void>;
}

export class OverlayLayer {
  readonly svg = svgEl('svg', { class: 'overlay', 'aria-hidden': 'true', focusable: 'false' });
  readonly legend = el('ul', { class: 'legend', 'aria-label': 'Legend', hidden: true });
  private readonly groups = new Map<OverlayId, SVGGElement>();
  /** What each group currently shows, so unchanged frames touch no DOM. */
  private readonly drawn = new Map<OverlayId, string>();
  private readonly cache = new Map<string, TanCurve>();
  private job: Job | null = null;
  private presentedKey = '';
  private keySince = 0;
  private legendKey = '';
  private viewBox = '';
  private state: RingsState = 'off';
  /** Main-thread ms spent on the rings of the current key, and of the last complete set. */
  private spent = 0;
  private lastRingMs = 0;
  private lastLatency = 0;
  private readyWaiters: (() => void)[] = [];
  private readonly now: () => number;

  constructor(life: Lifecycle, now: () => number = () => performance.now()) {
    this.now = now;
    life.onDispose(() => {
      this.job = null;
      this.readyWaiters = [];
    });
  }

  get ringsState(): RingsState {
    return this.state;
  }

  get ringMs(): number {
    return this.lastRingMs;
  }

  /** Wall-clock ms from the end of the settle time to the last computed rings being drawn. */
  get ringLatencyMs(): number {
    return this.lastLatency;
  }

  /** Path data of the visible overlays in an image box (for saved images). */
  paths(view: ImageView, frame: OverlayFrame): { id: OverlayId; order: number; d: string }[] {
    const out: { id: OverlayId; order: number; d: string }[] = [];
    if (!frame.camera) return out;
    const key = ringKey(frame);
    for (const id of frame.overlays) {
      for (const [R, order] of RINGS[id] ?? []) {
        const curve = this.cache.get(`${key}|${R}|${order}`);
        if (curve) out.push({ id, order, d: pathData(curve, view) });
      }
    }
    return out;
  }

  /** Called every animation frame. */
  update(frame: OverlayFrame): void {
    const vb = `0 0 ${frame.cssWidth} ${frame.cssHeight}`;
    if (vb !== this.viewBox) {
      this.svg.setAttribute('viewBox', vb);
      this.viewBox = vb;
    }
    this.updateLegend(frame);
    const camera = frame.camera;
    if (!camera) return;
    const view: ImageView = {
      width: frame.cssWidth,
      height: frame.cssHeight,
      aspect: frame.aspect,
      tanHalfFovY: Math.tan((camera.fovYDeg * Math.PI) / 360),
    };
    const key = ringKey(frame);
    const now = this.now();
    if (key !== this.presentedKey) {
      this.presentedKey = key;
      this.keySince = now;
      this.spent = 0;
      if (this.job && this.job.key !== key) this.job = null;
    }

    for (const id of Object.keys(OVERLAY_STYLES) as OverlayId[]) {
      if (!frame.overlays.includes(id)) this.removeGroup(id);
    }
    if (frame.overlays.includes('edge')) this.drawEdge(camera.distance, view);

    let missing: { cacheKey: string; R: RingRadius; order: ImageOrder } | null = null;
    let anyRing = false;
    for (const id of frame.overlays) {
      const rings = RINGS[id];
      if (!rings) continue;
      anyRing = true;
      const curves = rings.map(([R, order]) => this.cache.get(`${key}|${R}|${order}`) ?? null);
      if (curves.every((c) => c !== null)) {
        this.drawRing(id, key, view, curves);
      } else {
        this.pendingRing(id, key);
        const k = rings.findIndex((_, i) => curves[i] === null);
        const [R, order] = rings[k]!;
        missing ??= { cacheKey: `${key}|${R}|${order}`, R, order };
      }
    }

    if (!anyRing) this.setState('off');
    else if (!missing) {
      if (this.state !== 'ready' && this.spent > 0) {
        this.lastRingMs = this.spent;
        this.lastLatency = now - (this.keySince + SETTLE_MS);
      }
      this.setState('ready');
    } else {
      this.setState('pending');
      if (now - this.keySince >= SETTLE_MS) this.work(key, missing, camera, frame.aspect, view);
    }
  }

  /** Resolves once the enabled rings are drawn for the presented view (at once if none). */
  whenRingsSettled(): Promise<void> {
    if (this.state !== 'pending') return Promise.resolve();
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  private setState(s: RingsState): void {
    this.state = s;
    if (s !== 'pending' && this.readyWaiters.length > 0) {
      const waiters = this.readyWaiters;
      this.readyWaiters = [];
      for (const w of waiters) w();
    }
  }

  private work(
    key: string,
    missing: { cacheKey: string; R: RingRadius; order: ImageOrder },
    camera: CameraParams,
    aspect: number,
    view: ImageView,
  ): void {
    if (!this.job || this.job.cacheKey !== missing.cacheKey) {
      this.job = {
        key,
        cacheKey: missing.cacheKey,
        gen: ringCurveJob({
          rObs: camera.distance,
          elevationDeg: camera.elevationDeg,
          R: missing.R,
          order: missing.order,
          tanHalfFovY: view.tanHalfFovY,
          aspect,
        }),
      };
    }
    const start = this.now();
    const job = this.job;
    for (;;) {
      const r = job.gen.next();
      if (r.done) {
        this.store(job.cacheKey, r.value);
        this.job = null;
        break;
      }
      if (this.now() - start >= SLICE_MS) break;
    }
    this.spent += this.now() - start;
  }

  private store(cacheKey: string, curve: TanCurve): void {
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, curve);
    while (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
  }

  private group(id: OverlayId): SVGGElement {
    let g = this.groups.get(id);
    if (!g) {
      g = svgEl('g', { 'data-overlay': id, fill: 'none', 'stroke-linejoin': 'round' });
      this.groups.set(id, g);
      this.svg.append(g);
    }
    return g;
  }

  private removeGroup(id: OverlayId): void {
    this.groups.get(id)?.remove();
    this.groups.delete(id);
    this.drawn.delete(id);
  }

  private drawEdge(distance: number, view: ImageView): void {
    const e = edgeEllipse(distance, view);
    const sig = `${e.cx} ${e.cy} ${e.rx} ${e.ry}`;
    if (this.drawn.get('edge') === sig) return;
    const s = OVERLAY_STYLES.edge;
    const shape = (cls: string, stroke: string, width: number, opacity: number) =>
      svgEl('ellipse', {
        class: cls,
        cx: e.cx,
        cy: e.cy,
        rx: e.rx,
        ry: e.ry,
        stroke,
        'stroke-width': width,
        'stroke-opacity': opacity,
        'stroke-dasharray': s.dash.length > 0 ? s.dash.join(' ') : null,
      });
    this.group('edge').replaceChildren(
      shape('halo', '#000', s.width + HALO.extraWidth, HALO.alpha),
      shape('line', s.colour, s.width, 1),
    );
    this.drawn.set('edge', sig);
  }

  private drawRing(id: OverlayId, key: string, view: ImageView, curves: TanCurve[]): void {
    const sig = `${key}|${view.width}x${view.height}`;
    const g = this.group(id);
    g.setAttribute('data-state', 'ready');
    if (this.drawn.get(id) === sig) return;
    const s = OVERLAY_STYLES[id];
    const halos: SVGPathElement[] = [];
    const lines: SVGPathElement[] = [];
    curves.forEach((curve, order) => {
      const d = pathData(curve, view);
      const width = order === 0 ? s.width : (s.secondaryWidth ?? s.width);
      halos.push(
        svgEl('path', {
          class: 'halo',
          'data-order': order,
          d,
          stroke: '#000',
          'stroke-width': width + HALO.extraWidth,
          'stroke-opacity': HALO.alpha,
        }),
      );
      lines.push(
        svgEl('path', {
          class: 'line',
          'data-order': order,
          d,
          stroke: s.colour,
          'stroke-width': width,
          'stroke-dasharray': s.dash.length > 0 ? s.dash.join(' ') : null,
        }),
      );
    });
    g.replaceChildren(...halos, ...lines);
    this.drawn.set(id, sig);
  }

  private pendingRing(id: OverlayId, key: string): void {
    const sig = `pending|${key}`;
    if (this.drawn.get(id) === sig) return;
    const g = this.group(id);
    g.setAttribute('data-state', 'pending');
    g.replaceChildren();
    this.drawn.set(id, sig);
  }

  private updateLegend(frame: OverlayFrame): void {
    const show = (frame.overlays.length > 0 || frame.termination) && !frame.controlsOpen;
    const sig = show ? `${frame.overlays.join(',')}|${frame.termination}` : 'hidden';
    if (sig === this.legendKey) return;
    this.legendKey = sig;
    this.legend.hidden = !show;
    if (!show) return;
    const items: HTMLLIElement[] = frame.overlays.map((id) =>
      el('li', {}, lineSwatch(OVERLAY_STYLES[id]), el('span', {}, OVERLAY_STYLES[id].label)),
    );
    if (frame.termination) {
      for (const k of Object.keys(TERMINATION_LABELS) as TerminationKind[]) {
        items.push(el('li', {}, colourSwatch(k), el('span', {}, TERMINATION_LABELS[k])));
      }
    }
    this.legend.replaceChildren(...items);
  }
}

/** Ring curves depend on the distance, the elevation and the viewport in tan units. */
function ringKey(frame: OverlayFrame): string {
  const c = frame.camera;
  return c ? `${c.distance}|${c.elevationDeg}|${c.fovYDeg}|${frame.aspect}` : '';
}
