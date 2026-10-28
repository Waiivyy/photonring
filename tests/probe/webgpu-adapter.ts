// Prints, as one JSON line, what WebGPU in headless Google Chrome can do with the settings the
// browser tests use (PHOTONRING_ADAPTER; tests/helpers/browser-env.ts): the Chrome version, the
// adapter's info, timestamp-query and maxTextureDimension2D; a compute dispatch, read back and
// checked; and a canvas cleared to a known colour for 60 animation frames, then compared with a
// screenshot, which is what a page needs to show anything. Any loss of the device is recorded
// with its reason, message and frame. More lines show whether the settings are still needed:
// with the hardware adapter, the same with --enable-unsafe-webgpu --ignore-gpu-blocklist; with
// SwiftShader on Linux, the same without any of the Linux settings, and with the Linux flags but
// without Chrome's Vulkan driver. The page comes from a route on an https origin, a secure
// context, so no server is needed. Chrome logs to stderr; DEBUG=pw:browser shows it.
//
// npm run probe:webgpu [-- --require hardware,present]: exits 1 unless the first line found a
// hardware adapter (hardware) or passed the compute and canvas checks (present); without
// --require it exits 0 once Chrome has launched.
import { chromium } from '@playwright/test';
import {
  ADAPTER_ARGS,
  LINUX_SWIFTSHADER_ARGS,
  adapter,
  browserUse,
} from '../helpers/browser-env.ts';
import { readPng } from '../helpers/png-read.ts';

const REQUIREMENTS = ['hardware', 'present'];
const argv = process.argv.slice(2);
const at = argv.indexOf('--require');
const required = at >= 0 ? (argv[at + 1] ?? '').split(',') : [];
for (const r of required) {
  if (!REQUIREMENTS.includes(r)) throw new Error(`--require takes hardware and present, not ${r}`);
}

/** The presentation check: canvas size in CSS px, frames presented, and the clear colour. */
const SIZE = 256;
const FRAMES = 60;
const CLEAR = [255, 0, 255];

interface Probe {
  secure: boolean;
  hasGpu: boolean;
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
    timestampQuery: boolean;
    maxTextureDimension2D: number;
  } | null;
  compute: { wrong: number; gpuMs?: number } | null;
  present: { format: string; frames: number } | null;
  lost: { reason: string; message: string; ms: number; frame: number } | null;
  errors: string[];
  error?: string;
}

