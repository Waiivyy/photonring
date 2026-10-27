// Thin-disk emission on the GPU: the WGSL twin of the per-crossing part of compositeDisk
// (src/physics/disk.ts). Only sqrt and division, whose WGSL accuracy is a few ULP; pow would be
// inherited from exp2 and log2 and is much looser.

// Light from the disk at radius r, seen along a photon with conserved L_z / E: a blackbody at
// g T(r), with T(r) = k x^(-3/4) (1 - x^(-1/2))^(1/4), x = r / r_in, and
// g = g_obs sqrt(1 - 3M/r) / (1 - Omega L_z/E), Omega = sqrt(M / r^3). Negative (out of gamut)
// channels are clamped to zero.
fn diskEmission(r: f32, lzOverE: f32) -> vec3f {
  let mass = params.M;
  let s = sqrt(params.diskInner / r);
  let temperature = params.diskTemperatureScale * s * sqrt(s) * sqrt(sqrt(max(1.0 - s, 0.0)));
  let omega = sqrt(mass / r) / r;
  let g = params.gObserver * sqrt(1.0 - 3.0 * mass / r) / (1.0 - omega * lzOverE);
  return max(blackbody(g * temperature).xyz, vec3f(0.0));
}
