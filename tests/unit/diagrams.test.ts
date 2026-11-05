// The README diagrams (tools/diagrams.ts): each is the same every time it is drawn, keeps the rules
// for SVG files the README shows (size cap, one root element, no active or external content, no
// em or en dash), and every number it prints is the 64-bit library's value.
import { describe, expect, it } from 'vitest';
import {
  cameraFrame,
  circularOrbitEmitter,
  criticalImpactParameter,
  DEFAULT_DISK,
  deflectionAngleElliptic,
  horizonRadius,
  iscoRadius,
  photonSphereRadius,
  pixelDirection,
  redshiftFactor,
  shadowAngularRadius,
  staticObserverFactor,
  subringOffset,
  traceRay,
  weakFieldDeflection,
} from '../../src/physics/index.ts';
import { initialOrbit, viewCamera } from '../../src/ui/orbit.ts';
import {
  DIAGRAMS,
  diagramProblems,
  FOOTNOTE,
  MAX_BYTES,
  RING_OBSERVER,
  SHADOW_OBSERVER,
  type Diagram,
} from '../../tools/diagrams.ts';

const DEG = Math.PI / 180;
const BC = criticalImpactParameter(1);
const drawn = new Map<string, Diagram>(DIAGRAMS.map(({ file, draw }) => [file, draw()]));
const get = (file: string): Diagram => {
  const d = drawn.get(file);
  if (!d) throw new Error(`no diagram ${file}`);
  return d;
};
const value = (d: Diagram, name: string): number => {
  const n = d.numbers[name];
  if (!n) throw new Error(`no printed number ${name}`);
  return n.value;
};
const files = DIAGRAMS.map((d) => d.file);

describe('README diagrams: files', () => {
  it('are the five named files', () => {
    expect(files).toEqual([
      'd0-key-radii.svg',
      'd1-light-paths.svg',
      'd2-shadow-size.svg',
      'd3-ring-images.svg',
      'd4-redshift.svg',
    ]);
  });

  it.each(DIAGRAMS.map((d) => [d.file, d.draw] as const))(
    '%s is identical when drawn twice',
    (file, draw) => {
      expect(draw().svg).toBe(get(file).svg);
    },
  );

  it.each(files)('%s keeps every rule of the tool', (file) => {
    expect(diagramProblems(get(file).svg)).toEqual([]);
  });

  it.each(files)('%s has no forbidden content', (file) => {
    const svg = get(file).svg;
    const forbidden = [
      '<script',
      'href',
      'xlink:href',
      '<image',
      '@import',
      '@font-face',
      ' style=',
      String.fromCharCode(0x2014),
      String.fromCharCode(0x2013),
    ];
    for (const needle of forbidden) expect(svg.includes(needle), needle).toBe(false);
  });

  it.each(files)('%s is at most 30,000 bytes', (file) => {
    expect(MAX_BYTES).toBe(30_000);
    expect(Buffer.byteLength(get(file).svg, 'utf8')).toBeLessThanOrEqual(MAX_BYTES);
  });

  it.each(files)('%s has one root <svg> with viewBox "0 0 960 540"', (file) => {
    const svg = get(file).svg;
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 960 540"[^>]*>/);
    expect(svg.endsWith('</svg>\n')).toBe(true);
  });

  it('carries the coordinate footnote where the drawing is in r and phi', () => {
    expect(FOOTNOTE).toBe(
      'Drawn in r and phi as flat polar coordinates; lengths and angles on the page are not ' +
        'what a local observer measures.',
    );
    for (const file of files.slice(0, 4)) expect(get(file).svg).toContain(FOOTNOTE);
    expect(get('d4-redshift.svg').svg).not.toContain(FOOTNOTE);
  });

  it.each(files)('%s prints every number it reports, in its text', (file) => {
    const d = get(file);
    expect(Object.keys(d.numbers).length).toBeGreaterThan(0);
    // Only the text of <text> and <tspan> elements counts: a short number such as "2" also turns
    // up in path coordinates, which would let a missing label pass.
    const text = [...d.svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]*)/g)].map((m) => m[1]).join(' ');
    for (const [name, n] of Object.entries(d.numbers)) {
      expect(Number.isFinite(n.value), name).toBe(true);
      const word = new RegExp(
        `(^|[^0-9.])${n.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^0-9])`,
      );
      expect(text, name).toMatch(word);
    }
  });

  it('the rule check finds each kind of problem', () => {
    const good = get('d1-light-paths.svg').svg;
    const bad = [
      good.replace('<g ', '<g style="fill:red" '),
      good.replace('</g>', '<script>1</script></g>'),
      good.replace('</g>', '<image href="x.png" width="1" height="1"/></g>'),
      good.replace('viewBox="0 0 960 540"', 'viewBox="0 0 960 541"'),
      good.replace('</g>', `<text>a ${String.fromCharCode(0x2013)} b</text></g>`),
      good.replace('cx="580"', 'cx="580.25"'),
      good.replace('</g>', '<g></g'),
      good.replace('</g>', `<!-- ${'x'.repeat(MAX_BYTES)} --></g>`),
      good + good,
    ];
    for (const svg of bad) expect(diagramProblems(svg)).not.toEqual([]);
  });
});

