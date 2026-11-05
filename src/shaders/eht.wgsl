// The EHT-style view's post-process on the GPU, the twin of ehtLinear (src/gpu/host/eht-post.ts):
// a tent reduce by f, a separable Gaussian on the reduced grid, its peak, and the normalisation
// to that peak. Each pass is its own entry point; values live in the red channel of rgba16float
// images. The blit then upsamples bilinearly and applies the colour map (blit.wgsl).

@group(0) @binding(0) var<uniform> ep: EhtParams;
@group(0) @binding(1) var srcImage: texture_2d<f32>;
@group(0) @binding(2) var srcRefined: texture_2d<f32>;
@group(0) @binding(3) var srcPreview: texture_2d<f32>;
@group(0) @binding(4) var srcSampler: sampler;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var<storage, read> weights: array<f32>;
@group(0) @binding(7) var low: texture_2d<f32>;
@group(0) @binding(8) var<storage, read_write> peak: array<f32>;

// Linear brightness of a full-resolution pixel, as the colour blit reads it: the anti-aliased
// value where the refined image has one, else the first pass; or the preview, sampled
// bilinearly at the pixel centre and clamped half a texel inside its rendered corner.
fn fullValue(p: vec2i) -> f32 {
  if (ep.source == 1u) {
    let texel = 0.5 / vec2f(textureDimensions(srcPreview));
    let uv = (vec2f(p) + 0.5) / vec2f(ep.imageSize) * ep.previewScale;
    return textureSampleLevel(srcPreview, srcSampler, clamp(uv, texel, ep.previewScale - texel), 0.0).r;
  }
  let refined = textureLoad(srcRefined, p, 0);
  if (refined.a > 0.0) {
    return refined.r;
  }
  return textureLoad(srcImage, p, 0).r;
}

fn inLow(p: vec2i) -> bool {
  return all(p >= vec2i(0)) && all(p < vec2i(ep.lowSize));
}

// Reduced texel l (centre (l + 1/2) f) takes max(0, 1 - |x| / f) / f of each pixel at offset x
// along each axis; pixels outside the image count as 0 (reduceTent1D).
@compute @workgroup_size(8, 8)
fn ehtReduce(@builtin(global_invocation_id) gid: vec3u) {
  let l = vec2i(gid.xy);
  if (!inLow(l)) {
    return;
  }
  let f = i32(ep.factor);
  let ff = f32(ep.factor);
  let centre = (vec2f(l) + 0.5) * ff;
  let size = vec2i(ep.imageSize);
  var acc = 0.0;
  for (var j = l.y * f - f; j < l.y * f + 2 * f; j++) {
    let wy = 1.0 - abs(f32(j) + 0.5 - centre.y) / ff;
    if (j < 0 || j >= size.y || wy <= 0.0) {
      continue;
    }
    for (var i = l.x * f - f; i < l.x * f + 2 * f; i++) {
      let wx = 1.0 - abs(f32(i) + 0.5 - centre.x) / ff;
      if (i < 0 || i >= size.x || wx <= 0.0) {
        continue;
      }
      acc += wx * wy * fullValue(vec2i(i, j));
    }
  }
  textureStore(dst, l, vec4f(acc / (ff * ff), 0.0, 0.0, 1.0));
}

// Convolution with the plan's weights along one axis, zero outside the reduced grid (blur1D).
fn blurAlong(p: vec2i, axis: vec2i) -> f32 {
  let r = i32(ep.radius);
  var acc = 0.0;
  for (var q = -r; q <= r; q++) {
    let s = p + q * axis;
    if (inLow(s)) {
      acc += weights[u32(q + r)] * textureLoad(low, s, 0).r;
    }
  }
  return acc;
}

@compute @workgroup_size(8, 8)
fn ehtBlurH(@builtin(global_invocation_id) gid: vec3u) {
  let p = vec2i(gid.xy);
  if (inLow(p)) {
    textureStore(dst, p, vec4f(blurAlong(p, vec2i(1, 0)), 0.0, 0.0, 1.0));
  }
}

@compute @workgroup_size(8, 8)
fn ehtBlurV(@builtin(global_invocation_id) gid: vec3u) {
  let p = vec2i(gid.xy);
  if (inLow(p)) {
    textureStore(dst, p, vec4f(blurAlong(p, vec2i(0, 1)), 0.0, 0.0, 1.0));
  }
}

// The largest value on the reduced grid: one workgroup, a strided scan, then a tree in
// workgroup memory. Dispatched once, in the same command encoder as the frame it normalises.
var<workgroup> partial: array<f32, 256>;

@compute @workgroup_size(256)
fn ehtMax(@builtin(local_invocation_index) li: u32) {
  let n = ep.lowSize.x * ep.lowSize.y;
  var m = 0.0;
  for (var k = li; k < n; k += 256u) {
    m = max(m, textureLoad(low, vec2i(i32(k % ep.lowSize.x), i32(k / ep.lowSize.x)), 0).r);
  }
  partial[li] = m;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) {
      partial[li] = max(partial[li], partial[li + s]);
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    peak[0] = partial[0];
  }
}

// x = v / max(peak, floor): continuous, so a nearly empty image fades instead of flipping.
@compute @workgroup_size(8, 8)
fn ehtNormalise(@builtin(global_invocation_id) gid: vec3u) {
  let p = vec2i(gid.xy);
  if (inLow(p)) {
    let v = textureLoad(low, p, 0).r / max(peak[0], ep.floor);
    textureStore(dst, p, vec4f(v, 0.0, 0.0, 1.0));
  }
}
