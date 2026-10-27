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

// Refined pixels of one workgroup and their 8 extra samples. Spreading the samples of all the
// group's refined pixels over all 64 threads costs ceil(8k / 64) traced rays for k refined
// pixels, instead of 8 rays for any group with at least one: refined pixels are sparse and
// scattered (stars, edges), so without this almost every SIMD group would wait for 8 rays.
var<workgroup> refineList: array<u32, 64>;
var<workgroup> refineCount: atomic<u32>;
var<workgroup> refineJobs: u32;
var<workgroup> sampleColours: array<vec3f, 512>;

// Index 0 to 7 of the extra samples to its cell in the 3 x 3 grid, skipping the centre (4).
fn gridCell(s: u32) -> vec2f {
  let cell = s + select(0u, 1u, s >= 4u);
  return vec2f(f32(cell % 3u), f32(cell / 3u));
}

@compute @workgroup_size(8, 8)
fn refineTile(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(local_invocation_index) li: u32,
  @builtin(workgroup_id) wid: vec3u,
) {
  if (li == 0u) {
    atomicStore(&refineCount, 0u);
  }
  workgroupBarrier();

  // Every thread reaches every barrier, so out-of-range threads only skip the work.
  let local = wid.xy * 8u + lid.xy;
  let px = params.tileOrigin + local;
  let inImage = local.x < params.tileSize.x && local.y < params.tileSize.y && px.x < params.width
    && px.y < params.height;
  var refine = false;
  var slot = 0u;
  var centre = vec3f(0.0);
  if (inImage) {
    let p = vec2i(px);
    centre = textureLoad(firstPass, p, 0).rgb;
    let cosToHole = dot(pixelDirection(vec2f(px) + vec2f(0.5)), -params.position / params.r0);
    refine = cosToHole >= params.bandCosMin && cosToHole <= params.bandCosMax;
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
    if (refine) {
      slot = atomicAdd(&refineCount, 1u);
      refineList[slot] = li;
    }
  }
  workgroupBarrier();
  if (li == 0u) {
    refineJobs = 8u * atomicLoad(&refineCount);
  }
  let jobs = workgroupUniformLoad(&refineJobs);

  for (var j = li; j < jobs; j += 64u) {
    let owner = refineList[j / 8u];
    let ownerPx = params.tileOrigin + wid.xy * 8u + vec2u(owner % 8u, owner / 8u);
    sampleColours[j] = shadeSample(pixelDirection(vec2f(ownerPx) + (gridCell(j % 8u) + 0.5) / 3.0));
  }
  workgroupBarrier();

  if (refine) {
    var sum = centre;
    for (var s = 0u; s < 8u; s++) {
      sum += sampleColours[8u * slot + s];
    }
    textureStore(refined, vec2i(px), vec4f(sum / 9.0, 9.0));
  }
}
