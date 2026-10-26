// Stage 0 precision spike: compares the integrator candidates in f64 and in an f32 emulation.
// Usage: npm run spike            (writes artifacts/spike/precision-spike.md and .json)
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  criticalImpactParameter,
  deflectionAngleElliptic,
  f32,
  f64,
  impactParameterFromLocalAngle,
  traceBinetRK4,
  traceCartesianLeapfrog,
  traceCartesianRK4,
  type PlanarRayResult,
  type Round,
} from '../src/physics/index.ts';
import { exactSweptAngle, inwardPsiForImpactParameter } from '../tests/helpers/reference.ts';

const M = 1;
const BC = criticalImpactParameter(M);
/** One pixel at 1080 rows over a 60 degree vertical field of view. */
const PIXEL = (60 * Math.PI) / 180 / 1080;

interface Config {
  method: string;
  param: number;
  trace: (r0: number, psi: number, round: Round) => PlanarRayResult;
}

const configs: Config[] = [];
for (const dphi of [0.1, 0.05, 0.025, 0.0125]) {
  configs.push({
    method: 'Binet RK4',
    param: dphi,
    trace: (r0, psi, round) => traceBinetRK4(M, r0, psi, { round, dphi, maxSteps: 20000 }),
  });
}
for (const eta of [0.1, 0.05, 0.025, 0.0125]) {
  configs.push({
    method: 'Cartesian RK4',
    param: eta,
    trace: (r0, psi, round) =>
      traceCartesianRK4(M, r0, psi, {
        round,
        eta,
        rEscape: Math.max(1000, 10 * r0),
        maxSteps: 200000,
      }),
  });
}
for (const eta of [0.02, 0.01, 0.005, 0.0025]) {
  configs.push({
    method: 'Cartesian leapfrog',
    param: eta,
    trace: (r0, psi, round) =>
      traceCartesianLeapfrog(M, r0, psi, {
        round,
        eta,
        rEscape: Math.max(1000, 10 * r0),
        maxSteps: 400000,
      }),
  });
}
const precisions: [string, Round][] = [
  ['f64', f64],
  ['f32', f32],
];

/** Counts rounded operations per ray in f32 mode, a rough proxy for GPU arithmetic cost. */
let opCount = 0;
const countingF32: Round = (x) => {
  opCount++;
  return Math.fround(x);
};

const fmt = (x: number, digits = 2) =>
  !Number.isFinite(x) ? String(x) : x === 0 ? '0' : x.toExponential(digits);
const out: string[] = [];
const json: Record<string, unknown> = {};
const log = (line = '') => {
  out.push(line);
  console.log(line);
};

// ---------------------------------------------------------------------------------------------
// A. Deflection relative error, rays from an observer at 1e4 M (close to the from-infinity case).
// "path" isolates the integrator (final position angle against the exact angle to that radius);
// "escape" is what a renderer uses (velocity direction at rEscape, so it includes the bending
// left beyond rEscape for the Cartesian methods).
log('## A. Deflection relative error versus the reference integrals (observer at 10^4 M)');
log();
const ratiosSpec = [1.02, 1.05, 1.1, 1.3, 2, 3, 5, 10, 30, 100];
const ratiosNear = [1.0001, 1.001, 1.01];
const ratiosFar = [300, 1000];
const rFar = 1e4;
log(
  '| method | step | precision | max rel. error, path, 1.02 to 100 b_c | max rel. error, escape direction, 1.02 to 100 b_c | rel. error at 1.001 b_c | rel. error at 1000 b_c | mean steps |',
);
log('|---|---|---|---|---|---|---|---|');
const tableA: unknown[] = [];
for (const cfg of configs) {
  for (const [pname, round] of precisions) {
    let maxPath = 0;
    let maxEscape = 0;
    let steps = 0;
    const errAt = (ratio: number) => {
      const b = ratio * BC;
      const psi = inwardPsiForImpactParameter(rFar, b, M);
      const ray = cfg.trace(rFar, psi, round);
      const alpha = deflectionAngleElliptic(b, M);
      return Math.abs(ray.escapeAngle - exactSweptAngle(rFar, psi, M)) / alpha;
    };
    for (const ratio of ratiosSpec) {
      const b = ratio * BC;
      const psi = inwardPsiForImpactParameter(rFar, b, M);
      const ray = cfg.trace(rFar, psi, round);
      const alpha = deflectionAngleElliptic(b, M);
      const path =
        Math.abs(ray.positionAngle - exactSweptAngle(rFar, psi, M, ray.finalRadius)) / alpha;
      const esc = Math.abs(ray.escapeAngle - exactSweptAngle(rFar, psi, M)) / alpha;
      maxPath = Math.max(maxPath, ray.termination === 'escaped' ? path : Infinity);
      maxEscape = Math.max(maxEscape, ray.termination === 'escaped' ? esc : Infinity);
      steps += ray.steps;
    }
    const near = errAt(ratiosNear[1] as number);
    const far = errAt(ratiosFar[1] as number);
    const mean = steps / ratiosSpec.length;
    tableA.push({
      method: cfg.method,
      step: cfg.param,
      precision: pname,
      maxPath,
      maxEscape,
      near,
      far,
      mean,
    });
    log(
      `| ${cfg.method} | ${cfg.param} | ${pname} | ${fmt(maxPath)} | ${fmt(maxEscape)} | ${fmt(near)} | ${fmt(far)} | ${mean.toFixed(0)} |`,
    );
  }
}
json.deflection = tableA;

