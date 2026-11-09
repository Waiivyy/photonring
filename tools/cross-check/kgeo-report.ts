// Cross-check report over the full kgeo sample set (Stage 8 item 5, part B). Reads the JSON that
// the kgeo driver and its ODE oracle check write (both run outside the repository, see
// docs/VALIDATION.md) and applies the comparisons of tests/helpers/kgeo-compare.ts to every
// sample, not only the committed subset in tests/data/kgeo-bc5affe.json.
//
//   node tools/cross-check/kgeo-report.ts <kgeo-ro100.json> <ode-ro100.json> \
//     [<kgeo-ro1000.json> <ode-ro1000.json>]
import { readFileSync } from 'node:fs';
import { criticalImpactParameter } from '../../src/physics/index.ts';
import {
  countComparison,
  driftBound,
  photonringRay,
  radiusComparisons,
  redshiftComparisons,
  ringComparison,
  sweepResidual,
  type KgeoRay,
  type KgeoRing,
} from '../../tests/helpers/kgeo-compare.ts';

const BC = criticalImpactParameter(1);
/** Same threshold as the fixture: kgeo's region III is unreliable for b_c - b below this times b_c. */
const INSIDE_UNRELIABLE = 2e-9;

interface DriverRay {
  set: string;
  angleDeg: number;
  alpha: number;
  beta: number;
  nmax: number;
  outside: number;
  rs: number[];
  g: [number, number];
}
interface DriverRing {
  angleDeg: number;
  n: number;
  R: number;
  rootsAlphaBeta: [number, number][];
}
interface Driver {
  ro: number;
  thetaDeg: number[];
  rays: Record<string, DriverRay[]>;
  rings: Record<string, DriverRing[]>;
}
interface OracleRay {
  thetaDeg: number;
  index: number;
  radii: number[];
  radiiLoose: number[];
  root?: number;
}
interface Oracle {
  rays: OracleRay[];
  rings: OracleRay[];
}

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

interface Samples {
  readonly rays: KgeoRay[];
  readonly rings: KgeoRing[];
  /** The oracle's crossings for each ray. */
  readonly oracleOf: Map<KgeoRay, OracleRay>;
}

function samples(drv: Driver, od: Oracle): Samples {
  const byRay = new Map(od.rays.map((r) => [`${r.thetaDeg}:${r.index}`, r]));
  const rays: KgeoRay[] = [];
  const oracleOf = new Map<KgeoRay, OracleRay>();
  for (const th of drv.thetaDeg) {
    drv.rays[String(th)]!.forEach((ray, i) => {
      const o = byRay.get(`${th}:${i}`)!;
      const b = Math.hypot(ray.alpha, ray.beta);
      const bad = b < BC && 1 - b / BC < INSIDE_UNRELIABLE;
      const own = (m: number) => Math.abs(o.radiiLoose[m]! / o.radii[m]! - 1);
      const crossings = [...Array(ray.nmax + 1).keys()];
      const kray: KgeoRay = {
        ro: drv.ro,
        thetaDeg: th,
        angleDeg: ray.angleDeg,
        set: ray.set,
        alpha: ray.alpha,
        beta: ray.beta,
        nmax: ray.nmax,
        outside: ray.outside === 1,
        rs: ray.rs,
        rsErr: bad ? [] : crossings.map((m) => Math.abs(ray.rs[m]! / o.radii[m]! - 1) + own(m)),
        g: ray.g,
        oracle: bad ? { rs: o.radii.slice(0, ray.nmax + 1), err: crossings.map(own) } : null,
      };
      rays.push(kray);
      oracleOf.set(kray, o);
    });
  }
  const byRing = new Map(od.rings.map((r) => [`${r.thetaDeg}:${r.index}:${r.root}`, r]));
  const rings: KgeoRing[] = [];
  for (const th of drv.thetaDeg) {
    drv.rings[String(th)]!.forEach((ring, i) => {
      ring.rootsAlphaBeta.forEach(([alpha, beta], j) => {
        const o = byRing.get(`${th}:${i}:${j}`)!;
        const r = o.radii[ring.n]!;
        const rsErr = Math.abs(r / ring.R - 1) + Math.abs(o.radiiLoose[ring.n]! / r - 1);
        rings.push({
          ro: drv.ro,
          thetaDeg: th,
          angleDeg: ring.angleDeg,
          n: ring.n,
          R: ring.R,
          alpha,
          beta,
          rsErr,
        });
      });
    });
  }
  return { rays, rings, oracleOf };
}

const e = (x: number) => (Number.isFinite(x) ? x.toExponential(2) : String(x));

