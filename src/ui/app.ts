// The interactive page: canvas, orbit controls, progressive rendering within a frame budget
// (reduced resolution while the view changes, then full resolution and anti-aliasing), a small
// timing readout, and recovery from device loss. Every listener, timer and animation frame the
// page creates belongs to one lifecycle, released when the renderer restarts.
import { initWebGpu } from '../gpu/device.ts';
import { ProgressiveRenderer, type FrameAction } from '../gpu/host/progressive.ts';
import { chooseInternalResolution, type Resolution } from '../gpu/host/resolution.ts';
import { GpuRenderer, TILE_SIZE } from '../gpu/renderer.ts';
import { DEFAULT_DISK, type CameraParams } from '../physics/index.ts';
import { el } from './dom.ts';
import { bindCanvasInput } from './input.ts';
import { createLifecycle, type Lifecycle } from './lifecycle.ts';
import { orbitBy, viewCamera, zoomBy, type OrbitState } from './orbit.ts';
import type { AppStats } from './stats.ts';
import { showUnsupported } from './unsupported.ts';
import { DEFAULT_VIEW, type ViewMode, type ViewState } from './view-state.ts';

/** GPU time per animation frame the renderer aims for. */
const FRAME_BUDGET_MS = 12;
/** Quiet time after the last change before full-resolution work starts. */
const SETTLE_MS = 120;
/** Pixel cap for the internal resolution (4K UHD). */
const MAX_PIXELS = 3840 * 2160;

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
  private readonly canvas = el('canvas', { class: 'view', tabindex: 0, role: 'img' });
  private readonly hud = el('p', { class: 'hud' });
  private readonly alert = el('div', { class: 'alert', role: 'alert', hidden: true });
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
  /** The view the controls ask for; the camera is always at the URL's precision. */
  private view: ViewState = DEFAULT_VIEW;
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
  }

  start(): void {
    this.canvas.setAttribute(
      'aria-label',
      'Rendered view of a black hole and its accretion disk bending the light of the stars behind it',
    );
    const help = el(
      'p',
      { class: 'help' },
      'Drag or arrow keys: orbit. Scroll, pinch or +/-: zoom. D: disk. A: anti-aliasing. T: termination view.',
    );
    this.root.replaceChildren(this.canvas, this.hud, help, this.alert);

    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    bindCanvasInput(
      this.canvas,
      {
        orbit: () => this.view.orbit,
        setOrbit: (next) => this.setOrbit(next),
        key: (e) => this.handleKey(e.key),
      },
      this.life,
    );
    void this.device.lost.then((info) => {
      if (!this.life.disposed) this.showLost(info.reason, info.message);
    });
    window.photonring = {
      debug: { stats: () => this.stats(), destroyDevice: () => this.device.destroy() },
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
      mode: this.view.view,
      disk: this.view.disk,
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
    };
  }

  /** The scene the renderer draws. */
  private sceneNow(): SceneView {
    return {
      camera: viewCamera(this.view.orbit),
      disk: this.view.disk,
      view: this.view.view,
      antialias: this.view.antialias,
    };
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
    this.updateHud();
    this.life.frame(this.frame);
  };

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
    }
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
    const view = this.view.view === 'termination' ? ', termination view' : '';
    this.hud.textContent = `${width} x ${height}, ${timing} time: ${status}${view}`;
  }

  private setOrbit(next: OrbitState): void {
    if (next === this.view.orbit) return;
    this.view = { ...this.view, orbit: next };
    this.applyScene();
  }

  private setView(next: ViewState): void {
    this.view = next;
    this.applyScene();
  }

  private handleKey(key: string): boolean {
    const v = this.view;
    switch (key) {
      case 'ArrowLeft':
        this.setOrbit(orbitBy(v.orbit, 5, 0));
        return true;
      case 'ArrowRight':
        this.setOrbit(orbitBy(v.orbit, -5, 0));
        return true;
      case 'ArrowUp':
        this.setOrbit(orbitBy(v.orbit, 0, 5));
        return true;
      case 'ArrowDown':
        this.setOrbit(orbitBy(v.orbit, 0, -5));
        return true;
      case '+':
      case '=':
        this.setOrbit(zoomBy(v.orbit, 1 / 1.1));
        return true;
      case '-':
        this.setOrbit(zoomBy(v.orbit, 1.1));
        return true;
      case 'd':
      case 'D':
        this.setView({ ...v, disk: !v.disk });
        return true;
      case 'a':
      case 'A':
        this.setView({ ...v, antialias: !v.antialias });
        return true;
      case 't':
      case 'T':
        this.setView({ ...v, view: v.view === 'colour' ? 'termination' : 'colour' });
        return true;
      default:
        return false;
    }
  }

  private showLost(reason: string, message: string): void {
    this.state = 'lost';
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
