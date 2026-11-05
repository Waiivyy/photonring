// WebGPU renderer: compute pipelines for the image and for the parity tests, the tone-mapping
// blit, tiled dispatch, and GPU timing. Physics lives in the WGSL; this file only moves data.
import {
  cameraFrame,
  diskTemperatureScale,
  staticObserverFactor,
  type CameraParams,
  type DiskSettings,
} from '../physics/index.ts';
import { AA_THRESHOLD, criticalBand } from './host/antialias.ts';
import { colourMapTable, ehtPlan, NORMALISE_FLOOR, TABLE_SIZE } from './host/eht-post.ts';
import { halfToFloat } from './host/half.ts';
import { layoutStruct, packStruct } from './host/layout.ts';
import { BLACKBODY_LUT } from './host/lut.ts';
import { planTiles, type Tile } from './host/tiles.ts';
import {
  BLIT_FIELDS,
  CROSSING_LOG_SIZE,
  EHT_FIELDS,
  FRAME_FIELDS,
  RENDER_MODES,
  SKIES,
  type RenderMode,
  type Sky,
} from './host/wgsl.ts';
import { blitShaderSource, computeShaderSource, ehtShaderSource } from './shaders.ts';

/** Orbital-angle step and step cap of the GPU integrator (chosen in Stage 0, docs/DESIGN.md). */
export const GPU_DPHI = 0.05;
export const GPU_MAX_STEPS = 1000;
export const TILE_SIZE = 256;
const IMAGE_FORMAT: GPUTextureFormat = 'rgba16float';

export type { RenderMode, Sky } from './host/wgsl.ts';

export interface SceneParams {
  readonly M: number;
  readonly camera: CameraParams;
  readonly mode: RenderMode;
  readonly sky: Sky;
  readonly exposure: number;
  readonly toneMapping: boolean;
  /** Thin disk, or null for none. Inner edge outside the photon sphere (3M). */
  readonly disk: DiskSettings | null;
  /** Adaptive 3 x 3 supersampling after the one-sample pass (colour and EHT modes). */
  readonly antialias: boolean;
  /** Contrast threshold override for measurements; -1 refines every pixel (uniform 3 x 3). */
  readonly aaThreshold?: number;
}

export interface RayInput {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
}

export interface RayOutput {
  readonly termination: number;
  readonly direction: [number, number, number];
  readonly phiEnd: number;
  readonly steps: number;
  /** Disk-plane crossings with u > 0 along the traced path. */
  readonly crossings: number;
  /** Radii of the first crossings, at most CROSSING_LOG_SIZE of them. */
  readonly radii: number[];
  /** Disk light (linear sRGB) and the transmittance left behind it, as in compositeDisk. */
  readonly emission: [number, number, number];
  readonly transmittance: number;
}

/** Bytes per RayOut in the parity output buffer (render.wgsl). */
const RAY_OUT_BYTES = 48 + 4 * CROSSING_LOG_SIZE;

async function compile(device: GPUDevice, code: string, label: string): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ code, label });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length > 0) {
    const text = errors.map((m) => `${label}:${m.lineNum}:${m.linePos} ${m.message}`).join('\n');
    throw new Error(`WGSL compilation failed\n${text}`);
  }
  return module;
}

type Layouts = Record<
  'common' | 'image' | 'refine' | 'empty' | 'rays' | 'sky' | 'blit',
  GPUBindGroupLayout
>;
type Pipelines = Record<'render' | 'refine' | 'rays' | 'sky', GPUComputePipeline>;
type EhtPipelines = Record<
  'reduceX' | 'reduceY' | 'blurH' | 'blurV' | 'max' | 'normalise',
  GPUComputePipeline
>;

/** Which compute pass a tile dispatch runs: one sample per pixel, or anti-aliasing. */
export type TilePass = 'trace' | 'refine';

