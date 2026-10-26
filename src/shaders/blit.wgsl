// Presents the linear image: tone mapping (or clamping, for validation and debug views) and the
// sRGB transfer function, as in encodeImage (src/cpu-renderer/render.ts).

@group(0) @binding(0) var<uniform> blit: BlitParams;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var sourceSampler: sampler;

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
  let c = max(textureSampleLevel(source, sourceSampler, in.uv, 0.0).rgb, vec3f(0.0));
  var v = min(c, vec3f(1.0));
  if (blit.toneMapping == 1u) {
    v = 1.0 - exp(-blit.exposure * c);
  }
  return vec4f(srgbEncode(v.r), srgbEncode(v.g), srgbEncode(v.b), 1.0);
}
