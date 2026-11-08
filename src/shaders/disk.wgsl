// Thin-disk emission on the GPU: the WGSL twin of the per-crossing part of compositeDisk
// (src/physics/disk.ts). Only sqrt and division, whose WGSL accuracy is a few ULP; pow would be
// inherited from exp2 and log2 and is much looser, and log would cancel near the ISCO.

// T-hat(r) = (F / F_peak)^(1/4), the Page-Thorne temperature in the gas's own frame over its peak
// value (diskTemperatureHat in src/physics/disk.ts): s^(3/2) (1 - s)^(1/2) C(s), s = sqrt(6M / r),
// from square roots and divisions, times the smooth factor C(s) of the table built in f64
// (src/gpu/host/disk-table.ts), linear in s. The zero torque is at the ISCO, 6M, whatever the
// disk's inner edge, so T-hat is zero at and inside 6M. tableTemperatureHat is the CPU twin of
// these steps.
fn temperatureHat(r: f32) -> f32 {
  let isco = 6.0 * params.M;
  if (!(r > isco)) {
    return 0.0;
  }
  let s = sqrt(isco / r);
  // 1 - s = (1 - s^2) / (1 + s): r - isco is exact near the ISCO when 6M is exact in f32 (M = 1),
  // so this does not cancel.
  let oneMinusS = ((r - isco) / r) / (1.0 + s);
  let x = s * f32(DISK_TABLE_SIZE - 1u);
  let i = min(u32(x), DISK_TABLE_SIZE - 2u);
  let c = diskTable[i] + (x - f32(i)) * (diskTable[i + 1u] - diskTable[i]);
  return s * sqrt(s) * sqrt(oneMinusS) * c;
}

// Light from the disk at radius r, seen along a photon with conserved L_z / E: a blackbody at
// g T_peak T-hat(r), with g = g_obs sqrt(1 - 3M/r) / (1 - Omega L_z/E), Omega = sqrt(M / r^3).
// Negative (out of gamut) channels are clamped to zero.
fn diskEmission(r: f32, lzOverE: f32) -> vec3f {
  return max(blackbody(shiftedTemperature(r, lzOverE)).xyz, vec3f(0.0));
}

// g T_peak T-hat(r): the temperature the observer sees, as above. The flux is in the gas's own
// frame, so g is applied once.
fn shiftedTemperature(r: f32, lzOverE: f32) -> f32 {
  let mass = params.M;
  let omega = sqrt(mass / r) / r;
  let g = params.gObserver * sqrt(1.0 - 3.0 * mass / r) / (1.0 - omega * lzOverE);
  return g * params.diskPeakTemperature * temperatureHat(r);
}

// Light of one crossing in the current mode. The EHT-style view takes the brightness at all
// frequencies, g^4 F-hat = (g T-hat)^4 as a grey value (compositeDiskBolometric): there the host
// passes a peak temperature of 1, so the temperature above is g T-hat. Two squarings, no pow.
fn diskLight(r: f32, lzOverE: f32) -> vec3f {
  if (params.mode == MODE_EHT) {
    let q = shiftedTemperature(r, lzOverE);
    let q2 = q * q;
    return vec3f(q2 * q2);
  }
  return diskEmission(r, lzOverE);
}
