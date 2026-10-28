// Browser settings shared by the Playwright configurations: always the installed Google Chrome
// (no browser download), headless, with the WebGPU adapter chosen by PHOTONRING_ADAPTER:
// 'hardware' (default, the machine's GPU) or 'swiftshader' (software, for CI runners without a
// GPU; Chrome offers it only with --enable-unsafe-webgpu).
import { existsSync } from 'node:fs';

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

/**
 * On Linux without a GPU, Chrome finds no Vulkan driver, so it cannot composite a WebGPU canvas
 * and drops the page's GPU channel: the device is lost as 'destroyed' at the first frame
 * (GitHub's ubuntu-24.04, Chrome 155 and 156). The fix is Chrome's own SwiftShader Vulkan
 * driver, which ships next to the binary, given to the Vulkan loader, with Chrome's Vulkan path
 * turned on and ANGLE on SwiftShader. Playwright passes --enable-features=CDPScreenshotNewSurface
 * itself; the list here repeats it so that it survives either way Chrome treats a repeated switch.
 */
export const LINUX_VULKAN_DRIVER = '/opt/google/chrome/vk_swiftshader_icd.json';
export const LINUX_SWIFTSHADER_ARGS: readonly string[] = [
  '--enable-features=CDPScreenshotNewSurface,Vulkan,WebGPU',
  '--use-angle=swiftshader',
];

/**
 * A software adapter renders more slowly, so expectations wait longer for it. GitHub's Ubuntu
 * runners also differ in speed by a factor of about 2 (docs/PERFORMANCE.md): on the slow ones the
 * Validation panel was not done within 20 s.
 */
export const expectTimeout = (): number => (adapter() === 'swiftshader' ? 60_000 : 5_000);

export const browserUse = (extraArgs: readonly string[] = []) => {
  const linuxVulkan = adapter() === 'swiftshader' && process.platform === 'linux';
  if (linuxVulkan && !existsSync(LINUX_VULKAN_DRIVER)) {
    throw new Error(
      `SwiftShader WebGPU on Linux needs Chrome's Vulkan driver at ${LINUX_VULKAN_DRIVER}, ` +
        'which is missing: check where this Chrome version ships vk_swiftshader_icd.json',
    );
  }
  return {
    channel: 'chrome',
    headless: true,
    launchOptions: {
      args: [
        ...ADAPTER_ARGS[adapter()],
        ...(linuxVulkan ? LINUX_SWIFTSHADER_ARGS : []),
        ...extraArgs,
      ],
      ...(linuxVulkan ? { env: { ...process.env, VK_DRIVER_FILES: LINUX_VULKAN_DRIVER } } : {}),
    },
  };
};