// Runs in the page; requests the adapter and the device the way src/gpu/device.ts does.
const probe = async (p: { size: number; frames: number; clear: number[] }): Promise<Probe> => {
  const out: Probe = {
    secure: isSecureContext,
    hasGpu: 'gpu' in navigator,
    adapter: null,
    compute: null,
    present: null,
    lost: null,
    errors: [],
  };
  if (!out.hasGpu) return out;
  const t0 = performance.now();
  const within = <T>(work: Promise<T>, ms: number, what: string) =>
    Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms),
      ),
    ]);
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (a === null) return out;
    const i = a.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
    const timestampQuery = a.features.has('timestamp-query');
    out.adapter = {
      vendor: i.vendor,
      architecture: i.architecture,
      device: i.device,
      description: i.description,
      isFallbackAdapter: i.isFallbackAdapter ?? false,
      timestampQuery,
      maxTextureDimension2D: a.limits.maxTextureDimension2D,
    };
    const device = await a.requestDevice({
      requiredFeatures: timestampQuery ? ['timestamp-query'] : [],
    });
    let frame = 0;
    void device.lost.then((info) => {
      const ms = Math.round(performance.now() - t0);
      out.lost = { reason: info.reason, message: info.message, ms, frame };
    });
    device.addEventListener('uncapturederror', (e) => {
      out.errors.push(e.error.message);
    });

    // Compute: 4096 invocations of an integer recurrence, read back and checked; timed with
    // timestamp queries when the adapter has them.
    const n = 4096;
    const module = device.createShaderModule({
      code: `@group(0) @binding(0) var<storage, read_write> out: array<u32>;
        @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
          var x = id.x;
          for (var k = 0u; k < 1000u; k++) { x = x * 1664525u + 1013904223u; }
          out[id.x] = x;
        }`,
    });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });
    const storage = device.createBuffer({
      size: 4 * n,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const read = device.createBuffer({
      size: 4 * n,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const querySet = timestampQuery ? device.createQuerySet({ type: 'timestamp', count: 2 }) : null;
    const resolved = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const times = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass(
      querySet
        ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
        : {},
    );
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: storage } }],
      }),
    );
    pass.dispatchWorkgroups(n / 64);
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, read, 0, 4 * n);
    if (querySet) {
      encoder.resolveQuerySet(querySet, 0, 2, resolved, 0);
      encoder.copyBufferToBuffer(resolved, 0, times, 0, 16);
    }
    device.queue.submit([encoder.finish()]);
    await within(read.mapAsync(GPUMapMode.READ), 10_000, 'the compute readback');
    const values = new Uint32Array(read.getMappedRange());
    let wrong = 0;
    for (let id = 0; id < n; id++) {
      let x = id;
      for (let k = 0; k < 1000; k++) x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      if (values[id] !== x) wrong++;
    }
    read.unmap();
    out.compute = { wrong };
    if (querySet) {
      await within(times.mapAsync(GPUMapMode.READ), 10_000, 'the timestamp readback');
      const t = new BigUint64Array(times.getMappedRange());
      out.compute.gpuMs = Number(t[1]! - t[0]!) / 1e6;
      times.unmap();
    }

    // Presentation: a canvas cleared to a known colour once per animation frame.
    const canvas = document.createElement('canvas');
    canvas.width = p.size;
    canvas.height = p.size;
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${p.size}px;height:${p.size}px`;
    document.body.append(canvas);
    const context = canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });
    const present = { format, frames: 0 };
    out.present = present;
    const [r, g, b] = p.clear.map((c) => c / 255);
    await within(
      new Promise<void>((done) => {
        const draw = () => {
          if (out.lost !== null || frame >= p.frames) return done();
          const e = device.createCommandEncoder();
          e.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(),
                clearValue: { r: r!, g: g!, b: b!, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
              },
            ],
          }).end();
          device.queue.submit([e.finish()]);
          present.frames = ++frame;
          requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
      }),
      20_000,
      'presenting the frames',
    );
    await within(device.queue.onSubmittedWorkDone(), 10_000, 'the queued work');
    // A loss is reported asynchronously: give it a moment to arrive.
    await new Promise((done) => setTimeout(done, 500));
  } catch (e) {
    out.error = String(e);
  }
  return out;
};

async function run(label: string, use: ReturnType<typeof browserUse>) {
  const browser = await chromium.launch({
    channel: use.channel,
    headless: use.headless,
    ...use.launchOptions,
    args: [...use.launchOptions.args, '--enable-logging=stderr', '--v=0'],
  });
  try {
    const page = await browser.newPage();
    const messages: string[] = [];
    page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
    await page.route('https://probe.test/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
    );
    await page.goto('https://probe.test/');
    const result = await page.evaluate(probe, { size: SIZE, frames: FRAMES, clear: CLEAR });
    // What the compositor shows: the middle of the canvas, compared with the clear colour.
    let screenshot: { mismatched: number; sample: number[] } | { error: string } | null = null;
    if (result.present !== null) {
      try {
        const png = readPng(
          await page.screenshot({
            clip: { x: SIZE / 4, y: SIZE / 4, width: SIZE / 2, height: SIZE / 2 },
            timeout: 15_000,
          }),
        );
        let mismatched = 0;
        for (let k = 0; k < png.rgba.length; k += 4) {
          if (CLEAR.some((c, ch) => Math.abs(png.rgba[k + ch]! - c) > 2)) mismatched++;
        }
        screenshot = { mismatched, sample: [...png.rgba.subarray(0, 3)] };
      } catch (e) {
        screenshot = { error: String(e) };
      }
    }
    console.log(
      JSON.stringify({
        label,
        flags: use.launchOptions.args,
        chrome: browser.version(),
        ...result,
        screenshot,
        messages,
      }),
    );
    return { ...result, screenshot };
  } finally {
    await browser.close();
  }
}

type Result = Awaited<ReturnType<typeof run>>;

const isHardware = (p: Result) =>
  p.adapter !== null &&
  !p.adapter.isFallbackAdapter &&
  !/swiftshader/i.test(`${p.adapter.vendor} ${p.adapter.architecture} ${p.adapter.description}`);

const presents = (p: Result) =>
  p.error === undefined &&
  p.lost === null &&
  p.compute?.wrong === 0 &&
  p.present?.frames === FRAMES &&
  p.screenshot !== null &&
  'mismatched' in p.screenshot &&
  p.screenshot.mismatched === 0;

const main = await run(adapter(), browserUse());
if (adapter() === 'hardware') {
  await run(
    'hardware, diagnostic flags',
    browserUse(['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']),
  );
} else if (process.platform === 'linux') {
  const without = (label: string, args: readonly string[]) =>
    run(label, { channel: 'chrome', headless: true, launchOptions: { args: [...args] } });
  await without('swiftshader without the Linux settings', ADAPTER_ARGS.swiftshader);
  await without('swiftshader with the Linux flags, without the Vulkan driver', [
    ...ADAPTER_ARGS.swiftshader,
    ...LINUX_SWIFTSHADER_ARGS,
  ]);
}
const failed = [
  required.includes('hardware') && !isHardware(main)
    ? 'no hardware WebGPU adapter with the settings the tests use'
    : '',
  required.includes('present') && !presents(main)
    ? 'the compute or canvas check failed with the settings the tests use'
    : '',
].filter((m) => m !== '');
if (failed.length > 0) {
  console.error(`probe: ${failed.join('; ')}`);
  process.exit(1);
}
