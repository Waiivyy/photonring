// Browser settings shared by the Playwright configurations: always the installed Google Chrome
// (no browser download), headless, with the WebGPU adapter chosen by PHOTONRING_ADAPTER:
// 'hardware' (default, the machine's GPU) or 'swiftshader' (software, for CI runners without a
// GPU; Chrome offers it only with --enable-unsafe-webgpu).

export type Adapter = 'hardware' | 'swiftshader';

export function adapter(): Adapter {
  const v = process.env.PHOTONRING_ADAPTER ?? 'hardware';
  if (v !== 'hardware' && v !== 'swiftshader') {
    throw new Error(`PHOTONRING_ADAPTER must be hardware or swiftshader, not ${v}`);
  }
  return v;
}

export const ADAPTER_ARGS: Readonly<Record<Adapter, readonly string[]>> = {
  hardware: [],
  swiftshader: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
};

/** A software adapter renders more slowly, so expectations wait longer for it. */
export const expectTimeout = (): number => (adapter() === 'swiftshader' ? 20_000 : 5_000);

export const browserUse = (extraArgs: readonly string[] = []) => ({
  channel: 'chrome',
  headless: true,
  launchOptions: { args: [...ADAPTER_ARGS[adapter()], ...extraArgs] },
});