describe('README diagrams: printed numbers are the library values', () => {
  it('D0: the key radii and b_c', () => {
    const d = get('d0-key-radii.svg');
    expect(value(d, 'horizon')).toBe(horizonRadius(1));
    expect(value(d, 'photonSphere')).toBe(photonSphereRadius(1));
    expect(value(d, 'isco')).toBe(iscoRadius(1));
    expect(value(d, 'diskOuter')).toBe(DEFAULT_DISK.rOut);
    expect(value(d, 'bc')).toBe(BC);
    expect(d.svg).toContain(`≈ ${BC.toFixed(3)} M`);
  });

  it('D1: b_c and the deflection at b = 1.7 b_c', () => {
    const d = get('d1-light-paths.svg');
    const deflection = deflectionAngleElliptic(1.7 * BC, 1) / DEG;
    const weak = weakFieldDeflection(1.7 * BC, 1, 1) / DEG;
    expect(value(d, 'bc')).toBe(BC);
    expect(value(d, 'deflectionWide')).toBe(deflection);
    expect(value(d, 'weakFieldWide')).toBe(weak);
    expect(d.svg).toContain(`bent by ${deflection.toFixed(1)}°`);
    expect(d.svg).toContain(`4M/b: ${weak.toFixed(1)}°`);
  });

  it('D2: psi_sh at 10 M, the straight-line angle and the angle drawn on the page', () => {
    const d = get('d2-shadow-size.svg');
    const ro = SHADOW_OBSERVER;
    expect(ro).toBe(10);
    const psi = shadowAngularRadius(ro, 1);
    // On flat paper the radial part of the direction shrinks by sqrt(1 - 2M/r).
    const page = Math.atan2(Math.sin(psi), Math.cos(psi) * Math.sqrt(1 - 2 / ro));
    expect(value(d, 'psi')).toBe(psi / DEG);
    expect(value(d, 'straight')).toBe(Math.asin(BC / ro) / DEG);
    expect(value(d, 'page')).toBeCloseTo(page / DEG, 10);
    expect(d.svg).toContain(`${(psi / DEG).toFixed(2)}° at r`);
  });

  it('D3: the ratios of successive image offsets, and the rays reach r = 6 M', () => {
    const d = get('d3-ring-images.svg');
    const eps = [0, 1, 2, 3].map((n) =>
      subringOffset(RING_OBSERVER, iscoRadius(1), n, Math.PI / 2),
    );
    const ratios = [0, 1, 2].map((n) => eps[n]! / eps[n + 1]!);
    expect(value(d, 'ratio01')).toBe(ratios[0]);
    expect(value(d, 'ratio12')).toBe(ratios[1]);
    expect(value(d, 'ratio23')).toBe(ratios[2]);
    expect(value(d, 'ePi')).toBe(Math.exp(Math.PI));
    for (const r of ratios) expect(d.svg).toContain(`÷ ${r.toFixed(2)}`);
    // Images of order 1 and up approach the strong-deflection ratio exp(pi).
    expect(Math.abs(ratios[1]! - Math.exp(Math.PI))).toBeLessThan(1);
    expect(Math.abs(ratios[2]! - Math.exp(Math.PI))).toBeLessThan(0.1);
    // The drawn rays end on the disk's inner edge, and cross the plane earlier only inside it.
    for (const name of ['end0', 'end1', 'end2']) {
      const end = d.checks?.[name];
      expect(end, name).toBeDefined();
      expect(Math.abs(end! - iscoRadius(1))).toBeLessThan(1e-3);
    }
    expect(value(d, 'observer')).toBe(1e4);
    for (const name of ['cross1', 'cross2a', 'cross2b']) {
      expect(value(d, name)).toBeGreaterThan(photonSphereRadius(1));
      expect(value(d, name)).toBeLessThan(iscoRadius(1));
    }
    expect(value(d, 'gap1')).toBe(eps[1]! * BC);
    expect(value(d, 'gap2')).toBe(eps[2]! * BC);
  });

  it("D4: the page's opening camera, the range of g and which side approaches", () => {
    const d = get('d4-redshift.svg');
    const camera = viewCamera(initialOrbit);
    expect([camera.distance, camera.elevationDeg, camera.fovYDeg]).toEqual([30, 12, 60]);
    expect(value(d, 'distance')).toBe(camera.distance);
    expect(value(d, 'elevation')).toBe(camera.elevationDeg);
    expect(value(d, 'fov')).toBe(camera.fovYDeg);
    const gMin = value(d, 'gMin');
    const gMax = value(d, 'gMax');
    expect(value(d, 'brightness')).toBe((gMax / gMin) ** 4);

    // g on a coarser grid of the same directions: its extremes lie inside the drawn range.
    const frame = cameraFrame(camera, 1);
    const gObs = staticObserverFactor(camera.distance, 1);
    const gAt = (x: number, y: number): number | null => {
      const ray = traceRay(1, frame.position, pixelDirection(frame, 960, 540, x, y), {
        dphi: 0.0125,
        maxSteps: 4000,
      });
      const first = ray.crossings[0];
      if (!first || first.radius < DEFAULT_DISK.rIn || first.radius > DEFAULT_DISK.rOut) {
        return null;
      }
      return redshiftFactor(circularOrbitEmitter(first.radius, 1), ray.lzOverE) * gObs;
    };
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y <= 540; y += 16) {
      for (let x = 0; x <= 960; x += 16) {
        const g = gAt(x, y);
        if (g === null) continue;
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
      }
    }
    expect(lo).toBeGreaterThanOrEqual(gMin);
    expect(hi).toBeLessThanOrEqual(gMax);
    expect(lo - gMin).toBeLessThan(0.05);
    expect(gMax - hi).toBeLessThan(0.05);

    // The disk turns anticlockwise seen from above, so its left side comes towards this camera.
    expect(gAt(200, 400)!).toBeGreaterThan(1);
    expect(gAt(760, 400)!).toBeLessThan(1);
    expect(d.svg).toContain('left side moves towards the camera');
    for (const [name, n] of Object.entries(d.numbers)) {
      if (name.startsWith('level ')) expect(n.value).toBeGreaterThan(gMin);
      if (name.startsWith('level ')) expect(n.value).toBeLessThan(gMax);
    }
  });
});