export class GpuRenderer {
  readonly device: GPUDevice;
  private readonly uniform: GPUBuffer;
  private readonly blitUniform: GPUBuffer;
  private readonly common: GPUBindGroup;
  private readonly empty: GPUBindGroup;
  private readonly sampler: GPUSampler;
  private readonly blitPipelines = new Map<string, GPURenderPipeline>();
  /** EHT-style post-process: parameters, colour table, weights, peak and the reduced images. */
  private readonly ehtUniform: GPUBuffer;
  private readonly ehtTable: GPUBuffer;
  private readonly ehtPeak: GPUBuffer;
  private ehtWeights: GPUBuffer | null = null;
  /** The reduced images, and the reduced-width image between the two reduce passes. */
  private ehtLow: readonly [GPUTexture, GPUTexture, GPUTexture] | null = null;
  /** Benchmarks only: a fixed reduce factor for the EHT post-process. */
  private ehtFactorOverride: number | undefined = undefined;
  /** Timestamp queries for timed presents, apart from the tile timing. */
  private readonly presentQuery: {
    readonly set: GPUQuerySet;
    readonly resolve: GPUBuffer;
    readonly read: GPUBuffer;
  } | null;
  /** One sample per pixel (first pass). */
  private image: GPUTexture | null = null;
  private imageGroup: GPUBindGroup | null = null;
  /** Anti-aliased pixels (alpha = samples) over the first pass; alpha 0 elsewhere. */
  private refined: GPUTexture | null = null;
  private refineGroup: GPUBindGroup | null = null;
  /** Reduced-resolution frames while the scene changes, in the top-left corner of a half-size image. */
  private preview: GPUTexture | null = null;
  private previewGroup: GPUBindGroup | null = null;
  private previewSize: readonly [number, number] = [1, 1];
  private scene: SceneParams | null = null;
  /** Offscreen validation render and its readback buffer, allocated on first use. */
  private validation: {
    readonly side: number;
    readonly texture: GPUTexture;
    readonly group: GPUBindGroup;
    readonly read: GPUBuffer;
    readonly bytesPerRow: number;
  } | null = null;
  private validationBusy: Promise<unknown> | null = null;
  private querySet: GPUQuerySet | null = null;
  private queryResolve: GPUBuffer | null = null;
  private queryRead: GPUBuffer | null = null;
  private queryBusy = false;
  private readonly layouts: Layouts;
  private readonly pipelines: Pipelines;
  private readonly ehtPipelines: EhtPipelines;
  private readonly blitModule: GPUShaderModule;

