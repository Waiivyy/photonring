// Uniform buffer layout. One field list produces both the WGSL struct declaration and the byte
// layout used to fill the buffer, so the two cannot drift apart. Offsets follow the WGSL
// alignment rules for uniform buffers (vec3 aligns to 16 bytes but occupies 12).

export type FieldType = 'f32' | 'u32' | 'vec2f' | 'vec2u' | 'vec3f' | 'vec4f';
export type StructField = readonly [name: string, type: FieldType];

const INFO: Record<FieldType, { align: number; size: number; count: number; int: boolean }> = {
  f32: { align: 4, size: 4, count: 1, int: false },
  u32: { align: 4, size: 4, count: 1, int: true },
  vec2f: { align: 8, size: 8, count: 2, int: false },
  vec2u: { align: 8, size: 8, count: 2, int: true },
  vec3f: { align: 16, size: 12, count: 3, int: false },
  vec4f: { align: 16, size: 16, count: 4, int: false },
};

export interface StructLayout {
  readonly offsets: Record<string, number>;
  readonly size: number;
}

export function layoutStruct(fields: readonly StructField[]): StructLayout {
  const offsets: Record<string, number> = {};
  let offset = 0;
  let maxAlign = 4;
  for (const [name, type] of fields) {
    const { align, size } = INFO[type];
    offset = Math.ceil(offset / align) * align;
    offsets[name] = offset;
    offset += size;
    maxAlign = Math.max(maxAlign, align);
  }
  // Uniform-buffer structs are rounded up to a multiple of 16 bytes.
  const structAlign = Math.max(16, maxAlign);
  return { offsets, size: Math.ceil(offset / structAlign) * structAlign };
}

export function wgslStruct(name: string, fields: readonly StructField[]): string {
  return `struct ${name} {\n${fields.map(([n, t]) => `  ${n}: ${t},\n`).join('')}}\n`;
}

export type StructValues = Record<string, number | readonly number[]>;

export function packStruct(fields: readonly StructField[], values: StructValues): ArrayBuffer {
  const { offsets, size } = layoutStruct(fields);
  const buffer = new ArrayBuffer(size);
  const f32 = new Float32Array(buffer);
  const u32 = new Uint32Array(buffer);
  for (const [name, type] of fields) {
    const value = values[name];
    if (value === undefined) throw new Error(`missing value for uniform field ${name}`);
    const items = typeof value === 'number' ? [value] : value;
    const { count, int } = INFO[type];
    if (items.length !== count) throw new RangeError(`${name} needs ${count} components`);
    items.forEach((v, i) => {
      const index = (offsets[name] as number) / 4 + i;
      if (int) {
        if (!(Number.isInteger(v) && v >= 0 && v < 2 ** 32))
          throw new RangeError(`${name}: not a u32`);
        u32[index] = v;
      } else {
        if (!Number.isFinite(v)) throw new RangeError(`${name}: not finite`);
        f32[index] = v;
      }
    });
  }
  return buffer;
}
