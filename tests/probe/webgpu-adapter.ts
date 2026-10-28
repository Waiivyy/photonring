// Prints, as one JSON line, the WebGPU adapter that headless Google Chrome exposes with the
// settings the browser tests use (PHOTONRING_ADAPTER; tests/helpers/browser-env.ts): the Chrome
// version, the adapter's info, timestamp-query and maxTextureDimension2D. With the hardware
// adapter it prints a second line with --enable-unsafe-webgpu --ignore-gpu-blocklist, so one run
// shows whether a machine needs those flags. The page comes from a route on an https origin, a
// secure context, so no server is needed.
//
// npm run probe:webgpu [-- --require hardware]: with --require hardware it exits 1 unless the
// first line found a hardware adapter; otherwise it exits 0 once Chrome has launched.
import { chromium } from '@playwright/test';
import { adapter, browserUse } from '../helpers/browser-env.ts';

const argv = process.argv.slice(2);
const at = argv.indexOf('--require');
const required = at >= 0 ? argv[at + 1] : undefined;
if (required !== undefined && required !== 'hardware') {
  throw new Error(`--require takes hardware, not ${required}`);
}

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
  error?: string;
}

// Runs in the page; requests the adapter the way src/gpu/device.ts does.
const probe = async (): Promise<Probe> => {
  const out: Probe = { secure: isSecureContext, hasGpu: 'gpu' in navigator, adapter: null };
  if (!out.hasGpu) return out;
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (a !== null) {
      const i = a.info as GPUAdapterInfo & { isFallbackAdapter?: boolean };
      out.adapter = {
        vendor: i.vendor,
        architecture: i.architecture,
        device: i.device,
        description: i.description,
        isFallbackAdapter: i.isFallbackAdapter ?? false,
        timestampQuery: a.features.has('timestamp-query'),
        maxTextureDimension2D: a.limits.maxTextureDimension2D,
      };
    }
  } catch (e) {
    out.error = String(e);
  }
  return out;
};

async function run(label: string, args: readonly string[]) {
  const use = browserUse(args);
  const browser = await chromium.launch({
    channel: use.channel,
    headless: use.headless,
    args: use.launchOptions.args,
  });
  try {
    const page = await browser.newPage();
    const messages: string[] = [];
    page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
    await page.route('https://probe.test/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>probe</title>' }),
    );
    await page.goto('https://probe.test/');
    const result = await page.evaluate(probe);
    console.log(
      JSON.stringify({
        label,
        flags: use.launchOptions.args,
        chrome: browser.version(),
        ...result,
        messages,
      }),
    );
    return result;
  } finally {
    await browser.close();
  }
}

const isHardware = (p: Probe) =>
  p.adapter !== null &&
  !p.adapter.isFallbackAdapter &&
  !/swiftshader/i.test(`${p.adapter.vendor} ${p.adapter.architecture} ${p.adapter.description}`);

const main = await run(adapter(), []);
if (adapter() === 'hardware') {
  await run('hardware, diagnostic flags', ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']);
}
if (required === 'hardware' && !isHardware(main)) {
  console.error('probe: no hardware WebGPU adapter with the settings the tests use');
  process.exit(1);
}