// ---------------------------------------------------------------------------------------------
// B. Rendering scenario: all directions from observers at 5, 30 and 200 M, f32 only.
log();
log('## B. Escape-direction error over all view directions (f32 emulation)');
log();
log(
  `Directions: 3000 values of psi in (0, pi) per observer. Errors in radians and in pixels (1 px = ${fmt(PIXEL, 3)} rad at 1080 rows, 60 degree vertical FOV). Rays with |b/b_c - 1| < 1e-3 are excluded from the error columns and examined in table D.`,
);
log();
log(
  '| method | step | r_o | misclassified (outside band) | step limit hits | max error (rad) | max error (px) | p99 error (px) | mean steps | max steps | f32 ops per ray |',
);
log('|---|---|---|---|---|---|---|---|---|---|---|');
const N_DIR = 3000;
const tableB: unknown[] = [];
const reference = new Map<number, { psi: number; b: number; exact: number }[]>();
for (const r0 of [5, 30, 200]) {
  const rows = [];
  for (let i = 0; i < N_DIR; i++) {
    const psi = ((i + 0.5) / N_DIR) * Math.PI;
    const b = impactParameterFromLocalAngle(r0, psi, M);
    rows.push({ psi, b, exact: exactSweptAngle(r0, psi, M) });
  }
  reference.set(r0, rows);
}
for (const cfg of configs) {
  for (const r0 of [5, 30, 200]) {
    const rows = reference.get(r0) ?? [];
    let mis = 0;
    let limit = 0;
    let steps = 0;
    let maxSteps = 0;
    const errs: number[] = [];
    opCount = 0;
    for (const { psi, b, exact } of rows) {
      const ray = cfg.trace(r0, psi, countingF32);
      steps += ray.steps;
      maxSteps = Math.max(maxSteps, ray.steps);
      if (ray.termination === 'stepLimit') limit++;
      const inBand = Math.abs(b / BC - 1) < 1e-3 && Math.cos(psi) < 0;
      if (inBand) continue;
      const shouldEscape = !Number.isNaN(exact);
      if ((ray.termination === 'escaped') !== shouldEscape) mis++;
      if (shouldEscape && ray.termination === 'escaped')
        errs.push(Math.abs(ray.escapeAngle - exact));
    }
    errs.sort((a, b2) => a - b2);
    const maxErr = errs[errs.length - 1] ?? NaN;
    const p99 = errs[Math.floor(0.99 * (errs.length - 1))] ?? NaN;
    const ops = opCount / rows.length;
    tableB.push({
      method: cfg.method,
      step: cfg.param,
      r0,
      mis,
      limit,
      maxErr,
      p99,
      mean: steps / rows.length,
      maxSteps,
      ops,
    });
    log(
      `| ${cfg.method} | ${cfg.param} | ${r0} | ${mis} | ${limit} | ${fmt(maxErr)} | ${(maxErr / PIXEL).toFixed(4)} | ${(p99 / PIXEL).toFixed(4)} | ${(steps / rows.length).toFixed(0)} | ${maxSteps} | ${ops.toFixed(0)} |`,
    );
  }
}
json.render = tableB;

// ---------------------------------------------------------------------------------------------
// C. Numerical b_c by bisection on capture versus escape (observer at 30 M).
log();
log('## C. Numerical critical impact parameter (bisection, observer at 30 M)');
log();
log('| method | step | |b_c,num / b_c - 1|, f64 | f32 |');
log('|---|---|---|---|');
const tableC: unknown[] = [];
for (const cfg of configs) {
  const res: number[] = [];
  for (const [, round] of precisions) {
    let lo = 0;
    let hi = Math.PI / 2;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (cfg.trace(30, Math.PI - mid, round).termination === 'captured') lo = mid;
      else hi = mid;
    }
    res.push(Math.abs(impactParameterFromLocalAngle(30, (lo + hi) / 2, M) / BC - 1));
  }
  tableC.push({ method: cfg.method, step: cfg.param, f64: res[0], f32: res[1] });
  log(`| ${cfg.method} | ${cfg.param} | ${fmt(res[0] as number)} | ${fmt(res[1] as number)} |`);
}
json.criticalB = tableC;

