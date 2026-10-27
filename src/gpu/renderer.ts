// WebGPU renderer: compute pipelines for the image and for the parity tests, the tone-mapping
// blit, tiled dispatch, and GPU timing. Physics lives in the WGSL; this file only moves data.
import {
  cameraFrame,
  diskTemperatureScale,
  staticObserverFactor,
  type CameraParams,
  type DiskSettings,
} from '../physics/index.ts';
import { layoutStruct, packStruct } from './host/layout.ts';
import { BLACKBODY_LUT } from './host/lut.ts';
import { planTiles, type Tile } from './host/tiles.ts';
import { BLIT_FIELDS, CROSSING_LOG_SIZE, FRAME_FIELDS } from './host/wgsl.ts';
import { blitShaderSource, computeShaderSource } from './shaders.ts';

/** Orbital-angle step and step cap of the GPU integrator (chosen in Stage 0, docs/DESIGN.md). */
export const GPU_DPHI = 0.05;
export const GPU_MAX_STEPS = 1000;
export const TILE_SIZE = 256;
const IMAGE_FORMAT: GPUTextureFormat = 'rgba16float';

export interface SceneParams {
  readonly M: number;
  readonly camera: CameraParams;
  readonly mode: 'colour' | 'termination';
  readonly sky: 'stars' | 'uniform';
  readonly exposure: number;
  readonly toneMapping: boolean;
  /** Thin disk, or null for none. Inner edge outside the photon sphere (3M). */
  readonly disk: DiskSettings | null;
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

type Layouts = Record<'common' | 'image' | 'empty' | 'rays' | 'sky' | 'blit', GPUBindGroupLayout>;

export class GpuRenderer {
  readonly device: GPUDevice;
  private readonly uniform: GPUBuffer;
  private readonly blitUniform: GPUBuffer;
  private readonly common: GPUBindGroup;
  private readonly empty: GPUBindGroup;
  private readonly sampler: GPUSampler;
  private readonly blitPipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private image: GPUTexture | null = null;
  private imageGroup: GPUBindGroup | null = null;
  private scene: SceneParams | null = null;
  private querySet: GPUQuerySet | null = null;
  private queryResolve: GPUBuffer | null = null;
  private queryRead: GPUBuffer | null = null;
  private queryBusy = false;
  private readonly layouts: Layouts;
  private readonly pipelines: Record<'render' | 'rays' | 'sky', GPUComputePipeline>;
  private readonly blitModule: GPUShaderModule;

  private constructor(
    device: GPUDevice,
    layouts: Layouts,
    pipelines: Record<'render' | 'rays' | 'sky', GPUComputePipeline>,
    blitModule: GPUShaderModule,
    timestampQuery: boolean,
  ) {
    this.device = device;
    this.layouts = layouts;
    this.pipelines = pipelines;
    this.blitModule = blitModule;
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
      rays: await pipeline([layouts.common, layouts.empty, layouts.rays], 'traceRays', {
        LOG_CROSSINGS: 1,
      }),
      sky: await pipeline([layouts.common, layouts.empty, layouts.sky], 'skySamples'),
    };
    return new GpuRenderer(device, layouts, pipelines, blitModule, timestampQuery);
  }

  get width(): number {
    return this.image?.width ?? 0;
  }

  get height(): number {
    return this.image?.height ?? 0;
  }

