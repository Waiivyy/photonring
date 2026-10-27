// Geodesic integration on the GPU: the WGSL twin of integrateBinet and traceRay
// (src/physics/integrators.ts, src/physics/raytrace.ts). f32 throughout. The inner loop uses only
// +, - and *, which WGSL requires to be correctly rounded. The escape direction is built by a
// rotation recurrence instead of sin/cos, whose WGSL accuracy is only 2^-11 (docs/DESIGN.md).

struct Trace {
  termination: u32,
  dir: vec3f,
  phiEnd: f32,
  steps: u32,
  // Disk-plane crossings with u > 0, in order along the traced path, and the disk light they
  // contribute (front to back), as in compositeDisk (src/physics/disk.ts).
  crossings: u32,
  emission: vec3f,
  transmittance: f32,
}

// True only in the parity pipeline: record crossing radii for the tests. As a pipeline constant
// it is folded away in the image pipeline.
override LOG_CROSSINGS: bool = false;
var<private> crossingLog: array<f32, CROSSING_LOG_SIZE>;

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

// atan(x) for |x| <= 0.06 by Taylor series, accurate to f32 rounding.
fn atanSmall(x: f32) -> f32 {
  let x2 = x * x;
  return x * (1.0 - x2 * (1.0 / 3.0 - x2 * (0.2 - x2 / 7.0)));
}

// Records a disk-plane crossing at radius r and composites its light front to back, as in
// compositeDisk (src/physics/disk.ts). Returns true when nothing behind it can be seen.
fn addCrossing(out: ptr<function, Trace>, r: f32, lzOverE: f32) -> bool {
  if (LOG_CROSSINGS && (*out).crossings < CROSSING_LOG_SIZE) {
    crossingLog[(*out).crossings] = r;
  }
  (*out).crossings += 1u;
  if (r < params.diskInner || r > params.diskOuter) {
    return false;
  }
  (*out).emission += (*out).transmittance * params.diskOpacity * diskEmission(r, lzOverE);
  (*out).transmittance *= 1.0 - params.diskOpacity;
  return (*out).transmittance == 0.0;
}

// Traces a ray backwards from a static observer at `origin` with unit local direction d. With
// stopWhenOpaque, tracing ends at the first crossing that leaves no transmittance (OPAQUE).
fn traceGeodesic(origin: vec3f, d: vec3f, stopWhenOpaque: bool) -> Trace {
  var out: Trace;
  out.termination = ESCAPED;
  out.dir = d;
  out.phiEnd = 0.0;
  out.steps = 0u;
  out.crossings = 0u;
  out.emission = vec3f(0.0);
  out.transmittance = 1.0;

  let r0 = length(origin);
  let e1 = origin / r0;
  let cosPsi = dot(d, e1);
  let tangential = d - cosPsi * e1;
  let sinPsi = length(tangential);
  let mass = params.M;
  let diskOn = params.disk != 0u;
  if (sinPsi < RADIAL_SIN) {
    // Radial rays are straight lines; inward ones end at the centre without meeting the disk.
    if (cosPsi <= 0.0 && mass != 0.0) {
      out.termination = CAPTURED;
    }
    return out;
  }
  let e2 = tangential / sinPsi;
  // Conserved L_z / E of the physical photon (opposite to the traced ray), as in traceRay.
  let lzOverE = -(r0 * sinPsi / sqrt(1.0 - 2.0 * mass / r0)) * (e1.x * e2.y - e1.y * e2.x);
  if (mass == 0.0) {
    // Flat space: the straight line itself.
    if (diskOn && d.z != 0.0) {
      let along = -origin.z / d.z;
      if (along > 0.0) {
        let p = origin + along * d;
        _ = addCrossing(&out, length(p.xy), lzOverE);
      }
    }
    return out;
  }

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
  // Height above the disk plane divided by r: zeta = e1.z cos(phi) + e2.z sin(phi). Crossings are
  // its sign changes; each step boundary value is computed once, so none is missed or doubled.
  var zeta = e1.z;

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

    // Where in this step the ray ends, if it does.
    var ends = false;
    var t = 1.0;
    if (uNext <= 0.0) {
      ends = true;
      t = hermiteSolve(u, w, uNext, wNext, h, 0.0);
    } else if (uNext >= uCapture && wNext > 0.0) {
      ends = true;
      out.termination = CAPTURED;
      t = hermiteSolve(u, w, uNext, wNext, h, uCapture);
    }
    let cn = c * params.cosStep - s * params.sinStep;
    let sn = s * params.cosStep + c * params.sinStep;
    let zetaNext = e1.z * cn + e2.z * sn;

    if (diskOn && ((zeta > 0.0 && zetaNext <= 0.0) || (zeta < 0.0 && zetaNext >= 0.0))) {
      // Within the step zeta = zeta0 cos(tau) + zetaDot sin(tau), zero at tan(tau) = -zeta0/zetaDot.
      let zetaDot = e2.z * c - e1.z * s;
      let tc = clamp(atanSmall(clamp(-zeta / zetaDot, -0.06, 0.06)) / h, 0.0, 1.0);
      if (!ends || tc < t) {
        let uc = hermiteValue(u, w, uNext, wNext, h, tc);
        if (uc > 0.0 && addCrossing(&out, 1.0 / uc, lzOverE) && stopWhenOpaque) {
          out.termination = OPAQUE;
          out.phiEnd = f32(n) * h + tc * h;
          out.steps = n + 1u;
          return out;
        }
      }
    }

    if (ends) {
      if (out.termination == ESCAPED) {
        let cs = cosSinSmall(t * h);
        let cf = c * cs.x - s * cs.y;
        let sf = s * cs.x + c * cs.y;
        out.dir = normalize(cf * e1 + sf * e2);
      }
      out.phiEnd = f32(n) * h + t * h;
      out.steps = n + 1u;
      return out;
    }
    u = uNext;
    w = wNext;
    c = cn;
    s = sn;
    zeta = zetaNext;
  }
  out.termination = STEP_LIMIT;
  out.phiEnd = f32(params.maxSteps) * h;
  out.steps = params.maxSteps;
  return out;
}
