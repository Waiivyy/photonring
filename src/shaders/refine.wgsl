// Adaptive anti-aliasing, the second pass: the WGSL twin of src/gpu/host/antialias.ts. A pixel
// whose centre lies in the critical band, or whose one-sample value differs visibly from a
// neighbour's, gets the 3 x 3 grid of samples the CPU renderer uses (the centre one is the first
// pass's sample) and alpha 9. Other pixels are left alone; alpha 0 tells the blit to show the
// first pass there.

@group(1) @binding(1) var firstPass: texture_2d<f32>;
@group(1) @binding(2) var refined: texture_storage_2d<rgba16float, write>;

// Luminance, tone mapped (or clamped) and sRGB-encoded, as perceivedValue.
fn perceived(c: vec3f) -> f32 {
  let y = max(dot(c, LUMINANCE_WEIGHTS), 0.0);
  var v = min(y, 1.0);
  if (params.toneMapping == 1u) {
    v = 1.0 - exp(-params.exposure * y);
  }
  return select(1.055 * pow(v, 1.0 / 2.4) - 0.055, 12.92 * v, v <= 0.0031308);
}

@compute @workgroup_size(8, 8)
fn refineTile(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.tileSize.x || gid.y >= params.tileSize.y) {
    return;
  }
  let px = params.tileOrigin + gid.xy;
  if (px.x >= params.width || px.y >= params.height) {
    return;
  }
  let p = vec2i(px);
  let centre = textureLoad(firstPass, p, 0).rgb;
  let cosToHole = dot(pixelDirection(vec2f(px) + vec2f(0.5)), -params.position / params.r0);
  var refine = cosToHole >= params.bandCosMin && cosToHole <= params.bandCosMax;
  if (!refine) {
    let v0 = perceived(centre);
    let last = vec2i(i32(params.width) - 1, i32(params.height) - 1);
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let q = clamp(p + vec2i(dx, dy), vec2i(0), last);
        if (abs(perceived(textureLoad(firstPass, q, 0).rgb) - v0) > params.aaThreshold) {
          refine = true;
        }
      }
    }
  }
  if (!refine) {
    return;
  }
  var sum = centre;
  for (var sy = 0; sy < 3; sy++) {
    for (var sx = 0; sx < 3; sx++) {
      if (sx != 1 || sy != 1) {
        sum += shadeSample(pixelDirection(vec2f(px) + (vec2f(f32(sx), f32(sy)) + 0.5) / 3.0));
      }
    }
  }
  textureStore(refined, p, vec4f(sum / 9.0, 9.0));
}