  /** (Re)allocates the linear image. Callers clamp the size with chooseInternalResolution. */
  resize(width: number, height: number): void {
    if (this.image && this.image.width === width && this.image.height === height) return;
    this.image?.destroy();
    this.image = this.device.createTexture({
      label: 'linear image',
      size: { width, height },
      format: IMAGE_FORMAT,
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    this.imageGroup = this.device.createBindGroup({
      layout: this.layouts.image,
      entries: [{ binding: 0, resource: this.image.createView() }],
    });
  }

  setScene(scene: SceneParams): void {
    const d = scene.disk;
    if (d && !(d.rIn > 3 * scene.M && d.rOut > d.rIn && d.opacity >= 0 && d.opacity <= 1)) {
      throw new RangeError('disk needs 3M < rIn < rOut and opacity in [0, 1]');
    }
    this.scene = scene;
  }

  private writeFrame(tile: Tile): void {
    const scene = this.scene;
    if (!scene) throw new Error('setScene must be called before rendering');
    const f = cameraFrame(scene.camera, scene.M);
    const width = Math.max(1, this.width);
    const height = Math.max(1, this.height);
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
      mode: scene.mode === 'termination' ? 1 : 0,
      tileOrigin: [tile.x, tile.y],
      tileSize: [tile.width, tile.height],
      sky: scene.sky === 'uniform' ? 1 : 0,
      disk: scene.disk ? 1 : 0,
      diskInner: scene.disk?.rIn ?? 0,
      diskOuter: scene.disk?.rOut ?? 0,
      diskOpacity: scene.disk?.opacity ?? 0,
      diskTemperatureScale: scene.disk ? diskTemperatureScale(scene.disk.peakTemperature) : 0,
    });
    this.device.queue.writeBuffer(this.uniform, 0, data);
  }

  /**
   * Submits one compute pass per tile (each preceded by its own parameter write, which the queue
   * orders before the pass). With timestamp queries, the first and last pass are timed and the
   * returned promise resolves to GPU milliseconds; otherwise to wall-clock milliseconds until the
   * queue drains, which overestimates.
   */
  dispatchTiles(tiles: readonly Tile[]): Promise<number> {
    if (!this.imageGroup) throw new Error('resize must be called before rendering');
    const timed = this.querySet !== null && !this.queryBusy && tiles.length > 0;
    const start = performance.now();
    tiles.forEach((tile, k) => {
      this.writeFrame(tile);
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
      const pass = encoder.beginComputePass(writesAny ? { timestampWrites } : {});
      pass.setPipeline(this.pipelines.render);
      pass.setBindGroup(0, this.common);
      pass.setBindGroup(1, this.imageGroup);
      pass.dispatchWorkgroups(Math.ceil(tile.width / 8), Math.ceil(tile.height / 8));
      pass.end();
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

  /** Renders the whole image and waits for the GPU. */
  async renderAll(): Promise<number> {
    return this.dispatchTiles(planTiles(this.width, this.height, TILE_SIZE));
  }

  private blitPipeline(format: GPUTextureFormat): GPURenderPipeline {
    let p = this.blitPipelines.get(format);
    if (!p) {
      p = this.device.createRenderPipeline({
        label: `blit ${format}`,
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.layouts.blit] }),
        vertex: { module: this.blitModule, entryPoint: 'vertexMain' },
        fragment: { module: this.blitModule, entryPoint: 'fragmentMain', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      });
      this.blitPipelines.set(format, p);
    }
    return p;
  }

  /** Tone maps (or clamps) the linear image into a render target. */
  blit(target: GPUTextureView, format: GPUTextureFormat): void {
    if (!this.image || !this.scene) return;
    const tone = this.scene.toneMapping && this.scene.mode === 'colour';
    this.device.queue.writeBuffer(
      this.blitUniform,
      0,
      packStruct(BLIT_FIELDS, { exposure: this.scene.exposure, toneMapping: tone ? 1 : 0 }),
    );
    const group = this.device.createBindGroup({
      layout: this.layouts.blit,
      entries: [
        { binding: 0, resource: { buffer: this.blitUniform } },
        { binding: 1, resource: this.image.createView() },
        { binding: 2, resource: this.sampler },
      ],
    });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: target, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] },
      ],
    });
    pass.setPipeline(this.blitPipeline(format));
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** The presented image as 8-bit RGB, through the same blit (for tests). */
  async readImageRGB8(): Promise<Uint8Array> {
    const width = this.width;
    const height = this.height;
    const target = this.device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.blit(target.createView(), 'rgba8unorm');
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
    await read.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(read.getMappedRange());
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * bytesPerRow + x * 4;
        rgb.set(
          [src[s] as number, src[s + 1] as number, src[s + 2] as number],
          (y * width + x) * 3,
        );
      }
    }
    read.unmap();
    read.destroy();
    target.destroy();
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
    this.image?.destroy();
    this.uniform.destroy();
    this.blitUniform.destroy();
    this.querySet?.destroy();
    this.queryResolve?.destroy();
    this.queryRead?.destroy();
  }
}
