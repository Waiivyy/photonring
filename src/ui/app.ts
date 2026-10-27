// The interactive page: canvas, orbit controls, progressive rendering within a frame budget
// (reduced resolution while the view changes, then full resolution and anti-aliasing), a small
// timing readout, and recovery from device loss. Every listener, timer and animation frame the
// page creates belongs to one lifecycle, released when the renderer restarts.
import { initWebGpu } from '../gpu/device.ts';
import { ProgressiveRenderer, type FrameAction } from '../gpu/host/progressive.ts';
import { chooseInternalResolution, type Resolution } from '../gpu/host/resolution.ts';
import { GpuRenderer, TILE_SIZE } from '../gpu/renderer.ts';
import { DEFAULT_DISK, type CameraParams } from '../physics/index.ts';
import { createAnnouncer, type Announcer } from './announcer.ts';
import { createControlsPanel, type ControlsPanel, type SceneToggle } from './controls-panel.ts';
import { cameraSentence, sceneSummary } from './describe.ts';
import { el } from './dom.ts';
import { bindCanvasInput } from './input.ts';
import { KEYMAP, ariaKeyshortcuts, keyAction, type Action } from './keymap.ts';
import { createLifecycle, type Lifecycle } from './lifecycle.ts';
import { orbitBy, resetOrbit, viewCamera, zoomBy, type OrbitState } from './orbit.ts';
import { OVERLAY_STYLES, type OverlayId } from './overlay-style.ts';
import { OverlayLayer } from './overlays.ts';
import { closePanel, openPanel, topPanel } from './panel-stack.ts';
import { formatNumber } from './quantise.ts';
import {
  createBrightnessLimiter,
  type BrightnessLimiter,
  type BrightnessPair,
} from './rate-limit.ts';
import type { AppStats, ImageRect } from './stats.ts';
import { createToolbar } from './toolbar.ts';
import { showUnsupported } from './unsupported.ts';
import { formatHash, needsNotice, parseHash } from './url-state.ts';
import { createUrlSync, type UrlSync } from './url-sync.ts';
import { DEFAULT_VIEW, toggleOverlay, type ViewMode, type ViewState } from './view-state.ts';

/** GPU time per animation frame the renderer aims for. */
const FRAME_BUDGET_MS = 12;
/** Quiet time after the last change before full-resolution work starts. */
const SETTLE_MS = 120;
/** Pixel cap for the internal resolution (4K UHD). */
const MAX_PIXELS = 3840 * 2160;

type PanelId = 'controls';

const HASH_NOTICE =
  'Some settings in the link were invalid or out of range and have been adjusted.';

const sameOrbit = (a: OrbitState, b: OrbitState) =>
  a.distance === b.distance && a.azimuthDeg === b.azimuthDeg && a.elevationDeg === b.elevationDeg;

/** Panels become bottom sheets, one at a time, below this width (CSS px). */
const NARROW = '(max-width: 640px)';

/** A camera and the scene settings drawn with it. */
interface SceneView {
  readonly camera: CameraParams;
  readonly disk: boolean;
  readonly view: ViewMode;
  readonly antialias: boolean;
}

/** Optional diagnostic cap on the texture size (?maxdim=N), used by the device-limit test. */
function maxDimensionOverride(): number | null {
  const v = Number(new URLSearchParams(location.search).get('maxdim'));
  return Number.isFinite(v) && v >= 64 ? Math.floor(v) : null;
}

/** Optional diagnostic frame budget in ms (?budget=N, 0.1 to 100), used by the preview test. */
function budgetOverride(): number | null {
  const raw = new URLSearchParams(location.search).get('budget');
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0.1 && v <= 100 ? v : null;
}

export async function startApp(root: HTMLElement): Promise<void> {
  const init = await initWebGpu();
  if (!init.ok) {
    showUnsupported(root, init.message);
    return;
  }
  const renderer = await GpuRenderer.create(init.device, init.timestampQuery);
  new App(root, init.device, renderer, init.timestampQuery).start();
}

