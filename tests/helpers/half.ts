// float -> IEEE 754 binary16 bits, round to nearest even, for building synthetic GPU readbacks.
export function floatToHalf(x: number): number {
  if (Number.isNaN(x)) return 0x7e00;
  const sign = x < 0 || Object.is(x, -0) ? 0x8000 : 0;
  const a = Math.abs(x);
  if (a === Infinity) return sign | 0x7c00;
  if (a < 2 ** -24 / 2) return sign;
  if (a < 2 ** -14) {
    // Subnormal: a / 2^-24 rounded to nearest even.
    const m = a / 2 ** -24;
    const r = Math.round(m);
    const even = Math.abs(m - Math.trunc(m) - 0.5) < 1e-12 && r % 2 === 1 ? r - 1 : r;
    return sign | even;
  }
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e--;
  if (2 ** (e + 1) <= a) e++;
  let m = (a / 2 ** e - 1) * 1024;
  let r = Math.round(m);
  if (Math.abs(m - Math.trunc(m) - 0.5) < 1e-12 && r % 2 === 1) r--;
  if (r === 1024) {
    r = 0;
    e++;
  }
  if (e > 15) return sign | 0x7c00;
  m = r;
  return sign | ((e + 15) << 10) | m;
}
