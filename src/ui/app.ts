// The interactive page: canvas, orbit controls, progressive tiled rendering within a frame
// budget, a small timing readout, and recovery from device loss.
import { initWebGpu } from '../gpu/device.ts';
import { chooseInternalResolution, type Resolution } from '../gpu/host/resolution.ts';
import { TileScheduler, planTiles } from '../gpu/host/tiles.ts';
import { GpuRenderer, TILE_SIZE } from '../gpu/renderer.ts';
import { DEFAULT_DISK } from '../physics/index.ts';
import { initialOrbit, orbitBy, viewCamera, zoomBy, type OrbitState } from './orbit.ts';
import { showUnsupported } from './unsupported.ts';

/** GPU time per animation frame the tile scheduler aims for. */
const FRAME_BUDGET_MS = 12;
/** Pixel cap for the internal resolution (4K UHD). */
const MAX_PIXELS = 3840 * 2160;

export interface AppStats {
  state: 'starting' | 'rendering' | 'lost';
  frames: number;
  internalWidth: number;
  internalHeight: number;
  limitedBy: Resolution['limitedBy'];
  mode: 'colour' | 'termination';
  disk: boolean;
  azimuthDeg: number;
  distance: number;
  tilesRemaining: number;
  gpuMs: number;
  timing: 'timestamp-query' | 'wall-clock';
}

declare global {
  interface Window {
    photonring?: { debug: { stats(): AppStats; destroyDevice(): void } };
  }
}