class App {
  private readonly canvas = el('canvas', {
    class: 'view',
    tabindex: 0,
    role: 'img',
    'aria-describedby': 'help',
  });
  private readonly hudCamera = el('span');
  private readonly hudTiming = el('span', { class: 'timing' });
  private readonly hud = el('p', { class: 'hud' }, this.hudCamera, this.hudTiming);
  private readonly alert = el('div', { class: 'alert', role: 'alert', hidden: true });
  private readonly announcerRegion = el('p', {
    id: 'announcer',
    class: 'sr-only',
    role: 'status',
    'aria-live': 'polite',
  });
  private readonly context: GPUCanvasContext;
  private readonly format = navigator.gpu.getPreferredCanvasFormat();
  private readonly plan = new ProgressiveRenderer(1, 1, {
    budgetMs: budgetOverride() ?? FRAME_BUDGET_MS,
    settleMs: SETTLE_MS,
    tileSize: TILE_SIZE,
  });
  private readonly life: Lifecycle = createLifecycle({
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
    requestFrame: (fn) => window.requestAnimationFrame(fn),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
  });
  private readonly announcer: Announcer = createAnnouncer(this.announcerRegion, this.life);
  /** The view the controls ask for; the camera is always at the URL's precision. */
  private view: ViewState = DEFAULT_VIEW;
  /** Disk and termination view as drawn: they follow `view` through the brightness limiter. */
  private applied: BrightnessPair = { disk: DEFAULT_VIEW.disk, view: DEFAULT_VIEW.view };
  private readonly limiter: BrightnessLimiter;
  private readonly toolbar: ReturnType<typeof createToolbar>;
  private readonly controls: ControlsPanel;
  private panels: PanelId[] = [];
  /** The scene of the image last presented to the canvas: the overlays follow it. */
  private presented: SceneView | null = null;
  private readonly overlay: OverlayLayer;
  private readonly urlSync: UrlSync;
  private hashApplies = 0;
  /** Announce the camera once the view settles (after keyboard or camera-button input). */
  private announceCamera = false;
  private state: AppStats['state'] = 'starting';
  private resolution: Resolution = { width: 0, height: 0, limitedBy: 'none' };
  private cssKey = '';
  private frames = 0;
  private previews = 0;
  private previewScale = 0;
  private previewMs = 0;
  private traceMs = 0;
  private refineMs = 0;

  private readonly root: HTMLElement;
  private readonly device: GPUDevice;
  private readonly renderer: GpuRenderer;
  private readonly timestampQuery: boolean;

  constructor(
    root: HTMLElement,
    device: GPUDevice,
    renderer: GpuRenderer,
    timestampQuery: boolean,
  ) {
    this.root = root;
    this.device = device;
    this.renderer = renderer;
    this.timestampQuery = timestampQuery;
    const context = this.canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context unavailable');
    this.context = context;
    this.limiter = createBrightnessLimiter(
      this.applied,
      (pair) => {
        this.applied = pair;
        this.applyScene();
      },
      {
        now: () => performance.now(),
        setTimer: (fn, ms) => this.life.timeout(fn, ms),
        clearTimer: (id) => this.life.cancel(id),
      },
    );
    this.overlay = new OverlayLayer(this.life);
    this.urlSync = createUrlSync({
      setTimer: (fn, ms) => this.life.timeout(fn, ms),
      clearTimer: (id) => this.life.cancel(id),
      replaceHash: (hash) => this.writeHash(hash),
    });
    this.toolbar = createToolbar([
      {
        id: 'btn-controls',
        label: 'Controls',
        key: 'C',
        controls: 'controls-panel',
        onClick: () => this.togglePanel('controls'),
      },
    ]);
    this.controls = createControlsPanel({
      action: (a) => this.dispatch(a, 'button'),
      scene: (toggle, on) => this.setSceneToggle(toggle, on, false),
      overlay: (id, on) => this.setOverlay(id, on, false),
      close: () => this.closePanel('controls', true),
    });
  }

