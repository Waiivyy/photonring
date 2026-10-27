// Assembles the WGSL modules: the generated header (structs and constants from TypeScript) first,
// then the hand-written shader files, which Vite imports as text.
import blitSource from '../shaders/blit.wgsl?raw';
import diskSource from '../shaders/disk.wgsl?raw';
import geodesicSource from '../shaders/geodesic.wgsl?raw';
import renderSource from '../shaders/render.wgsl?raw';
import starfieldSource from '../shaders/starfield.wgsl?raw';
import { wgslHeader, type LutParams } from './host/wgsl.ts';

export function computeShaderSource(lut: LutParams): string {
  return [wgslHeader(lut), renderSource, geodesicSource, diskSource, starfieldSource].join('\n');
}

export function blitShaderSource(lut: LutParams): string {
  return [wgslHeader(lut), blitSource].join('\n');
}
