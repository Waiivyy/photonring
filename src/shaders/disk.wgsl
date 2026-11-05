// Thin-disk emission on the GPU: the WGSL twin of the per-crossing part of compositeDisk
// (src/physics/disk.ts). Only sqrt and division, whose WGSL accuracy is a few ULP; pow would be
// inherited from exp2 and log2 and is much looser.

// Light from the disk at radius r, seen along a photon with conserved L_z / E: a blackbody at
// g T(r), with T(r) = k x^(-3/4) (1 - x^(-1/2))^(1/4), x = r / r_in, and
// g = g_obs sqrt(1 - 3M/r) / (1 - Omega L_z/E), Omega = sqrt(M / r^3). Negative (out of gamut)
// channels are clamped to zero.
fn diskEmission(r: f32, lzOverE: f32) -> vec3f {
  return max(blackbody(shiftedTemperature(r, lzOverE)).xyz, vec3f(0.0));
}

// g T(r): the temperature the observer sees, as above.
fn shiftedTemperature(r: f32, lzOverE: f32) -> f32 {
  let mass = params.M;
  let s = sqrt(params.diskInner / r);
  let temperature = params.diskTemperatureScale * s * sqrt(s) * sqrt(sqrt(max(1.0 - s, 0.0)));
  let omega = sqrt(mass / r) / r;
  let g = params.gObserver * sqrt(1.0 - 3.0 * mass / r) / (1.0 - omega * lzOverE);
  return g * temperature;
}

// Light of one crossing in the current mode. The EHT-style view takes the brightness at all
// frequencies, (g T-hat)^4 as a grey value (compositeDiskBolometric): there the host passes
// diskTemperatureScale(1), so the temperature above is T-hat, 1 at its peak. Two squarings, no pow.
fn diskLight(r: f32, lzOverE: f32) -> vec3f {
  if (params.mode == MODE_EHT) {
    let q = shiftedTemperature(r, lzOverE);
    let q2 = q * q;
    return vec3f(q2 * q2);
  }
  return diskEmission(r, lzOverE);
}