  start(): void {
    this.loadHash();
    this.canvas.setAttribute('aria-label', this.summary());
    this.canvas.setAttribute(
      'aria-keyshortcuts',
      ariaKeyshortcuts(KEYMAP.filter((b) => this.supports(b.action))),
    );
    const help = el(
      'p',
      { class: 'help', id: 'help' },
      el(
        'span',
        { class: 'fine' },
        'Drag or arrow keys: orbit. Scroll or +/-: zoom. Shortcuts work while the view has focus; C opens the controls.',
      ),
      el('span', { class: 'coarse' }, 'Drag to orbit, pinch to zoom, or use Controls.'),
    );
    this.root.replaceChildren(
      el('h1', { class: 'sr-only' }, 'photonring'),
      this.canvas,
      this.overlay.svg,
      this.toolbar.element,
      this.controls.element,
      this.overlay.legend,
      this.hud,
      help,
      this.announcerRegion,
      this.alert,
    );
    this.syncControls();

    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    bindCanvasInput(
      this.canvas,
      {
        orbit: () => this.view.orbit,
        setOrbit: (next) => this.setOrbit(next),
        key: (e) => this.onKey(e),
      },
      this.life,
    );
    window.addEventListener('hashchange', this.onHashChange, { signal: this.life.signal });
    void this.device.lost.then((info) => {
      if (!this.life.disposed) this.showLost(info.reason, info.message);
    });
    window.photonring = {
      debug: {
        stats: () => this.stats(),
        destroyDevice: () => this.device.destroy(),
        presentedImage: (rect) => this.presentedImage(rect),
      },
    };
    this.state = 'rendering';
    this.applyScene();
    this.life.frame(this.frame);
  }

  private stats(): AppStats {
    const camera = viewCamera(this.view.orbit);
    return {
      state: this.state,
      frames: this.frames,
      internalWidth: this.resolution.width,
      internalHeight: this.resolution.height,
      limitedBy: this.resolution.limitedBy,
      mode: this.applied.view,
      disk: this.applied.disk,
      antialias: this.view.antialias,
      distance: camera.distance,
      azimuthDeg: camera.azimuthDeg,
      elevationDeg: camera.elevationDeg,
      fovYDeg: camera.fovYDeg,
      stage: this.plan.done ? 'done' : this.plan.stage,
      previews: this.previews,
      previewScale: this.previewScale,
      tilesRemaining: this.plan.remaining.trace + this.plan.remaining.refine,
      previewMs: this.previewMs,
      traceMs: this.traceMs,
      refineMs: this.refineMs,
      timing: this.timestampQuery ? 'timestamp-query' : 'wall-clock',
      overlays: [...this.view.overlays],
      controlsOpen: this.panels.includes('controls'),
      requestedDisk: this.view.disk,
      requestedMode: this.view.view,
      brightnessPending: !this.limiter.isIdle(),
      toggleApplies: this.limiter.applies,
      toggleApplyTimes: [...this.limiter.applyTimes],
      hashApplies: this.hashApplies,
      ringsState: this.overlay.ringsState,
      ringMs: this.overlay.ringMs,
    };
  }

  /** The scene the renderer draws: the requested camera and settings, the applied brightness. */
  private sceneNow(): SceneView {
    return {
      camera: viewCamera(this.view.orbit),
      disk: this.applied.disk,
      view: this.applied.view,
      antialias: this.view.antialias,
    };
  }

  private summary(): string {
    const s = this.sceneNow();
    return sceneSummary({ ...s.camera, disk: s.disk, view: s.view, overlays: this.view.overlays });
  }

  private applyScene(): void {
    const s = this.sceneNow();
    this.renderer.setScene({
      M: 1,
      camera: s.camera,
      mode: s.view,
      sky: 'stars',
      exposure: 1,
      toneMapping: true,
      disk: s.disk ? DEFAULT_DISK : null,
      antialias: s.antialias,
    });
    this.plan.sceneChanged(performance.now(), this.renderer.antialiasing);
  }

