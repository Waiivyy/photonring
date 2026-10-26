// WebGPU adapter and device setup. Requests timestamp queries when the adapter offers them;
// everything else uses the default limits, which the renderer checks against.

export type WebGpuInit =
  | {
      readonly ok: true;
      readonly adapter: GPUAdapter;
      readonly device: GPUDevice;
      readonly timestampQuery: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'no-webgpu' | 'no-adapter' | 'no-device';
      readonly message: string;
    };

export async function initWebGpu(): Promise<WebGpuInit> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    return { ok: false, reason: 'no-webgpu', message: 'This browser does not expose WebGPU.' };
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch {
    adapter = null;
  }
  if (!adapter) {
    return {
      ok: false,
      reason: 'no-adapter',
      message: 'WebGPU is available, but no suitable GPU adapter was found.',
    };
  }
  const timestampQuery = adapter.features.has('timestamp-query');
  try {
    const device = await adapter.requestDevice({
      requiredFeatures: timestampQuery ? ['timestamp-query'] : [],
    });
    return { ok: true, adapter, device, timestampQuery };
  } catch (e) {
    return {
      ok: false,
      reason: 'no-device',
      message: `The GPU device could not be created: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
