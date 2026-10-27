// Test harness page: exposes the WebGPU renderer to Playwright specs through window.harness.
import { initWebGpu } from '../../src/gpu/device.ts';
import { classifyValidation } from '../../src/gpu/host/shadow-count.ts';
import { GpuRenderer, type SceneParams } from '../../src/gpu/renderer.ts';
import { shadowAngularRadius } from '../../src/physics/index.ts';
import type { Harness, HarnessInfo } from './harness-api.ts';

const parityScene: SceneParams = {
  M: 1,
  camera: { distance: 30, azimuthDeg: 0, elevationDeg: 0, fovYDeg: 60 },
  mode: 'colour',
  sky: 'stars',
  exposure: 1,
  toneMapping: true,
  disk: null,
  antialias: false,
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
    // The observer's frequency factor is a per-frame uniform, so one call needs one distance.
    const distances = rays.map((ray) => Math.hypot(...ray.origin));
    const distance = distances[0] ?? parityScene.camera.distance;
    if (distances.some((d) => Math.abs(d / distance - 1) > 1e-12)) {
      throw new Error('rays in one call must start at the same distance from the black hole');
    }
    r.setScene({ ...parityScene, camera: { ...parityScene.camera, distance }, disk });
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
    return { rgb: [...(await r.readImageRGB8())], samples: [...(await r.readSampleCounts())] };
  },
  async renderImageBase64(request, previewScale) {
    const r = await get();
    r.resize(request.width, request.height);
    r.setScene({ ...parityScene, ...request });
    let rgb: Uint8Array;
    if (previewScale === undefined) {
      await r.renderAll();
      rgb = await r.readImageRGB8();
    } else {
      await r.renderPreview(previewScale);
      rgb = await r.readImageRGB8('preview');
    }
    let text = '';
    for (let i = 0; i < rgb.length; i += 0x8000) {
      text += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
    }
    return btoa(text);
  },
  async benchmark(request, repeats) {
    const r = await get();
    const info = await ready;
    r.resize(request.width, request.height);
    r.setScene({ ...parityScene, ...request });
    await r.renderAll(); // warm-up: pipeline caches, first allocation
    const result = {
      timestampQuery: info.timestampQuery,
      traceMs: [] as number[],
      refineMs: [] as number[],
      previewHalfMs: [] as number[],
      previewQuarterMs: [] as number[],
      wallMs: [] as number[],
    };
    for (let i = 0; i < repeats; i++) {
      const t0 = performance.now();
      const { traceMs, refineMs } = await r.renderAll();
      await r.device.queue.onSubmittedWorkDone();
      result.wallMs.push(performance.now() - t0);
      result.traceMs.push(traceMs);
      if (refineMs !== null) result.refineMs.push(refineMs);
      result.previewHalfMs.push(await r.renderPreview(0.5));
      result.previewQuarterMs.push(await r.renderPreview(0.25));
    }
    await r.renderAll();
    const counts = await r.readSampleCounts();
    const refinedFraction = counts.reduce((n, c) => n + (c > 1 ? 1 : 0), 0) / counts.length;
    return { ...result, refinedFraction };
  },
  async measureShadow(request) {
    const r = await get();
    const { side, timed, ...camera } = request;
    const readback = await r.measureShadow(camera, side, { timed: timed === true });
    const t0 = performance.now();
    const counts = classifyValidation(readback, {
      tanHalfFovY: Math.tan((camera.fovYDeg * Math.PI) / 360),
      tanPsi: Math.tan(shadowAngularRadius(camera.distance, 1)),
    });
    const classifyMs = performance.now() - t0;
    return {
      counts,
      classifyMs,
      ...(readback.gpuMs ? { gpuMs: readback.gpuMs } : {}),
      ...(readback.readbackMs === undefined ? {} : { readbackMs: readback.readbackMs }),
    };
  },
  async measurementIsolation(image, shadow) {
    const r = await get();
    r.resize(image.width, image.height);
    r.setScene({ ...parityScene, ...image });
    await r.renderAll();
    const before = await r.readImageRGB8();
    const { side, ...camera } = shadow;
    await r.measureShadow(camera, side);
    const after = await r.readImageRGB8();
    const identical = before.length === after.length && before.every((b, i) => b === after[i]);
    return { identical, bytes: before.length };
  },
};

window.harness = harness;