  private resizeIfNeeded(): void {
    const dpr = window.devicePixelRatio || 1;
    const key = `${this.canvas.clientWidth}x${this.canvas.clientHeight}@${dpr}`;
    if (key === this.cssKey) return;
    this.cssKey = key;
    const limit = this.device.limits.maxTextureDimension2D;
    this.resolution = chooseInternalResolution({
      cssWidth: this.canvas.clientWidth,
      cssHeight: this.canvas.clientHeight,
      devicePixelRatio: dpr,
      scale: 1,
      maxTextureDimension2D: Math.min(limit, maxDimensionOverride() ?? limit),
      maxPixels: MAX_PIXELS,
    });
    this.canvas.width = this.resolution.width;
    this.canvas.height = this.resolution.height;
    this.renderer.resize(this.resolution.width, this.resolution.height);
    this.plan.resize(this.resolution.width, this.resolution.height, performance.now());
  }

  private readonly frame = (now: number): void => {
    if (this.state !== 'rendering') return;
    this.resizeIfNeeded();
    const action = this.plan.next(now);
    if (action.kind !== 'idle') this.run(action);
    if (this.plan.done) this.settled();
    this.overlay.update(this.overlayFrame());
    this.updateHud();
    this.life.frame(this.frame);
  };

  /** Once the image is complete: the canvas name follows, and the camera is announced if asked. */
  private settled(): void {
    const label = this.summary();
    if (this.canvas.getAttribute('aria-label') !== label)
      this.canvas.setAttribute('aria-label', label);
    if (this.announceCamera) {
      this.announceCamera = false;
      this.announcer.announce(cameraSentence(this.sceneNow().camera));
    }
  }

  private run(action: Exclude<FrameAction, { kind: 'idle' }>): void {
    if (action.reset) {
      this.renderer.clearRefined();
      this.traceMs = 0;
      this.refineMs = 0;
    }
    let work: Promise<number>;
    if (action.kind === 'preview') {
      this.previews++;
      this.previewScale = action.scale;
      work = this.renderer.renderPreview(action.scale);
    } else {
      work = this.renderer.dispatchTiles(action.tiles, action.kind);
    }
    work
      .then((ms) => {
        if (action.kind === 'preview') this.previewMs = ms;
        else if (action.kind === 'trace') this.traceMs += ms;
        else this.refineMs += ms;
        this.plan.completed(action, ms);
      })
      .catch(() => this.plan.completed(action, NaN));
    if (action.present) {
      this.renderer.blit(
        this.context.getCurrentTexture().createView(),
        this.format,
        action.present,
      );
      this.frames++;
      this.presented = this.sceneNow();
    }
  }

  private overlayFrame() {
    const { width, height } = this.resolution;
    return {
      camera: this.presented?.camera ?? null,
      aspect: height > 0 ? width / height : 1,
      cssWidth: this.canvas.clientWidth,
      cssHeight: this.canvas.clientHeight,
      overlays: this.view.overlays,
      termination: this.applied.view === 'termination',
      controlsOpen: this.panels.includes('controls'),
    };
  }

  /** RGBA of the presented full image, optionally cropped, as base64 (debug interface). */
  private async presentedImage(
    rect?: ImageRect,
  ): Promise<{ width: number; height: number; rgba: string }> {
    const full = await this.renderer.readImageRGBA('full');
    const W = this.renderer.width;
    const r = rect ?? { x: 0, y: 0, width: W, height: this.renderer.height };
    const out = new Uint8Array(r.width * r.height * 4);
    for (let j = 0; j < r.height; j++) {
      const from = ((r.y + j) * W + r.x) * 4;
      out.set(full.subarray(from, from + r.width * 4), j * r.width * 4);
    }
    let text = '';
    for (let i = 0; i < out.length; i += 0x8000) {
      text += String.fromCharCode(...out.subarray(i, i + 0x8000));
    }
    return { width: r.width, height: r.height, rgba: btoa(text) };
  }

