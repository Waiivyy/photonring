// Test harness page: exposes the WebGPU renderer to Playwright specs through window.harness.
import { initWebGpu } from '../../src/gpu/device.ts';
import { GpuRenderer, type SceneParams } from '../../src/gpu/renderer.ts';
import type { Harness, HarnessInfo } from './harness-api.ts';

const parityScene: SceneParams = {
  M: 1,
  camera: { distance: 30, azimuthDeg: 0, elevationDeg: 0, fovYDeg: 60 },
  mode: 'colour',
  sky: 'stars',
  exposure: 1,
  toneMapping: true,
  disk: null,
};

let renderer: GpuRenderer | null = null;

const ready: Promise<HarnessInfo> = (async () => {
  const init = await initWebGpu();
  if (!init.ok) throw new Error(init.message);
  renderer = await GpuRenderer.create(init.device, init.timestampQuery);
  return {
    vendor: init.adapter.info.vendor,
    architecture: init.adapter.info.architecture,
    isFallbackAdapter: init.adapter.info.isFallbackAdapter,
    timestampQuery: init.timestampQuery,
  };
})();

const get = async (): Promise<GpuRenderer> => {
  await ready;
  if (!renderer) throw new Error('renderer missing');
  return renderer;
};

const harness: Harness = {
  ready,
  async traceRays(rays, disk = null) {
    const r = await get();
    r.setScene({ ...parityScene, disk });
    return r.traceRays(rays);
  },
  async skyRadiance(directions, g) {
    const r = await get();
    r.setScene(parityScene);
    return r.skyRadiance(directions, g);
  },
  async renderImage(request) {
    const r = await get();
    r.resize(request.width, request.height);
    r.setScene({ ...parityScene, ...request });
    await r.renderAll();
    return [...(await r.readImageRGB8())];
  },
  async benchmark(request, repeats) {
    const r = await get();
    const info = await ready;
    r.resize(request.width, request.height);
    r.setScene({ ...parityScene, ...request });
    await r.renderAll(); // warm-up: pipeline caches, first allocation
    const gpuMs: (number | null)[] = [];
    const wallMs: number[] = [];
    for (let i = 0; i < repeats; i++) {
      const t0 = performance.now();
      const ms = await r.renderAll();
      await r.device.queue.onSubmittedWorkDone();
      wallMs.push(performance.now() - t0);
      gpuMs.push(info.timestampQuery ? ms : null);
    }
    return { gpuMs, wallMs };
  },
};

window.harness = harness;
