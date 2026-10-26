// Procedural star field and blackbody colour on the GPU: the WGSL twin of
// src/physics/starfield.ts. Integer hashing makes the star catalogue bit-identical to the CPU's.

// pcg3d of Jarzynski and Olano (2020), JCGT 9(3), section 6.1.
fn pcg3d(seed: vec3u) -> vec3u {
  var v = seed * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v = v ^ (v >> vec3u(16u));
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

// Top 24 bits as a value in [0, 1), exact in f32.
fn unitFromU32(x: u32) -> f32 {
  return f32(x >> 8u) * (1.0 / 16777216.0);
}

// Linear sRGB (xyz) and luminance (w) of a blackbody, from the table built by src/gpu/host/lut.ts.
fn blackbody(temperature: f32) -> vec4f {
  if (!(temperature >= LUT_TMIN)) {
    return vec4f(0.0);
  }
  if (temperature > LUT_TMAX) {
    return lut[LUT_SIZE - 1u] * (temperature / LUT_TMAX);
  }
  let x = log(temperature / LUT_TMIN) * LUT_INV_LOG_RANGE;
  let i = min(u32(x), LUT_SIZE - 2u);
  let f = x - f32(i);
  return mix(lut[i], lut[i + 1u], f);
}

fn skyRadiance(d: vec3f, g: f32) -> vec3f {
  var total = vec3f(0.0);
  for (var l = 0u; l < STAR_LAYER_COUNT; l++) {
    let layer = STAR_LAYERS[l];
    let salt = STAR_SALTS[l];
    let k = layer.x;
    let base = vec3i(floor(d * k));
    let rho = 0.5 / k;
    let rho2 = rho * rho;
    for (var i = -1; i <= 1; i++) {
      for (var j = -1; j <= 1; j++) {
        for (var m = -1; m <= 1; m++) {
          let cell = base + vec3i(i, j, m);
          let h1 = pcg3d(vec3u(bitcast<u32>(cell.x), bitcast<u32>(cell.y), bitcast<u32>(cell.z) ^ salt));
          if (unitFromU32(h1.x) >= layer.y) {
            continue;
          }
          let h2 = pcg3d(h1);
          let q = (vec3f(cell) + vec3f(unitFromU32(h1.y), unitFromU32(h1.z), unitFromU32(h2.x))) / k;
          let r = length(q);
          if (abs(r - 1.0) * k >= 0.5) {
            continue;
          }
          let diff = d - q / r;
          let chord2 = dot(diff, diff);
          if (chord2 >= rho2) {
            continue;
          }
          let weight = (exp(-8.0 * chord2 / rho2) - STAR_TAIL) / (1.0 - STAR_TAIL);
          let a = unitFromU32(h2.z);
          let temperature = 2500.0 + 30000.0 * a * a * a;
          let b = unitFromU32(h2.y);
          let peak = layer.z * b * b * b * b;
          let rest = blackbody(temperature);
          total += (weight * peak / rest.w) * blackbody(g * temperature).xyz;
        }
      }
    }
  }
  return max(total, vec3f(0.0));
}