  private updateHud(): void {
    const { width, height } = this.resolution;
    const timing = this.timestampQuery ? 'GPU' : 'frame';
    const ms = (v: number) => `${v.toFixed(1)} ms`;
    const { trace, refine } = this.plan.remaining;
    let status: string;
    if (this.plan.done) {
      status = `first pass ${ms(this.traceMs)}`;
      if (this.renderer.antialiasing) status += `, anti-aliasing ${ms(this.refineMs)}`;
    } else if (this.plan.stage === 'preview') {
      status = `moving: preview at ${Math.round(100 * this.previewScale)} % (${ms(this.previewMs)})`;
    } else if (this.plan.stage === 'trace') {
      status = `full resolution, ${trace} tiles left`;
    } else {
      status = `anti-aliasing, ${refine} tiles left`;
    }
    const o = this.view.orbit;
    const camera =
      `${o.distance.toFixed(1)} M, elevation ${formatNumber(o.elevationDeg, 2)} degrees, ` +
      `azimuth ${formatNumber(o.azimuthDeg, 2)} degrees`;
    const view = this.applied.view === 'termination' ? ', termination view' : '';
    this.hudCamera.textContent = `${camera}${view}.`;
    this.hudTiming.textContent = ` ${width} x ${height}, ${timing} time: ${status}`;
  }

  // ---- State changes ------------------------------------------------------------------------

  /**
   * Makes `next` the requested view: the camera and anti-aliasing apply at once, disk and
   * termination view go through the brightness limiter, and the URL follows (debounced).
   */
  private commit(next: ViewState): void {
    const prev = this.view;
    if (next === prev) return;
    this.view = next;
    if (prev.disk !== next.disk || prev.view !== next.view) {
      this.limiter.request({ disk: next.disk, view: next.view });
    }
    if (!sameOrbit(prev.orbit, next.orbit) || prev.antialias !== next.antialias) this.applyScene();
    this.syncControls();
    this.urlSync.schedule(formatHash(next));
  }

  private setOrbit(next: OrbitState): void {
    if (sameOrbit(next, this.view.orbit)) return;
    this.commit({ ...this.view, orbit: next });
  }

  private setSceneToggle(toggle: SceneToggle, on: boolean, announce: boolean): void {
    const v = this.view;
    if (toggle === 'disk') this.commit({ ...v, disk: on });
    else if (toggle === 'termination') this.commit({ ...v, view: on ? 'termination' : 'colour' });
    else this.commit({ ...v, antialias: on });
    if (announce) {
      const name = { disk: 'Disk', antialias: 'Anti-aliasing', termination: 'Termination view' }[
        toggle
      ];
      this.announcer.announce(`${name} ${on ? 'on' : 'off'}`);
    }
  }

  private setOverlay(id: OverlayId, on: boolean, announce: boolean): void {
    if (this.view.overlays.includes(id) !== on) this.commit(toggleOverlay(this.view, id));
    if (announce) this.announcer.announce(`${OVERLAY_STYLES[id].label} ${on ? 'on' : 'off'}`);
  }

  // ---- URL hash ----------------------------------------------------------------------------