function report(drvPath: string, odePath: string): void {
  const t0 = performance.now();
  const drv = read<Driver>(drvPath);
  const od = read<Oracle>(odePath);
  const { rays, rings, oracleOf } = samples(drv, od);

  const k1 = { n: 0, fail: 0, ratio: 0, rel: [0, 0, 0, 0], oracle: [0, 0, 0, 0] };
  const inside = { n: 0, fail: 0, ratio: 0 };
  const third = { n: 0, fail: 0, ratio: 0 };
  const k4 = { n: 0, fail: 0, undecidable: 0, margin: Infinity };
  const k3 = { n: 0, fail: 0, ratio: 0, rel: 0 };
  const k5 = { n: 0, fail: 0 };
  const drift = { n: 0, fail: 0, ratio: 0 };
  for (const ray of rays) {
    const p = photonringRay(ray);
    p.drift.forEach((d, j) => {
      const ratio = d / driftBound(p.steps[j]!);
      drift.n++;
      if (!(ratio < 1)) drift.fail++;
      drift.ratio = Math.max(drift.ratio, ratio);
    });
    const target = ray.oracle ? inside : k1;
    for (const c of radiusComparisons(ray, p)) {
      target.n++;
      if (!(c.rel <= c.tol)) target.fail++;
      target.ratio = Math.max(target.ratio, c.rel / c.tol);
      if (!ray.oracle) k1.rel[Math.min(c.n, 3)] = Math.max(k1.rel[Math.min(c.n, 3)]!, c.rel);
    }
    // photonring against the oracle directly (a third route), with the oracle's two-tolerance
    // change in place of kgeo's error: checks photonring's own terms of the tolerance
    const o = oracleOf.get(ray)!;
    const vsOracle: KgeoRay = {
      ...ray,
      oracle: {
        rs: o.radii.slice(0, ray.nmax + 1),
        err: o.radii.slice(0, ray.nmax + 1).map((r, m) => Math.abs(o.radiiLoose[m]! / r - 1)),
      },
    };
    for (const c of radiusComparisons(vsOracle, p)) {
      third.n++;
      if (!(c.rel <= c.tol)) third.fail++;
      third.ratio = Math.max(third.ratio, c.rel / c.tol);
      k1.oracle[Math.min(c.n, 3)] = Math.max(k1.oracle[Math.min(c.n, 3)]!, c.rel);
    }
    const c4 = countComparison(ray, p);
    k4.margin = Math.min(k4.margin, c4.margin);
    if (c4.decidable) {
      k4.n++;
      if (c4.photonring !== c4.kgeo) k4.fail++;
    } else k4.undecidable++;
    if (!ray.oracle) {
      for (const c of redshiftComparisons(ray, p)) {
        k3.n++;
        if (!(c.rel <= c.tol)) k3.fail++;
        k3.ratio = Math.max(k3.ratio, c.rel / c.tol);
        k3.rel = Math.max(k3.rel, c.rel);
      }
    }
    if (ray.set === 'C') {
      k5.n++;
      const outside = Math.hypot(ray.alpha, ray.beta) > BC;
      if (ray.outside !== outside || p.termination !== (outside ? 'escaped' : 'captured'))
        k5.fail++;
    }
  }
  const k2 = { n: 0, fold: 0, fail: 0, ratio: 0, rel: 0 };
  const residual = { n: 0, inbound: 0, fail: 0, ratio: 0 };
  for (const ring of rings) {
    const r = sweepResidual(ring);
    residual.n++;
    if (r.inbound) residual.inbound++;
    if (!(Math.abs(r.residual) < r.tol)) residual.fail++;
    residual.ratio = Math.max(residual.ratio, Math.abs(r.residual) / r.tol);
    const c = ringComparison(ring);
    if (c.nearFold) {
      k2.fold++;
      continue;
    }
    k2.n++;
    if (!(c.rel <= c.tol)) k2.fail++;
    k2.ratio = Math.max(k2.ratio, c.rel / c.tol);
    k2.rel = Math.max(k2.rel, c.rel);
  }
  const secs = (performance.now() - t0) / 1000;
  console.log(
    `r_o = ${drv.ro} M: ${rays.length} rays, ${rings.length} ring roots, ${secs.toFixed(1)} s`,
  );
  console.log(
    `  K1 radii: ${k1.n} crossings, ${k1.fail} outside tolerance, worst ratio ${k1.ratio.toFixed(3)}; ` +
      `worst |r/r_kgeo - 1| by order 0, 1, 2, 3+: ${k1.rel.map(e).join(', ')}`,
  );
  console.log(
    `     photonring against kgeo's ODE oracle: ${third.n} crossings, ${third.fail} outside, worst ratio ` +
      `${third.ratio.toFixed(3)}; worst |r/r_oracle - 1| by order 0, 1, 2, 3+: ${k1.oracle.map(e).join(', ')}`,
  );
  console.log(
    `  K1 inside b_c against the oracle: ${inside.n} crossings, ${inside.fail} outside, worst ratio ${inside.ratio.toFixed(3)}`,
  );
  console.log(
    `  K1 drift of b against the rounding model: ${drift.n} crossings, ${drift.fail} outside, worst ratio ${drift.ratio.toFixed(3)}`,
  );
  console.log(
    `  K4 counts: ${k4.n} rays, ${k4.fail} different, ${k4.undecidable} undecidable, smallest margin ${e(k4.margin)} rad`,
  );
  console.log(
    `  K2 rings: ${k2.n} images (${k2.fold} near the fold), ${k2.fail} outside, worst ratio ${k2.ratio.toFixed(3)}, worst |eps/eps_kgeo - 1| ${e(k2.rel)}`,
  );
  console.log(
    `     solver sweep residual: ${residual.n} images (${residual.inbound} inbound), ${residual.fail} outside 1e-12 + 2^-52/eps, worst ratio ${residual.ratio.toFixed(3)}`,
  );
  console.log(
    `  K3 redshift: ${k3.n} values, ${k3.fail} outside, worst ratio ${k3.ratio.toFixed(3)}, worst |g/g_kgeo - 1| ${e(k3.rel)}`,
  );
  console.log(`  K5 critical curve: ${k5.n} rays, ${k5.fail} disagree`);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error('usage: node tools/cross-check/kgeo-report.ts <kgeo json> <ode json> [...]');
  process.exit(2);
}
for (let i = 0; i < args.length; i += 2) report(args[i]!, args[i + 1]!);