// ---------------------------------------------------------------------------------------------
// D. Near-critical behaviour: escape-direction error as b -> b_c (observer at 30 M, f32).
log();
log('## D. Near-critical escape-direction error in pixels (observer at 30 M, f32)');
log();
const epsList = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
log(`| method | step | ${epsList.map((e) => `b/b_c - 1 = ${e}`).join(' | ')} |`);
log(`|---|---|${epsList.map(() => '---').join('|')}|`);
const tableD: unknown[] = [];
for (const cfg of configs) {
  const cells: string[] = [];
  const vals: (number | string)[] = [];
  for (const eps of epsList) {
    const psi = inwardPsiForImpactParameter(30, BC * (1 + eps), M);
    const ray = cfg.trace(30, psi, f32);
    if (ray.termination !== 'escaped') {
      cells.push(ray.termination);
      vals.push(ray.termination);
      continue;
    }
    const err = Math.abs(ray.escapeAngle - exactSweptAngle(30, psi, M)) / PIXEL;
    cells.push(err.toFixed(3));
    vals.push(err);
  }
  tableD.push({ method: cfg.method, step: cfg.param, errorsPx: vals });
  log(`| ${cfg.method} | ${cfg.param} | ${cells.join(' | ')} |`);
}
json.nearCritical = tableD;

// ---------------------------------------------------------------------------------------------
// E. Robustness to GPU arithmetic: WGSL guarantees correct rounding only for +, -, *; division,
// sqrt and transcendentals may be several ULP off, and operations may be fused or reassociated.
// Model this crudely by perturbing every f32 result by a random amount of up to about 2 ULP.
log();
log(
  '## E. Sensitivity to arithmetic that is not correctly rounded (every op perturbed by up to about 2 ULP; worst of 5 random seeds)',
);
log();
log(
  '| method | step | r_o | max error, correct rounding (px) | max error, perturbed (px) | misclassified (perturbed) |',
);
log('|---|---|---|---|---|---|');
let seed = 0x9e3779b9;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
const perturbedF32: Round = (x) => {
  const y = Math.fround(x);
  return y === 0 || !Number.isFinite(y) ? y : Math.fround(y * (1 + (2 * rand() - 1) * 2 ** -22));
};
const tableE: unknown[] = [];
for (const cfg of configs.filter(
  (c) =>
    (c.method === 'Binet RK4' && c.param === 0.05) ||
    (c.method === 'Cartesian RK4' && c.param === 0.1),
)) {
  for (const r0 of [5, 30, 200]) {
    const rows = reference.get(r0) ?? [];
    let maxExact = 0;
    let maxPert = 0;
    let mis = 0;
    for (const s of [0x9e3779b9, 12345, 777, 31337, 4242]) {
      seed = s;
      for (const { psi, b, exact } of rows) {
        if (Math.abs(b / BC - 1) < 1e-3 && Math.cos(psi) < 0) continue;
        const a = cfg.trace(r0, psi, f32);
        const p = cfg.trace(r0, psi, perturbedF32);
        if ((p.termination === 'escaped') !== !Number.isNaN(exact)) mis++;
        if (Number.isNaN(exact)) continue;
        if (a.termination === 'escaped')
          maxExact = Math.max(maxExact, Math.abs(a.escapeAngle - exact));
        if (p.termination === 'escaped')
          maxPert = Math.max(maxPert, Math.abs(p.escapeAngle - exact));
      }
    }
    tableE.push({ method: cfg.method, step: cfg.param, r0, maxExact, maxPert, mis });
    log(
      `| ${cfg.method} | ${cfg.param} | ${r0} | ${(maxExact / PIXEL).toFixed(4)} | ${(maxPert / PIXEL).toFixed(4)} | ${mis} |`,
    );
  }
}
json.perturbed = tableE;

// ---------------------------------------------------------------------------------------------
// F. Turning the final orbital angle phi into a direction (cos phi, sin phi) in f32 without the
// built-in sin/cos (WGSL bound: 2^-11 absolute on [-pi, pi]): rotate by a precomputed step.
log();
log('## F. Direction from angle by rotation recurrence in f32 (dphi = 0.05)');
log();
{
  const h = 0.05;
  const ch = Math.fround(Math.cos(h));
  const sh = Math.fround(Math.sin(h));
  let c = 1;
  let s = 0;
  let worst = 0;
  for (let n = 1; n <= 1000; n++) {
    const cn = Math.fround(Math.fround(c * ch) - Math.fround(s * sh));
    const sn = Math.fround(Math.fround(s * ch) + Math.fround(c * sh));
    c = cn;
    s = sn;
    const err = Math.hypot(c - Math.cos(n * h), s - Math.sin(n * h));
    worst = Math.max(worst, err);
    if (n === 250 || n === 1000) {
      log(
        `- after ${n} steps: worst direction error so far ${fmt(worst)} rad (${(worst / PIXEL).toFixed(4)} px)`,
      );
    }
  }
  log(
    `- WGSL built-in sin/cos bound for comparison: ${fmt(2 ** -11)} rad (${(2 ** -11 / PIXEL).toFixed(3)} px), only for |x| <= pi`,
  );
}

mkdirSync('artifacts/spike', { recursive: true });
writeFileSync('artifacts/spike/precision-spike.md', out.join('\n') + '\n');
writeFileSync('artifacts/spike/precision-spike.json', JSON.stringify(json, null, 2) + '\n');
console.log('\nWrote artifacts/spike/precision-spike.md and .json');