  /** Writes the hash now, with replaceState: no history entry, no hashchange. */
  private writeHash(hash: string): void {
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${hash}`);
  }

  /** Reads the hash on load: a shared view renders without the default view first. */
  private loadHash(): void {
    if (location.hash === '' || location.hash === '#') return;
    const { state, issues } = parseHash(location.hash);
    this.view = state;
    this.applied = { disk: state.disk, view: state.view };
    this.limiter.reset(this.applied);
    this.canonicaliseHash(state);
    if (needsNotice(issues)) this.announcer.announce(HASH_NOTICE);
  }

  /** Rewrites a non-canonical hash at once, which also clears hostile text from the address bar. */
  private canonicaliseHash(state: ViewState): void {
    const hash = formatHash(state);
    if (location.hash !== `#${hash}`) {
      this.urlSync.schedule(hash);
      this.urlSync.flush();
    }
  }

  /** Address-bar edits, in-page links, Back and Forward: the hash is a complete view. */
  private readonly onHashChange = (): void => {
    if (this.state !== 'rendering' || this.urlSync.isOwn(location.hash)) return;
    this.urlSync.cancel();
    const { state, issues } = parseHash(location.hash);
    this.hashApplies++;
    this.commit(state);
    this.canonicaliseHash(state);
    if (needsNotice(issues)) this.announcer.announce(HASH_NOTICE);
  };

  private syncControls(): void {
    this.controls.sync({
      disk: this.view.disk,
      antialias: this.view.antialias,
      termination: this.view.view === 'termination',
      overlays: this.view.overlays,
    });
  }

  // ---- Input -------------------------------------------------------------------------------

  /** Actions this build of the page can perform (the rest arrive with later features). */
  private supports(a: Action): boolean {
    return (
      a.type !== 'save' && a.type !== 'about' && !(a.type === 'panel' && a.panel !== 'controls')
    );
  }

  private onKey(e: KeyboardEvent): boolean {
    const a = keyAction(e);
    if (!a || !this.supports(a)) return false;
    if (a.type === 'escape' && this.panels.length === 0) return false;
    this.dispatch(a, 'key');
    return true;
  }

  /** One code path for keys and buttons. */
  private dispatch(a: Action, source: 'key' | 'button'): void {
    const v = this.view;
    switch (a.type) {
      case 'orbit':
        this.setOrbit(orbitBy(v.orbit, a.dAzimuthDeg, a.dElevationDeg));
        this.announceCamera = true;
        return;
      case 'zoom':
        this.setOrbit(zoomBy(v.orbit, a.factor));
        this.announceCamera = true;
        return;
      case 'reset':
        this.setOrbit(resetOrbit(v.orbit));
        this.announceCamera = false;
        this.announcer.announce('View reset');
        return;
      case 'toggle': {
        const on =
          a.target === 'disk'
            ? !v.disk
            : a.target === 'antialias'
              ? !v.antialias
              : v.view !== 'termination';
        this.setSceneToggle(a.target, on, source === 'key');
        return;
      }
      case 'overlay':
        this.setOverlay(a.id, !v.overlays.includes(a.id), source === 'key');
        return;
      case 'panel':
        this.togglePanel(a.panel as PanelId);
        return;
      case 'escape': {
        const top = topPanel(this.panels);
        if (top) this.closePanel(top, false);
        return;
      }
      case 'save':
      case 'about':
        return;
    }
  }

  // ---- Panels ------------------------------------------------------------------------------

  private panelParts(id: PanelId): { panel: HTMLElement; button: HTMLButtonElement } {
    return { panel: this.controls.element, button: this.toolbar.buttons.get(`btn-${id}`)! };
  }

  private togglePanel(id: PanelId): void {
    if (this.panels.includes(id)) this.closePanel(id, false);
    else this.openPanel(id);
  }

  private openPanel(id: PanelId): void {
    const single = window.matchMedia(NARROW).matches;
    for (const other of this.panels) if (single && other !== id) this.closePanel(other, false);
    this.panels = openPanel(this.panels, id, { single });
    const { panel, button } = this.panelParts(id);
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    this.root.classList.toggle('panel-open', this.panels.length > 0);
  }

  private closePanel(id: PanelId, focusButton: boolean): void {
    this.panels = closePanel(this.panels, id);
    const { panel, button } = this.panelParts(id);
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    this.root.classList.toggle('panel-open', this.panels.length > 0);
    if (focusButton) button.focus();
  }

  // ---- Device loss -------------------------------------------------------------------------

  private showLost(reason: string, message: string): void {
    this.state = 'lost';
    // The restarted page reads the hash, so it must hold the latest view.
    this.urlSync.flush();
    const button = el('button', { type: 'button' }, 'Restart the renderer');
    button.addEventListener(
      'click',
      () => {
        this.dispose();
        void startApp(this.root);
      },
      { signal: this.life.signal },
    );
    this.alert.replaceChildren(
      el(
        'p',
        {},
        `The GPU device was lost (${reason}${message ? `: ${message}` : ''}). Rendering has stopped.`,
      ),
      button,
    );
    this.alert.hidden = false;
    button.focus();
  }

  private dispose(): void {
    this.life.dispose();
    this.renderer.destroy();
  }
}
