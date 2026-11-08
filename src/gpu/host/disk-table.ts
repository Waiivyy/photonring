// Page-Thorne disk temperature table for the shaders. T-hat = (F / F_peak)^(1/4) factors as
// s^(3/2) (1 - s)^(1/2) C(s), s = sqrt(6M / r): the shader forms the first two factors from square
// roots and divisions, and C, smooth and bounded on [0, 1], comes from this table, built by the
// f64 physics library and interpolated linearly in s. The renderer binds it at group 0, binding 3
// (src/shaders/render.wgsl), and temperatureHat in src/shaders/disk.wgsl reads it;
// tableTemperatureHat is the CPU twin of that lookup, step for step.
import { diskTemperatureFactor } from '../../physics/index.ts';

export const DISK_TABLE_SIZE = 1024;

/** C(i / (size - 1)) for i = 0 to size - 1, f32 as uploaded to the GPU. */
export function buildDiskTable(size = DISK_TABLE_SIZE): Float32Array {
  if (!(Number.isInteger(size) && size >= 2)) throw new RangeError('size must be an integer >= 2');
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) table[i] = diskTemperatureFactor(i / (size - 1));
  return table;
}

export const DISK_TABLE = buildDiskTable();

/**
 * T-hat at radius r for mass M, by the WGSL steps: zero at and inside 6M; s = sqrt(6M / r);
 * 1 - s = ((r - 6M) / r) / (1 + s), which does not cancel near the ISCO because r - 6M is exact
 * there; C by linear interpolation between the two nodes around s (N - 1) for N entries.
 */
export function tableTemperatureHat(table: Float32Array, r: number, M: number): number {
  const isco = 6 * M;
  if (!(r > isco)) return 0;
  const s = Math.sqrt(isco / r);
  const oneMinusS = (r - isco) / r / (1 + s);
  const n = table.length;
  const x = s * (n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const t0 = table[i] as number;
  const t1 = table[i + 1] as number;
  const c = t0 + (x - i) * (t1 - t0);
  return s * Math.sqrt(s) * Math.sqrt(oneMinusS) * c;
}