  private constructor(
    device: GPUDevice,
    layouts: Layouts,
    pipelines: Pipelines,
    ehtPipelines: EhtPipelines,
    blitModule: GPUShaderModule,
    timestampQuery: boolean,
  ) {
    this.device = device;
    this.layouts = layouts;
    this.pipelines = pipelines;
    this.ehtPipelines = ehtPipelines;
    this.blitModule = blitModule;
    this.ehtUniform = device.createBuffer({
      label: 'EHT post-process parameters',
      size: layoutStruct(EHT_FIELDS).size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const table = colourMapTable();
    const rows = new Float32Array(TABLE_SIZE * 4);
    for (let i = 0; i < TABLE_SIZE; i++) rows.set([...table.subarray(3 * i, 3 * i + 3), 1], 4 * i);
    this.ehtTable = device.createBuffer({
      label: 'EHT colour table',
      size: rows.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.ehtTable, 0, rows);
    this.ehtPeak = device.createBuffer({
      label: 'EHT peak',
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.uniform = device.createBuffer({
      label: 'frame parameters',
      size: layoutStruct(FRAME_FIELDS).size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.blitUniform = device.createBuffer({
      label: 'blit parameters',
      size: layoutStruct(BLIT_FIELDS).size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const lut = device.createBuffer({
      label: 'blackbody table',
      size: BLACKBODY_LUT.data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(lut, 0, BLACKBODY_LUT.data);
    this.common = device.createBindGroup({
      layout: layouts.common,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: lut } },
      ],
    });
    this.empty = device.createBindGroup({ layout: layouts.empty, entries: [] });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.presentQuery = timestampQuery
      ? {
          set: device.createQuerySet({ type: 'timestamp', count: 2 }),
          resolve: device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          }),
          read: device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          }),
        }
      : null;
    if (timestampQuery) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
      this.queryResolve = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.queryRead = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    }
  }

  static async create(device: GPUDevice, timestampQuery = false): Promise<GpuRenderer> {
    const computeModule = await compile(device, computeShaderSource(BLACKBODY_LUT), 'compute');
    const blitModule = await compile(device, blitShaderSource(BLACKBODY_LUT), 'blit');
    const ehtModule = await compile(device, ehtShaderSource(BLACKBODY_LUT), 'eht');
    const C = GPUShaderStage.COMPUTE;
    const layouts = {
      common: device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: C, buffer: { type: 'uniform' } },
          { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
        ],
      }),
      image: device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: C,
            storageTexture: { access: 'write-only', format: IMAGE_FORMAT },
          },
        ],
      }),
      refine: device.createBindGroupLayout({
        entries: [
          { binding: 1, visibility: C, texture: { sampleType: 'float' } },
          {
            binding: 2,
            visibility: C,
            storageTexture: { access: 'write-only', format: IMAGE_FORMAT },
          },
        ],
      }),
      empty: device.createBindGroupLayout({ entries: [] }),
      rays: device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: C, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: C, buffer: { type: 'storage' } },
        ],
      }),
      sky: device.createBindGroupLayout({
        entries: [
          { binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: C, buffer: { type: 'storage' } },
        ],
      }),
      blit: device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        ],
      }),
    };
    const pipeline = (
      groups: GPUBindGroupLayout[],
      entryPoint: string,
      constants: Record<string, number> = {},
    ) =>
      device.createComputePipelineAsync({
        label: entryPoint,
        layout: device.createPipelineLayout({ bindGroupLayouts: groups }),
        compute: { module: computeModule, entryPoint, constants },
      });
    const pipelines = {
      render: await pipeline([layouts.common, layouts.image], 'renderTile'),
      refine: await pipeline([layouts.common, layouts.refine], 'refineTile'),
      rays: await pipeline([layouts.common, layouts.empty, layouts.rays], 'traceRays', {
        LOG_CROSSINGS: 1,
      }),
      sky: await pipeline([layouts.common, layouts.empty, layouts.sky], 'skySamples'),
    };
    const eht = (entryPoint: string) =>
      device.createComputePipelineAsync({
        label: entryPoint,
        layout: 'auto',
        compute: { module: ehtModule, entryPoint },
      });
    const ehtPipelines = {
      reduceX: await eht('ehtReduceX'),
      reduceY: await eht('ehtReduceY'),
      blurH: await eht('ehtBlurH'),
      blurV: await eht('ehtBlurV'),
      max: await eht('ehtMax'),
      normalise: await eht('ehtNormalise'),
    };
    return new GpuRenderer(device, layouts, pipelines, ehtPipelines, blitModule, timestampQuery);
  }

  get width(): number {
    return this.image?.width ?? 0;
  }

  get height(): number {
    return this.image?.height ?? 0;
  }

  /** (Re)allocates the images. Callers clamp the size with chooseInternalResolution. */
  resize(width: number, height: number): void {
    if (this.image && this.image.width === width && this.image.height === height) return;
    this.image?.destroy();
    this.refined?.destroy();
    this.preview?.destroy();
    const image = (label: string, size = { width, height }) =>
      this.device.createTexture({
        label,
        size,
        format: IMAGE_FORMAT,
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC,
      });
    this.image = image('linear image');
    this.refined = image('anti-aliased pixels');
    this.preview = image('preview', {
      width: Math.ceil(width / 2),
      height: Math.ceil(height / 2),
    });
    this.previewGroup = this.device.createBindGroup({
      layout: this.layouts.image,
      entries: [{ binding: 0, resource: this.preview.createView() }],
    });
    this.imageGroup = this.device.createBindGroup({
      layout: this.layouts.image,
      entries: [{ binding: 0, resource: this.image.createView() }],
    });
    this.refineGroup = this.device.createBindGroup({
      layout: this.layouts.refine,
      entries: [
        { binding: 1, resource: this.image.createView() },
        { binding: 2, resource: this.refined.createView() },
      ],
    });
    this.clearRefined();
  }

  /** Forgets all anti-aliased pixels, so the blit shows the first pass everywhere. */
  clearRefined(): void {
    if (!this.refined) return;
    const encoder = this.device.createCommandEncoder();
    encoder
      .beginRenderPass({
        colorAttachments: [
          {
            view: this.refined.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 0],
          },
        ],
      })
      .end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** True when the current scene asks for the anti-aliasing pass. */
  get antialiasing(): boolean {
    return (
      this.scene !== null &&
      this.scene.antialias &&
      (this.scene.mode === 'colour' || this.scene.mode === 'eht')
    );
  }

  setScene(scene: SceneParams): void {
    const d = scene.disk;
    if (d && !(d.rIn > 3 * scene.M && d.rOut > d.rIn && d.opacity >= 0 && d.opacity <= 1)) {
      throw new RangeError('disk needs 3M < rIn < rOut and opacity in [0, 1]');
    }
    this.scene = scene;
  }

  /**
   * Frame parameters for one tile of a width x height image (the full image and the current
   * scene by default).
   */
  private writeFrame(
    tile: Tile,
    imageWidth = this.width,
    imageHeight = this.height,
    scene: SceneParams | null = this.scene,
  ): void {
    if (!scene) throw new Error('setScene must be called before rendering');
    const f = cameraFrame(scene.camera, scene.M);
    const width = Math.max(1, imageWidth);
    const height = Math.max(1, imageHeight);
    const band = criticalBand(scene.camera.distance, scene.M, f.tanHalfFovY, height);
    const data = packStruct(FRAME_FIELDS, {
      position: f.position,
      r0: scene.camera.distance,
      forward: f.forward,
      tanHalfFovY: f.tanHalfFovY,
      right: f.right,
      aspect: width / height,
      up: f.up,
      M: scene.M,
      dphi: GPU_DPHI,
      cosStep: Math.cos(GPU_DPHI),
      sinStep: Math.sin(GPU_DPHI),
      gObserver: scene.M > 0 ? staticObserverFactor(scene.camera.distance, scene.M) : 1,
      width,
      height,
      maxSteps: GPU_MAX_STEPS,
      mode: RENDER_MODES.indexOf(scene.mode),
      tileOrigin: [tile.x, tile.y],
      tileSize: [tile.width, tile.height],
      sky: SKIES.indexOf(scene.sky),
      disk: scene.disk ? 1 : 0,
      diskInner: scene.disk?.rIn ?? 0,
      diskOuter: scene.disk?.rOut ?? 0,
      diskOpacity: scene.disk?.opacity ?? 0,
      // The EHT-style view works with T-hat, the temperature over its peak value.
      diskTemperatureScale: scene.disk
        ? diskTemperatureScale(scene.mode === 'eht' ? 1 : scene.disk.peakTemperature)
        : 0,
      bandCosMin: band.cosMin,
      bandCosMax: band.cosMax,
      aaThreshold: scene.aaThreshold ?? AA_THRESHOLD,
      exposure: scene.exposure,
      toneMapping: scene.toneMapping && scene.mode === 'colour' ? 1 : 0,
    });
    this.device.queue.writeBuffer(this.uniform, 0, data);
  }

  /**
   * Submits one compute pass per tile (each preceded by its own parameter write, which the queue
   * orders before the pass). With timestamp queries, the first and last pass are timed and the
   * returned promise resolves to GPU milliseconds; otherwise to wall-clock milliseconds until the
   * queue drains, which overestimates.
   */
  dispatchTiles(tiles: readonly Tile[], pass: TilePass = 'trace'): Promise<number> {
    const group = pass === 'trace' ? this.imageGroup : this.refineGroup;
    if (!group) throw new Error('resize must be called before rendering');
    const pipeline = pass === 'trace' ? this.pipelines.render : this.pipelines.refine;
    return this.submitTiles(tiles, pipeline, group, this.width, this.height);
  }

  /**
   * Renders the whole image at `scale` (at most 1/2) of the full resolution per axis, one sample
   * per pixel, for blit(..., 'preview'). Resolves to milliseconds as dispatchTiles does.
   */
  renderPreview(scale: number): Promise<number> {
    if (!this.previewGroup) throw new Error('resize must be called before rendering');
    if (!(scale > 0 && scale <= 0.5)) throw new RangeError('preview scale must be in (0, 1/2]');
    const width = Math.ceil(this.width * scale);
    const height = Math.ceil(this.height * scale);
    this.previewSize = [width, height];
    const tiles = planTiles(width, height, TILE_SIZE);
    return this.submitTiles(tiles, this.pipelines.render, this.previewGroup, width, height);
  }

  /**
   * Submits the tiles of a width x height image. `scene` overrides the current scene (offscreen
   * renders); `timed: false` leaves the single timestamp query set to the interactive frames and
   * measures wall-clock time instead.
   */
  private submitTiles(
    tiles: readonly Tile[],
    pipeline: GPUComputePipeline,
    group: GPUBindGroup,
    width: number,
    height: number,
    opts: { readonly scene?: SceneParams; readonly timed?: boolean } = {},
  ): Promise<number> {
    const scene = opts.scene ?? this.scene;
    const timed =
      (opts.timed ?? true) && this.querySet !== null && !this.queryBusy && tiles.length > 0;
    const start = performance.now();
    tiles.forEach((tile, k) => {
      this.writeFrame(tile, width, height, scene);
      const encoder = this.device.createCommandEncoder();
      const timestampWrites: GPUComputePassTimestampWrites | undefined =
        timed && this.querySet
          ? {
              querySet: this.querySet,
              ...(k === 0 ? { beginningOfPassWriteIndex: 0 } : {}),
              ...(k === tiles.length - 1 ? { endOfPassWriteIndex: 1 } : {}),
            }
          : undefined;
      const writesAny = timestampWrites && (k === 0 || k === tiles.length - 1);
      const compute = encoder.beginComputePass(writesAny ? { timestampWrites } : {});
      compute.setPipeline(pipeline);
      compute.setBindGroup(0, this.common);
      compute.setBindGroup(1, group);
      compute.dispatchWorkgroups(Math.ceil(tile.width / 8), Math.ceil(tile.height / 8));
      compute.end();
      if (timed && k === tiles.length - 1 && this.querySet && this.queryResolve && this.queryRead) {
        encoder.resolveQuerySet(this.querySet, 0, 2, this.queryResolve, 0);
        encoder.copyBufferToBuffer(this.queryResolve, 0, this.queryRead, 0, 16);
      }
      this.device.queue.submit([encoder.finish()]);
    });
    if (timed && this.queryRead) {
      const read = this.queryRead;
      this.queryBusy = true;
      return read.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(read.getMappedRange());
        const ms = Number((t[1] as bigint) - (t[0] as bigint)) / 1e6;
        read.unmap();
        this.queryBusy = false;
        return ms;
      });
    }
    return this.device.queue.onSubmittedWorkDone().then(() => performance.now() - start);
  }

  /**
   * Renders the whole image (first pass, then anti-aliasing when the scene asks for it) and
   * waits for the GPU. Returns the milliseconds of each pass, as dispatchTiles measures them.
   */
  async renderAll(): Promise<{ traceMs: number; refineMs: number | null }> {
    const tiles = planTiles(this.width, this.height, TILE_SIZE);
    this.clearRefined();
    const traceMs = await this.dispatchTiles(tiles, 'trace');
    const refineMs = this.antialiasing ? await this.dispatchTiles(tiles, 'refine') : null;
    return { traceMs, refineMs };
  }

  /**
   * The Validation panel's measurement: renders the brief's validation mode (disk off, uniform
   * sky, no tone mapping, one ray per pixel centre) and the termination view of the same camera
   * into an offscreen side x side image, and reads both back. Never touches the current scene,
   * the interactive images or the canvas. With `timed`, each pass gets timestamp-query GPU time
   * (only where no interactive frame competes for the query set, as in the bench).
   */
  async measureShadow(
    camera: CameraParams,
    side = 1024,
    opts: { readonly timed?: boolean } = {},
  ): Promise<{
    side: number;
    bytesPerRow: number;
    halves: Uint16Array;
    gpuMs?: [number, number];
    readbackMs?: number;
  }> {
    if (this.validationBusy) throw new Error('a shadow measurement is already running');
    const v = this.validationTarget(side);
    const base: SceneParams = {
      M: 1,
      camera,
      mode: 'colour',
      sky: 'uniform',
      exposure: 1,
      toneMapping: false,
      disk: null,
      antialias: false,
    };
    const tiles = planTiles(side, side, TILE_SIZE);
    const timed = opts.timed === true;
    const copy = (offset: number) => {
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: v.texture },
        { buffer: v.read, offset, bytesPerRow: v.bytesPerRow },
        { width: side, height: side },
      );
      this.device.queue.submit([encoder.finish()]);
    };
    const run = async () => {
      const colour = this.submitTiles(tiles, this.pipelines.render, v.group, side, side, {
        scene: base,
        timed,
      });
      const colourMs = timed ? await colour : NaN;
      copy(0);
      const termination = this.submitTiles(tiles, this.pipelines.render, v.group, side, side, {
        scene: { ...base, mode: 'termination' },
        timed,
      });
      const terminationMs = timed ? await termination : NaN;
      copy(v.bytesPerRow * side);
      const t0 = performance.now();
      await v.read.mapAsync(GPUMapMode.READ);
      const readbackMs = performance.now() - t0;
      const halves = new Uint16Array(v.read.getMappedRange().slice(0));
      v.read.unmap();
      return {
        side,
        bytesPerRow: v.bytesPerRow,
        halves,
        ...(timed ? { gpuMs: [colourMs, terminationMs] as [number, number], readbackMs } : {}),
      };
    };
    const job = run();
    this.validationBusy = job;
    try {
      return await job;
    } finally {
      this.validationBusy = null;
    }
  }

  private validationTarget(side: number) {
    if (this.validation && this.validation.side === side) return this.validation;
    this.releaseValidation();
    const texture = this.device.createTexture({
      label: 'validation render',
      size: { width: side, height: side },
      format: IMAGE_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = Math.ceil((side * 8) / 256) * 256;
    this.validation = {
      side,
      texture,
      group: this.device.createBindGroup({
        layout: this.layouts.image,
        entries: [{ binding: 0, resource: texture.createView() }],
      }),
      read: this.device.createBuffer({
        label: 'validation readback',
        size: 2 * bytesPerRow * side,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
      bytesPerRow,
    };
    return this.validation;
  }

  /**
   * Frees the validation render and its buffer (the panel closed). A measurement still waiting
   * for its readback keeps them until it settles.
   */
  releaseValidation(): void {
    const v = this.validation;
    if (!v) return;
    this.validation = null;
    const free = () => {
      v.texture.destroy();
      v.read.destroy();
    };
    if (this.validationBusy) void this.validationBusy.then(free, free);
    else free();
  }

  private blitPipeline(
    format: GPUTextureFormat,
    kind: 'normal' | 'eht' = 'normal',
  ): GPURenderPipeline {
    const key = `${format}|${kind}`;
    let p = this.blitPipelines.get(key);
    if (!p) {
      p = this.device.createRenderPipeline({
        label: `blit ${kind} ${format}`,
        layout:
          kind === 'eht'
            ? 'auto'
            : this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts.blit] }),
        vertex: { module: this.blitModule, entryPoint: 'vertexMain' },
        fragment: {
          module: this.blitModule,
          entryPoint: kind === 'eht' ? 'fragmentEht' : 'fragmentMain',
          targets: [{ format }],
        },
        primitive: { topology: 'triangle-list' },
      });
      this.blitPipelines.set(key, p);
    }
    return p;
  }

  /**
   * The reduced images of the EHT post-process (two of the reduced size, one of reduced width and
   * full height), reallocated when the sizes change.
   */
  private ehtTargets(
    width: number,
    height: number,
    fullHeight: number,
  ): readonly [GPUTexture, GPUTexture, GPUTexture] {
    const cur = this.ehtLow;
    if (cur && cur[0].width === width && cur[0].height === height && cur[2].height === fullHeight) {
      return cur;
    }
    cur?.forEach((t) => t.destroy());
    const make = (label: string, h: number) =>
      this.device.createTexture({
        label,
        size: { width, height: h },
        format: IMAGE_FORMAT,
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      });
    this.ehtLow = [
      make('EHT reduced A', height),
      make('EHT reduced B', height),
      make('EHT reduced along x', fullHeight),
    ];
    return this.ehtLow;
  }

  /**
   * The EHT-style view's present: reduce along x and y, blur along x and y, peak and
   * normalisation in six compute passes, then the colour-mapped upsample, all in one command encoder, so the peak
   * always belongs to the frame it normalises. Reads the interactive images and never writes them.
   */
  private blitEht(
    target: GPUTextureView,
    format: GPUTextureFormat,
    source: 'full' | 'preview',
    timed = false,
  ): void {
    const scene = this.scene;
    if (!this.image || !this.refined || !this.preview || !scene) return;
    const d = this.device;
    const plan = ehtPlan(scene.camera, this.width, this.height, scene.M, this.ehtFactorOverride);
    const q = timed ? this.presentQuery : null;
    const [a, b, c] = this.ehtTargets(plan.lowWidth, plan.lowHeight, this.height);
    const weights = new Float32Array(plan.weights);
    if (!this.ehtWeights || this.ehtWeights.size < weights.byteLength) {
      this.ehtWeights?.destroy();
      this.ehtWeights = d.createBuffer({
        label: 'EHT blur weights',
        size: Math.max(16, weights.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    d.queue.writeBuffer(this.ehtWeights, 0, weights);
    d.queue.writeBuffer(
      this.ehtUniform,
      0,
      packStruct(EHT_FIELDS, {
        imageSize: [this.width, this.height],
        lowSize: [plan.lowWidth, plan.lowHeight],
        previewScale: [
          this.previewSize[0] / this.preview.width,
          this.previewSize[1] / this.preview.height,
        ],
        factor: plan.f,
        radius: (weights.length - 1) / 2,
        source: source === 'preview' ? 1 : 0,
        floor: NORMALISE_FLOOR,
      }),
    );
    const params: GPUBindGroupEntry = { binding: 0, resource: { buffer: this.ehtUniform } };
    const weightsEntry: GPUBindGroupEntry = { binding: 6, resource: { buffer: this.ehtWeights } };
    const peakEntry: GPUBindGroupEntry = { binding: 8, resource: { buffer: this.ehtPeak } };
    const tex = (binding: number, t: GPUTexture): GPUBindGroupEntry => ({
      binding,
      resource: t.createView(),
    });
    const groups = (n: number) => Math.ceil(n / 8);
    const passes: [GPUComputePipeline, GPUBindGroupEntry[], number, number][] = [
      [
        this.ehtPipelines.reduceX,
        [
          params,
          tex(1, this.image),
          tex(2, this.refined),
          tex(3, this.preview),
          { binding: 4, resource: this.sampler },
          tex(5, c),
        ],
        groups(plan.lowWidth),
        groups(this.height),
      ],
      [
        this.ehtPipelines.reduceY,
        [params, tex(7, c), tex(5, a)],
        groups(plan.lowWidth),
        groups(plan.lowHeight),
      ],
      [
        this.ehtPipelines.blurH,
        [params, weightsEntry, tex(7, a), tex(5, b)],
        groups(plan.lowWidth),
        groups(plan.lowHeight),
      ],
      [
        this.ehtPipelines.blurV,
        [params, weightsEntry, tex(7, b), tex(5, a)],
        groups(plan.lowWidth),
        groups(plan.lowHeight),
      ],
      [this.ehtPipelines.max, [params, tex(7, a), peakEntry], 1, 1],
      [
        this.ehtPipelines.normalise,
        [params, tex(7, a), peakEntry, tex(5, b)],
        groups(plan.lowWidth),
        groups(plan.lowHeight),
      ],
    ];
    const encoder = d.createCommandEncoder();
    for (const [k, [pipeline, entries, x, y]] of passes.entries()) {
      const pass = encoder.beginComputePass(
        q && k === 0 ? { timestampWrites: { querySet: q.set, beginningOfPassWriteIndex: 0 } } : {},
      );
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, d.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }));
      pass.dispatchWorkgroups(x, y);
      pass.end();
    }
    const pipeline = this.blitPipeline(format, 'eht');
    const render = encoder.beginRenderPass({
      colorAttachments: [
        { view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] },
      ],
      ...(q ? { timestampWrites: { querySet: q.set, endOfPassWriteIndex: 1 } } : {}),
    });
    render.setPipeline(pipeline);
    render.setBindGroup(
      0,
      d.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 2, resource: this.sampler },
          tex(5, b),
          { binding: 6, resource: { buffer: this.ehtTable } },
          { binding: 7, resource: { buffer: this.ehtUniform } },
        ],
      }),
    );
    render.draw(3);
    render.end();
    if (q) {
      encoder.resolveQuerySet(q.set, 0, 2, q.resolve, 0);
      encoder.copyBufferToBuffer(q.resolve, 0, q.read, 0, 16);
    }
    d.queue.submit([encoder.finish()]);
  }

  /**
   * Benchmarks: GPU milliseconds of one present into an offscreen target (in the EHT-style view,
   * its six passes and the colour-mapped upsample; otherwise the tone-mapping blit), from
   * timestamp queries, or wall-clock milliseconds until the queue drains without them. `factor`
   * fixes the EHT reduce factor for a comparison.
   */
  async timePresent(
    source: 'full' | 'preview' = 'full',
    factor?: number,
  ): Promise<{ ms: number; timing: 'timestamp-query' | 'wall-clock' }> {
    const target = this.device.createTexture({
      size: { width: this.width, height: this.height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.ehtFactorOverride = factor;
    const q = this.presentQuery;
    try {
      const t0 = performance.now();
      this.blit(target.createView(), 'rgba8unorm', source, true);
      if (q) {
        await q.read.mapAsync(GPUMapMode.READ);
        const t = new BigUint64Array(q.read.getMappedRange());
        const ms = Number((t[1] as bigint) - (t[0] as bigint)) / 1e6;
        q.read.unmap();
        return { ms, timing: 'timestamp-query' };
      }
      await this.device.queue.onSubmittedWorkDone();
      return { ms: performance.now() - t0, timing: 'wall-clock' };
    } finally {
      this.ehtFactorOverride = undefined;
      target.destroy();
    }
  }

  /**
   * Tone maps (or clamps) into a render target: the full image with its anti-aliased pixels, or
   * the last preview, upscaled with bilinear filtering.
   */
  blit(
    target: GPUTextureView,
    format: GPUTextureFormat,
    source: 'full' | 'preview' = 'full',
    timed = false,
  ): void {
    if (!this.image || !this.refined || !this.preview || !this.scene) return;
    if (this.scene.mode === 'eht') {
      this.blitEht(target, format, source, timed);
      return;
    }
    const q = timed ? this.presentQuery : null;
    const tone = this.scene.toneMapping && this.scene.mode === 'colour';
    this.device.queue.writeBuffer(
      this.blitUniform,
      0,
      packStruct(BLIT_FIELDS, {
        exposure: this.scene.exposure,
        toneMapping: tone ? 1 : 0,
        source: source === 'preview' ? 1 : 0,
        previewScale: [
          this.previewSize[0] / this.preview.width,
          this.previewSize[1] / this.preview.height,
        ],
      }),
    );
    const group = this.device.createBindGroup({
      layout: this.layouts.blit,
      entries: [
        { binding: 0, resource: { buffer: this.blitUniform } },
        { binding: 1, resource: this.image.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.refined.createView() },
        { binding: 4, resource: this.preview.createView() },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] },
      ],
      ...(q
        ? {
            timestampWrites: {
              querySet: q.set,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {}),
    });
    pass.setPipeline(this.blitPipeline(format));
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    if (q) {
      encoder.resolveQuerySet(q.set, 0, 2, q.resolve, 0);
      encoder.copyBufferToBuffer(q.resolve, 0, q.read, 0, 16);
    }
    this.device.queue.submit([encoder.finish()]);
  }

  /** The first pass's red channel (the EHT-style view's linear brightness), row-major (for tests). */
  async readLinearImage(): Promise<Float32Array> {
    if (!this.image) throw new Error('resize must be called before reading');
    const { width, height } = this;
    const bytesPerRow = Math.ceil((width * 8) / 256) * 256;
    const read = this.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: this.image },
      { buffer: read, bytesPerRow },
      { width, height },
    );
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(read.getMappedRange());
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        out[y * width + x] = halfToFloat(halves[(y * bytesPerRow) / 2 + x * 4] as number);
      }
    }
    read.unmap();
    read.destroy();
    return out;
  }

  /** The peak the last EHT-style present was normalised to (for tests). */
  async readEhtPeak(): Promise<number> {
    const read = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.ehtPeak, 0, read, 0, 16);
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const peak = new Float32Array(read.getMappedRange())[0] as number;
    read.unmap();
    read.destroy();
    return peak;
  }

  /** Samples behind each pixel of the presented image, row-major (for tests). */
  async readSampleCounts(): Promise<Uint8Array> {
    if (!this.refined) throw new Error('resize must be called before reading');
    const { width, height } = this;
    const bytesPerRow = Math.ceil((width * 8) / 256) * 256;
    const read = this.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: this.refined },
      { buffer: read, bytesPerRow },
      { width, height },
    );
    this.device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const halves = new Uint16Array(read.getMappedRange());
    const counts = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = halfToFloat(halves[(y * bytesPerRow) / 2 + x * 4 + 3] as number);
        counts[y * width + x] = alpha > 0 ? alpha : 1;
      }
    }
    read.unmap();
    read.destroy();
    return counts;
  }

  /**
   * The presented image (or the upscaled preview) as 8-bit RGBA, row-major, through the same
   * blit the canvas gets.
   */
  async readImageRGBA(source: 'full' | 'preview' = 'full'): Promise<Uint8Array> {
    const width = this.width;
    const height = this.height;
    const target = this.device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.blit(target.createView(), 'rgba8unorm', source);
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const read = this.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: target },
      { buffer: read, bytesPerRow },
      { width, height },
    );
    this.device.queue.submit([encoder.finish()]);
    try {
      await read.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(read.getMappedRange());
      const rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) {
        rgba.set(src.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
      }
      read.unmap();
      return rgba;
    } finally {
      read.destroy();
      target.destroy();
    }
  }

  /** The presented image (or the upscaled preview) as 8-bit RGB, through the same blit. */
  async readImageRGB8(source: 'full' | 'preview' = 'full'): Promise<Uint8Array> {
    const rgba = await this.readImageRGBA(source);
    const rgb = new Uint8Array((rgba.length / 4) * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i] as number;
      rgb[j + 1] = rgba[i + 1] as number;
      rgb[j + 2] = rgba[i + 2] as number;
    }
    return rgb;
  }

  private async runParity(
    pipeline: GPUComputePipeline,
    layout: GPUBindGroupLayout,
    bindings: [number, number],
    input: Float32Array,
    count: number,
    outputBytes: number,
  ): Promise<ArrayBuffer> {
    const d = this.device;
    const inBuf = d.createBuffer({
      size: input.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    d.queue.writeBuffer(inBuf, 0, input);
    const outBuf = d.createBuffer({
      size: outputBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const read = d.createBuffer({
      size: outputBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.writeFrame({ x: 0, y: 0, width: 1, height: 1 });
    const group = d.createBindGroup({
      layout,
      entries: [
        { binding: bindings[0], resource: { buffer: inBuf } },
        { binding: bindings[1], resource: { buffer: outBuf } },
      ],
    });
    const encoder = d.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.common);
    pass.setBindGroup(1, this.empty);
    pass.setBindGroup(2, group);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    encoder.copyBufferToBuffer(outBuf, 0, read, 0, outputBytes);
    d.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const out = read.getMappedRange().slice(0);
    read.unmap();
    [inBuf, outBuf, read].forEach((b) => b.destroy());
    return out;
  }

  /** Traces explicit rays with the same WGSL as the image (parity tests). */
  async traceRays(rays: readonly RayInput[]): Promise<RayOutput[]> {
    const input = new Float32Array(rays.length * 8);
    rays.forEach((r, i) => {
      input.set([...r.origin, 0, ...r.direction, 0], i * 8);
    });
    const out = await this.runParity(
      this.pipelines.rays,
      this.layouts.rays,
      [0, 1],
      input,
      rays.length,
      rays.length * RAY_OUT_BYTES,
    );
    const f = new Float32Array(out);
    const u = new Uint32Array(out);
    const stride = RAY_OUT_BYTES / 4;
    return rays.map((_, i) => {
      const k = i * stride;
      const crossings = u[k + 6] as number;
      return {
        direction: [f[k] as number, f[k + 1] as number, f[k + 2] as number],
        termination: u[k + 3] as number,
        phiEnd: f[k + 4] as number,
        steps: u[k + 5] as number,
        crossings,
        transmittance: f[k + 7] as number,
        emission: [f[k + 8] as number, f[k + 9] as number, f[k + 10] as number],
        radii: [...f.subarray(k + 12, k + 12 + Math.min(crossings, CROSSING_LOG_SIZE))],
      };
    });
  }

  /** Sky radiance for unit directions and frequency shift g (parity tests). */
  async skyRadiance(
    directions: readonly (readonly [number, number, number])[],
    g: number,
  ): Promise<number[][]> {
    const input = new Float32Array(directions.length * 4);
    directions.forEach((d, i) => input.set([d[0], d[1], d[2], g], i * 4));
    const out = new Float32Array(
      await this.runParity(
        this.pipelines.sky,
        this.layouts.sky,
        [2, 3],
        input,
        directions.length,
        directions.length * 16,
      ),
    );
    return directions.map((_, i) => [
      out[i * 4] as number,
      out[i * 4 + 1] as number,
      out[i * 4 + 2] as number,
    ]);
  }

  destroy(): void {
    this.releaseValidation();
    this.image?.destroy();
    this.refined?.destroy();
    this.preview?.destroy();
    this.uniform.destroy();
    this.blitUniform.destroy();
    this.ehtUniform.destroy();
    this.ehtTable.destroy();
    this.ehtPeak.destroy();
    this.ehtWeights?.destroy();
    this.ehtLow?.forEach((t) => t.destroy());
    this.querySet?.destroy();
    this.queryResolve?.destroy();
    this.queryRead?.destroy();
    this.presentQuery?.set.destroy();
    this.presentQuery?.resolve.destroy();
    this.presentQuery?.read.destroy();
  }
}