/** Optional diagnostic cap on the texture size (?maxdim=N), used by the device-limit test. */
function maxDimensionOverride(): number | null {
  const v = Number(new URLSearchParams(location.search).get('maxdim'));
  return Number.isFinite(v) && v >= 64 ? Math.floor(v) : null;
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
  private readonly canvas = document.createElement('canvas');
  private readonly hud = document.createElement('p');
  private readonly alert = document.createElement('div');
  private readonly context: GPUCanvasContext;
  private readonly format = navigator.gpu.getPreferredCanvasFormat();
  private readonly scheduler = new TileScheduler();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private orbit: OrbitState = initialOrbit;
  private mode: AppStats['mode'] = 'colour';
  private disk = true;
  private state: AppStats['state'] = 'starting';
  private resolution: Resolution = { width: 0, height: 0, limitedBy: 'none' };
  private cssKey = '';
  private dirty = true;
  private inFlight = 0;
  private frames = 0;
  private gpuMs = 0;
  private disposed = false;

  private readonly root: HTMLElement;
  private readonly device: GPUDevice;
  private readonly renderer: GpuRenderer;
  private readonly timestampQuery: boolean;
  private needsFinalBlit = false;

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
    this.canvas.className = 'view';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute(
      'aria-label',
      'Rendered view of a black hole and its accretion disk bending the light of the stars behind it',
    );
    this.hud.className = 'hud';
    const help = document.createElement('p');
    help.className = 'help';
    help.textContent =
      'Drag or arrow keys: orbit. Scroll, pinch or +/-: zoom. D: disk. T: termination view.';
    this.alert.className = 'alert';
    this.alert.setAttribute('role', 'alert');
    this.alert.hidden = true;
    this.root.replaceChildren(this.canvas, this.hud, help, this.alert);

    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.bindInput();
    void this.device.lost.then((info) => {
      if (!this.disposed) this.showLost(info.reason, info.message);
    });
    window.photonring = {
      debug: { stats: () => this.stats(), destroyDevice: () => this.device.destroy() },
    };
    this.state = 'rendering';
    this.applyScene();
    requestAnimationFrame(this.frame);
  }

  private stats(): AppStats {
    return {
      state: this.state,
      frames: this.frames,
      internalWidth: this.resolution.width,
      internalHeight: this.resolution.height,
      limitedBy: this.resolution.limitedBy,
      mode: this.mode,
      disk: this.disk,
      azimuthDeg: this.orbit.azimuthDeg,
      distance: this.orbit.distance,
      tilesRemaining: this.scheduler.remaining + this.inFlight,
      gpuMs: this.gpuMs,
      timing: this.timestampQuery ? 'timestamp-query' : 'wall-clock',
    };
  }

  private applyScene(): void {
    this.renderer.setScene({
      M: 1,
      camera: viewCamera(this.orbit),
      mode: this.mode,
      sky: 'stars',
      exposure: 1,
      toneMapping: true,
      disk: this.disk ? DEFAULT_DISK : null,
    });
    this.dirty = true;
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
    this.dirty = true;
  }

  private readonly frame = (): void => {
    if (this.disposed || this.state !== 'rendering') return;
    this.resizeIfNeeded();
    if (this.dirty) {
      this.scheduler.reset(planTiles(this.resolution.width, this.resolution.height, TILE_SIZE));
      this.dirty = false;
    }
    if (!this.scheduler.done && this.inFlight === 0) {
      const tiles = this.scheduler.takeForFrame(FRAME_BUDGET_MS);
      const pixels = tiles.reduce((n, t) => n + t.width * t.height, 0);
      this.inFlight = tiles.length;
      this.renderer
        .dispatchTiles(tiles)
        .then((ms) => {
          this.scheduler.recordCost(pixels, ms);
          this.gpuMs = ms;
        })
        .catch(() => undefined)
        .finally(() => {
          this.inFlight = 0;
        });
      this.renderer.blit(this.context.getCurrentTexture().createView(), this.format);
      this.frames++;
    } else if (
      this.scheduler.done &&
      this.inFlight === 0 &&
      this.frames > 0 &&
      this.needsFinalBlit
    ) {
      this.renderer.blit(this.context.getCurrentTexture().createView(), this.format);
      this.needsFinalBlit = false;
    }
    if (!this.scheduler.done) this.needsFinalBlit = true;
    this.updateHud();
    requestAnimationFrame(this.frame);
  };

  private updateHud(): void {
    const { width, height } = this.resolution;
    const timing = this.timestampQuery ? 'GPU' : 'frame';
    const progress = this.scheduler.done ? '' : `, ${this.scheduler.remaining} tiles left`;
    this.hud.textContent = `${width} x ${height}, ${timing} ${this.gpuMs.toFixed(1)} ms per batch${progress}${this.mode === 'termination' ? ', termination view' : ''}`;
  }

  private setOrbit(next: OrbitState): void {
    if (next === this.orbit) return;
    this.orbit = next;
    this.applyScene();
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    c.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      if (this.pointers.size === 1) {
        this.setOrbit(
          orbitBy(this.orbit, -(e.clientX - prev.x) * 0.25, (e.clientY - prev.y) * 0.25),
        );
      } else if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(prev.x - other.x, prev.y - other.y);
          const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
          if (before > 0 && after > 0) this.setOrbit(zoomBy(this.orbit, before / after));
        }
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const release = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.setOrbit(zoomBy(this.orbit, Math.exp(e.deltaY * 0.001)));
      },
      { passive: false },
    );
    c.addEventListener('keydown', (e) => {
      const handled = this.handleKey(e.key);
      if (handled) e.preventDefault();
    });
  }

  private handleKey(key: string): boolean {
    switch (key) {
      case 'ArrowLeft':
        this.setOrbit(orbitBy(this.orbit, 5, 0));
        return true;
      case 'ArrowRight':
        this.setOrbit(orbitBy(this.orbit, -5, 0));
        return true;
      case 'ArrowUp':
        this.setOrbit(orbitBy(this.orbit, 0, 5));
        return true;
      case 'ArrowDown':
        this.setOrbit(orbitBy(this.orbit, 0, -5));
        return true;
      case '+':
      case '=':
        this.setOrbit(zoomBy(this.orbit, 1 / 1.1));
        return true;
      case '-':
        this.setOrbit(zoomBy(this.orbit, 1.1));
        return true;
      case 'd':
      case 'D':
        this.disk = !this.disk;
        this.applyScene();
        return true;
      case 't':
      case 'T':
        this.mode = this.mode === 'colour' ? 'termination' : 'colour';
        this.applyScene();
        return true;
      default:
        return false;
    }
  }

  private showLost(reason: string, message: string): void {
    this.state = 'lost';
    const text = document.createElement('p');
    text.textContent = `The GPU device was lost (${reason}${message ? `: ${message}` : ''}). Rendering has stopped.`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Restart the renderer';
    button.addEventListener('click', () => {
      this.dispose();
      void startApp(this.root);
    });
    this.alert.replaceChildren(text, button);
    this.alert.hidden = false;
    button.focus();
  }

  private dispose(): void {
    this.disposed = true;
    this.renderer.destroy();
  }
}
