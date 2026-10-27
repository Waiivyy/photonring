// Bindings and compute entry points. Group 0: parameters and colour table. Group 1: the output
// image (renderTile). Group 2: buffers of the parity entry points used by the GPU tests.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> lut: array<vec4f>;

@group(1) @binding(0) var outImage: texture_storage_2d<rgba16float, write>;

struct RayIn {
  origin: vec3f,
  pad0: f32,
  dir: vec3f,
  pad1: f32,
}

struct RayOut {
  dir: vec3f,
  termination: u32,
  phiEnd: f32,
  steps: u32,
  crossings: u32,
  transmittance: f32,
  emission: vec3f,
  pad0: u32,
  radii: array<f32, CROSSING_LOG_SIZE>,
}

@group(2) @binding(0) var<storage, read> rayIn: array<RayIn>;
@group(2) @binding(1) var<storage, read_write> rayOut: array<RayOut>;
@group(2) @binding(2) var<storage, read> skyIn: array<vec4f>;
@group(2) @binding(3) var<storage, read_write> skyOut: array<vec4f>;

// Pinhole camera, identical to pixelDirection in src/physics/camera.ts.
fn pixelDirection(p: vec2f) -> vec3f {
  let sx = (2.0 * p.x / f32(params.width) - 1.0) * params.aspect * params.tanHalfFovY;
  let sy = (1.0 - 2.0 * p.y / f32(params.height)) * params.tanHalfFovY;
  return normalize(params.forward + sx * params.right + sy * params.up);
}

fn debugColour(termination: u32) -> vec3f {
  if (termination == ESCAPED) {
    return DEBUG_ESCAPED;
  }
  if (termination == CAPTURED) {
    return DEBUG_CAPTURED;
  }
  return DEBUG_STEP_LIMIT;
}

// Colour of one sample: disk light, then the sky behind whatever the disk lets through, as in
// shade (src/cpu-renderer/render.ts).
fn shadeSample(d: vec3f) -> vec3f {
  let tr = traceGeodesic(params.position, d, true);
  var colour = tr.emission;
  if (tr.termination == ESCAPED && tr.transmittance > 0.0) {
    var sky = vec3f(1.0);
    if (params.sky == 0u) {
      sky = skyRadiance(tr.dir, params.gObserver);
    }
    colour += tr.transmittance * sky;
  }
  return colour;
}

@compute @workgroup_size(8, 8)
fn renderTile(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.tileSize.x || gid.y >= params.tileSize.y) {
    return;
  }
  let px = params.tileOrigin + gid.xy;
  if (px.x >= params.width || px.y >= params.height) {
    return;
  }
  let d = pixelDirection(vec2f(px) + vec2f(0.5));
  var colour = vec3f(0.0);
  if (params.mode == 1u) {
    colour = debugColour(traceGeodesic(params.position, d, false).termination);
  } else {
    colour = shadeSample(d);
  }
  textureStore(outImage, vec2i(px), vec4f(colour, 1.0));
}

@compute @workgroup_size(64)
fn traceRays(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&rayIn)) {
    return;
  }
  let tr = traceGeodesic(rayIn[i].origin, rayIn[i].dir, false);
  rayOut[i] = RayOut(tr.dir, tr.termination, tr.phiEnd, tr.steps, tr.crossings, tr.transmittance,
    tr.emission, 0u, crossingLog);
}

@compute @workgroup_size(64)
fn skySamples(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&skyIn)) {
    return;
  }
  let v = skyIn[i];
  skyOut[i] = vec4f(skyRadiance(v.xyz, v.w), 0.0);
}
