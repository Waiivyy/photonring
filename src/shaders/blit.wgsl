// Presents the linear image: tone mapping (or clamping, for validation and debug views) and the
// sRGB transfer function, as in encodeImage (src/cpu-renderer/render.ts). The source is either the
// full image, where anti-aliased pixels (alpha > 0 in the refined image) replace the one-sample
// image, or the reduced-resolution preview, upscaled with bilinear filtering. The EHT-style view
// has its own fragment entry point (fragmentEht), after the passes of eht.wgsl.

@group(0) @binding(0) var<uniform> blit: BlitParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;
@group(0) @binding(3) var refinedImage: texture_2d<f32>;
@group(0) @binding(4) var preview: texture_2d<f32>;
// EHT-style view only: the normalised reduced image, the colour table and the plan.
@group(0) @binding(5) var ehtImage: texture_2d<f32>;
@group(0) @binding(6) var<uniform> ehtTable: array<vec4f, EHT_TABLE_SIZE>;
@group(0) @binding(7) var<uniform> ehtView: EhtParams;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// One triangle covering the viewport.
@vertex
fn vertexMain(@builtin(vertex_index) i: u32) -> VertexOut {
  let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(i & 2u) * 2.0 - 1.0;
  var out: VertexOut;
  out.position = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f(0.5 * x + 0.5, 0.5 - 0.5 * y);
  return out;
}

fn srgbEncode(c: f32) -> f32 {
  return select(1.055 * pow(c, 1.0 / 2.4) - 0.055, 12.92 * c, c <= 0.0031308);
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  var c: vec3f;
  if (blit.source == 1u) {
    // Clamped half a texel inside the rendered corner, so nothing outside it bleeds in.
    let texel = 0.5 / vec2f(textureDimensions(preview));
    let uv = clamp(in.uv * blit.previewScale, texel, blit.previewScale - texel);
    c = textureSampleLevel(preview, sourceSampler, uv, 0.0).rgb;
  } else {
    let p = vec2i(in.position.xy);
    let refined = textureLoad(refinedImage, p, 0);
    c = textureLoad(source, p, 0).rgb;
    if (refined.a > 0.0) {
      c = refined.rgb;
    }
  }
  c = max(c, vec3f(0.0));
  var v = min(c, vec3f(1.0));
  if (blit.toneMapping == 1u) {
    v = 1.0 - exp(-blit.exposure * c);
  }
  return vec4f(srgbEncode(v.r), srgbEncode(v.g), srgbEncode(v.b), 1.0);
}

// EHT-style view: bilinear upsample of the normalised reduced image at the pixel centre (reduced
// texel l is centred on full-resolution pixel coordinate (l + 1/2) f), then the false-colour
// table with linear interpolation. Its entries are display values: no sRGB encoding here.
@fragment
fn fragmentEht(in: VertexOut) -> @location(0) vec4f {
  let uv = in.position.xy / (f32(ehtView.factor) * vec2f(ehtView.lowSize));
  let x = clamp(textureSampleLevel(ehtImage, sourceSampler, uv, 0.0).r, 0.0, 1.0);
  let u = x * f32(EHT_TABLE_SIZE - 1u);
  let i = min(u32(u), EHT_TABLE_SIZE - 2u);
  return vec4f(mix(ehtTable[i].rgb, ehtTable[i + 1u].rgb, u - f32(i)), 1.0);
}
