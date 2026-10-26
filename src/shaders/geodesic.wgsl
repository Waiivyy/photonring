// Geodesic integration on the GPU: the WGSL twin of integrateBinet and traceRay
// (src/physics/integrators.ts, src/physics/raytrace.ts). f32 throughout. The inner loop uses only
// +, - and *, which WGSL requires to be correctly rounded. The escape direction is built by a
// rotation recurrence instead of sin/cos, whose WGSL accuracy is only 2^-11 (docs/DESIGN.md).

struct Trace {
  termination: u32,
  dir: vec3f,
  phiEnd: f32,
  steps: u32,
}

fn binetAcc(u: f32, m3: f32) -> f32 {
  return m3 * u * u - u;
}

// Cubic Hermite interpolant of u over one step, at fraction t of the step.
fn hermiteValue(u0: f32, w0: f32, u1: f32, w1: f32, h: f32, t: f32) -> f32 {
  let t2 = t * t;
  let t3 = t2 * t;
  let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
  let h10 = t3 - 2.0 * t2 + t;
  let h01 = 3.0 * t2 - 2.0 * t3;
  let h11 = t3 - t2;
  return h00 * u0 + h10 * (h * w0) + h01 * u1 + h11 * (h * w1);
}

// Fraction of the step where the interpolant equals goal: bracketed Newton, as on the CPU.
fn hermiteSolve(u0: f32, w0: f32, u1: f32, w1: f32, h: f32, goal: f32) -> f32 {
  let m0 = h * w0;
  let m1 = h * w1;
  let rising = u1 > u0;
  var lo = 0.0;
  var hi = 1.0;
  var t = (u0 - goal) / (u0 - u1);
  for (var i = 0; i < 8; i++) {
    let t2 = t * t;
    let value = hermiteValue(u0, w0, u1, w1, h, t) - goal;
    if (value == 0.0) {
      break;
    }
    if ((value < 0.0) == rising) {
      lo = t;
    } else {
      hi = t;
    }
    let slope = (6.0 * t2 - 6.0 * t) * u0 + (3.0 * t2 - 4.0 * t + 1.0) * m0
      + (6.0 * t - 6.0 * t2) * u1 + (3.0 * t2 - 2.0 * t) * m1;
    let next = t - value / slope;
    if (abs(next - t) <= 1e-6) {
      t = next;
      break;
    }
    if (next >= lo && next <= hi) {
      t = next;
    } else {
      t = 0.5 * (lo + hi);
    }
  }
  return clamp(t, 0.0, 1.0);
}

// (cos x, sin x) for |x| <= 0.1 by Taylor series, accurate to f32 rounding.
fn cosSinSmall(x: f32) -> vec2f {
  let x2 = x * x;
  let s = x * (1.0 - x2 / 6.0 * (1.0 - x2 / 20.0 * (1.0 - x2 / 42.0)));
  let c = 1.0 - x2 / 2.0 * (1.0 - x2 / 12.0 * (1.0 - x2 / 30.0));
  return vec2f(c, s);
}

// Traces a ray backwards from a static observer at `origin` with unit local direction d.
fn traceGeodesic(origin: vec3f, d: vec3f) -> Trace {
  var out: Trace;
  out.termination = ESCAPED;
  out.dir = d;
  out.phiEnd = 0.0;
  out.steps = 0u;

  let r0 = length(origin);
  let e1 = origin / r0;
  let cosPsi = dot(d, e1);
  let tangential = d - cosPsi * e1;
  let sinPsi = length(tangential);
  let mass = params.M;
  if (sinPsi < RADIAL_SIN || mass == 0.0) {
    // Radial rays and flat space: straight lines.
    if (cosPsi <= 0.0 && mass != 0.0) {
      out.termination = CAPTURED;
    }
    return out;
  }
  let e2 = tangential / sinPsi;

  let m3 = 3.0 * mass;
  let uCapture = 1.0 / m3;
  let h = params.dphi;
  let hHalf = 0.5 * h;
  let hSixth = h / 6.0;
  var u = 1.0 / r0;
  var w = -u * sqrt(1.0 - 2.0 * mass * u) * (cosPsi / sinPsi);
  // (cos, sin) of the orbital angle reached after n whole steps.
  var c = 1.0;
  var s = 0.0;

  for (var n = 0u; n < params.maxSteps; n++) {
    let k1u = w;
    let k1w = binetAcc(u, m3);
    let k2u = w + hHalf * k1w;
    let k2w = binetAcc(u + hHalf * k1u, m3);
    let k3u = w + hHalf * k2w;
    let k3w = binetAcc(u + hHalf * k2u, m3);
    let k4u = w + h * k3w;
    let k4w = binetAcc(u + h * k3u, m3);
    let uNext = u + hSixth * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    let wNext = w + hSixth * (k1w + 2.0 * k2w + 2.0 * k3w + k4w);

    if (uNext <= 0.0) {
      let t = hermiteSolve(u, w, uNext, wNext, h, 0.0);
      let cs = cosSinSmall(t * h);
      let cf = c * cs.x - s * cs.y;
      let sf = s * cs.x + c * cs.y;
      out.dir = normalize(cf * e1 + sf * e2);
      out.phiEnd = f32(n) * h + t * h;
      out.steps = n + 1u;
      return out;
    }
    if (uNext >= uCapture && wNext > 0.0) {
      out.termination = CAPTURED;
      out.phiEnd = f32(n + 1u) * h;
      out.steps = n + 1u;
      return out;
    }
    u = uNext;
    w = wNext;
    let cn = c * params.cosStep - s * params.sinStep;
    s = s * params.cosStep + c * params.sinStep;
    c = cn;
  }
  out.termination = STEP_LIMIT;
  out.phiEnd = f32(params.maxSteps) * h;
  out.steps = params.maxSteps;
  return out;
}
