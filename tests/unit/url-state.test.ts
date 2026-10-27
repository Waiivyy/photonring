// Shareable view state in the URL hash (Stage 4; spec section 10, item 13, and section 5,
// "untrusted input"): valid states round-trip exactly; hostile, huge, negative, NaN and malformed
// inputs are clamped or rejected without throwing, and never place the camera inside the horizon.
import { describe, expect, it } from 'vitest';
import { cameraFrame } from '../../src/physics/index.ts';
import { ORBIT_LIMITS, viewCamera } from '../../src/ui/orbit.ts';
import {
  MAX_HASH_LENGTH,
  formatHash,
  needsNotice,
  parseHash,
  type HashIssueKind,
} from '../../src/ui/url-state.ts';
import { DEFAULT_VIEW, type ViewState } from '../../src/ui/view-state.ts';

const view = (patch: Partial<ViewState> & { orbit?: Partial<ViewState['orbit']> }): ViewState => ({
  ...DEFAULT_VIEW,
  ...patch,
  orbit: { ...DEFAULT_VIEW.orbit, ...patch.orbit },
});

/** Every invariant a parsed state must satisfy, whatever the input. */
function expectValid(s: ViewState): void {
  const { distance, azimuthDeg, elevationDeg } = s.orbit;
  expect(distance).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDistance);
  expect(distance).toBeLessThanOrEqual(ORBIT_LIMITS.maxDistance);
  expect(azimuthDeg).toBeGreaterThanOrEqual(0);
  expect(azimuthDeg).toBeLessThan(360);
  expect(elevationDeg).toBeGreaterThanOrEqual(-90);
  expect(elevationDeg).toBeLessThanOrEqual(90);
  for (const v of [distance, azimuthDeg, elevationDeg]) expect(Object.is(v, -0)).toBe(false);
  expect(Number((distance * 1000).toFixed(6)) % 1).toBe(0);
  expect(Number((azimuthDeg * 100).toFixed(6)) % 1).toBe(0);
  expect(Number((elevationDeg * 100).toFixed(6)) % 1).toBe(0);
  expect(typeof s.disk).toBe('boolean');
  expect(typeof s.antialias).toBe('boolean');
  expect(typeof s.validationOpen).toBe('boolean');
  expect(['colour', 'termination']).toContain(s.view);
  const order = ['edge', 'horizon', 'photon', 'isco'];
  const idx = s.overlays.map((o) => order.indexOf(o));
  expect(idx.every((i) => i >= 0)).toBe(true);
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  expect(new Set(idx).size).toBe(idx.length);
  expect(() => cameraFrame(viewCamera(s.orbit))).not.toThrow();
}

const kinds = (hash: string): HashIssueKind[] => parseHash(hash).issues.map((i) => i.kind);

describe('URL hash: valid state', () => {
  it('an empty hash, or a lone #, gives the default view', () => {
    expect(parseHash('')).toEqual({ state: DEFAULT_VIEW, issues: [] });
    expect(parseHash('#')).toEqual({ state: DEFAULT_VIEW, issues: [] });
  });

  it('formats every key in canonical order', () => {
    expect(formatHash(DEFAULT_VIEW)).toBe(
      'v=1&r=30&az=0&el=12&disk=1&aa=1&view=colour&ov=none&val=0',
    );
    expect(
      formatHash(
        view({
          orbit: { distance: 27.273, azimuthDeg: 355, elevationDeg: -20.5 },
          disk: false,
          antialias: false,
          view: 'termination',
          overlays: ['edge', 'photon', 'isco'],
          validationOpen: true,
        }),
      ),
    ).toBe('v=1&r=27.273&az=355&el=-20.5&disk=0&aa=0&view=termination&ov=edge,photon,isco&val=1');
  });

  const states: [string, ViewState][] = [
    ['default', DEFAULT_VIEW],
    ['closest', view({ orbit: { distance: 5 } })],
    ['farthest', view({ orbit: { distance: 200 } })],
    ['north pole', view({ orbit: { elevationDeg: 90 } })],
    ['south pole', view({ orbit: { elevationDeg: -90 } })],
    ['azimuth just below 360', view({ orbit: { azimuthDeg: 359.99 } })],
    ['zoomed in once', view({ orbit: { distance: 27.273 } })],
    ['all overlays', view({ overlays: ['edge', 'horizon', 'photon', 'isco'] })],
    ['termination view, no disk', view({ view: 'termination', disk: false })],
    ['panel open, no anti-aliasing', view({ validationOpen: true, antialias: false })],
  ];
  it.each(states)('%s round-trips exactly', (_name, s) => {
    const parsed = parseHash(`#${formatHash(s)}`);
    expect(parsed.state).toEqual(s);
    expect(parsed.issues).toEqual([]);
  });

  it.each([359.994, 359.995, 359.996, 359.9999])(
    'azimuth %d formats, parses and formats again to the same string',
    (az) => {
      const once = formatHash(view({ orbit: { azimuthDeg: az } }));
      const twice = formatHash(parseHash(once).state);
      expect(twice).toBe(once);
      expect(once).not.toContain('az=360');
    },
  );

  it('missing keys take their defaults: a hash is a complete view', () => {
    expect(parseHash('#v=1&r=100').state).toEqual(view({ orbit: { distance: 100 } }));
    expect(parseHash('#disk=0').state).toEqual(view({ disk: false }));
  });

  it('accepts percent-encoding and a leading plus sign', () => {
    expect(parseHash('#r=%33%30').state.orbit.distance).toBe(30);
    expect(parseHash('#r=+40').state.orbit.distance).toBe(40);
  });
});

describe('URL hash: hostile input', () => {
  const cases: [string, Partial<ViewState['orbit']> | null, HashIssueKind[]][] = [
    // Distances: never inside the horizon, never unbounded.
    ['r=NaN', { distance: 30 }, ['malformed']],
    ['r=Infinity', { distance: 30 }, ['malformed']],
    ['r=-Infinity', { distance: 30 }, ['malformed']],
    ['r=1e999', { distance: 30 }, ['malformed']],
    ['r=1e308', { distance: 200 }, ['clamped']],
    ['r=99999', { distance: 200 }, ['clamped']],
    ['r=-5', { distance: 5 }, ['clamped']],
    ['r=1', { distance: 5 }, ['clamped']],
    ['r=2', { distance: 5 }, ['clamped']],
    ['r=2.0000001', { distance: 5 }, ['clamped']],
    ['r=', { distance: 30 }, ['malformed']],
    ['r', { distance: 30 }, ['malformed']],
    ['r==30', { distance: 30 }, ['malformed']],
    ['r=0x1e', { distance: 30 }, ['malformed']],
    ['r= 30', { distance: 30 }, ['malformed']],
    ['r=30abc', { distance: 30 }, ['malformed']],
    ['r=.5', { distance: 5 }, ['clamped']],
    ['r=３０', { distance: 30 }, ['malformed']],
    ['r=30‏', { distance: 30 }, ['malformed']],
    // Angles.
    ['el=1000', { elevationDeg: 90 }, ['clamped']],
    ['el=-90.000001', { elevationDeg: -90 }, ['clamped']],
    ['az=-725', { azimuthDeg: 355 }, ['clamped']],
    ['az=1e300', null, ['clamped']],
    // Encoding.
    ['%E0%A4%A', null, ['malformed']],
    ['r=30%00', { distance: 30 }, ['malformed']],
    ['r=%', { distance: 30 }, ['malformed']],
    ['%ZZ', null, ['malformed']],
    // Keys and duplicates.
    ['r=30&r=2', { distance: 30 }, ['duplicate']],
    ['R=50', { distance: 30 }, ['unknown-key']],
    // Size and shape.
    ['&&&===', null, []],
  ];
  it.each(cases)('%s', (hash, orbit, expected) => {
    let parsed: ReturnType<typeof parseHash> | undefined;
    expect(() => (parsed = parseHash(`#${hash}`))).not.toThrow();
    expectValid(parsed!.state);
    if (orbit) expect(parsed!.state.orbit).toEqual({ ...DEFAULT_VIEW.orbit, ...orbit });
    for (const k of expected) expect(kinds(`#${hash}`)).toContain(k);
    expect(kinds(`#${hash}`)).not.toContain('internal');
  });

  it('prototype keys are ignored and change nothing', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const parsed = parseHash('#__proto__=1&constructor=2&toString=3&r=50');
    expect(parsed.state.orbit.distance).toBe(50);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('overlay lists: unknown ids dropped, duplicates collapsed, canonical order, 8 tokens at most', () => {
    const p = parseHash('#ov=__proto__,constructor,isco,isco,edge');
    expect(p.state.overlays).toEqual(['edge', 'isco']);
    expect(p.issues.map((i) => i.kind)).toContain('unknown-overlay');
    const nine = parseHash('#ov=x,x,x,x,x,x,x,x,edge');
    expect(nine.state.overlays).toEqual([]);
    expect(parseHash('#ov=').state.overlays).toEqual([]);
    expect(parseHash('#ov=none').state.overlays).toEqual([]);
    expect(parseHash('#ov=none').issues).toEqual([]);
  });

  it('enums and booleans accept only their exact strings', () => {
    for (const hash of [
      'view=TERMINATION',
      'view=<img src=x onerror=alert(1)>',
      'view=%3Cscript%3E',
      'disk=true',
      'disk=2',
      'aa=yes',
      'val=-1',
    ]) {
      const p = parseHash(`#${hash}`);
      expectValid(p.state);
      expect(p.state.view).toBe('colour');
      expect(p.state.disk).toBe(true);
      expect(p.state.antialias).toBe(true);
      expect(p.state.validationOpen).toBe(false);
      expect(p.issues.map((i) => i.kind)).toContain('malformed');
    }
  });

  it('another schema version is ignored as a whole', () => {
    const p = parseHash('#v=2&r=10');
    expect(p.state).toEqual(DEFAULT_VIEW);
    expect(p.issues.map((i) => i.kind)).toContain('version');
    expect(parseHash('#v=1&r=10').state.orbit.distance).toBe(10);
  });

  it(`reads hashes up to ${MAX_HASH_LENGTH} characters and ignores longer ones`, () => {
    const pad = (n: number) => `r=50&x=${'a'.repeat(n - 7)}`;
    expect(pad(MAX_HASH_LENGTH)).toHaveLength(MAX_HASH_LENGTH);
    expect(parseHash(`#${pad(MAX_HASH_LENGTH)}`).state.orbit.distance).toBe(50);
    const long = parseHash(`#${pad(MAX_HASH_LENGTH + 1)}`);
    expect(long.state).toEqual(DEFAULT_VIEW);
    expect(long.issues.map((i) => i.kind)).toEqual(['too-long']);
    const huge = `#r=50&${'ov=edge&'.repeat(12_500)}`;
    expect(parseHash(huge).state).toEqual(DEFAULT_VIEW);
  });

  it('reads at most 32 pairs', () => {
    const filler = Array.from({ length: 32 }, (_, i) => `x${String.fromCharCode(97 + (i % 26))}=1`);
    expect(parseHash(`#${[...filler, 'r=50'].join('&')}`).state.orbit.distance).toBe(30);
    expect(parseHash(`#${[...filler.slice(0, 31), 'r=50'].join('&')}`).state.orbit.distance).toBe(
      50,
    );
  });

  it('values longer than 64 characters are malformed', () => {
    const p = parseHash(`#r=${'1'.repeat(65)}`);
    expect(p.state.orbit.distance).toBe(30);
    expect(p.issues.map((i) => i.kind)).toContain('malformed');
  });

  it('Unicode keys are unknown keys', () => {
    const p = parseHash('#%C3%A9=1&р=2');
    expectValid(p.state);
    expect(p.state).toEqual(DEFAULT_VIEW);
  });

  it('the notice is shown for adjustments, not for silent forward-compatible keys', () => {
    expect(needsNotice(parseHash('#r=1').issues)).toBe(true);
    expect(needsNotice(parseHash('#v=2').issues)).toBe(true);
    expect(needsNotice(parseHash('#ov=nope').issues)).toBe(true);
    expect(needsNotice(parseHash('#future=1&r=30').issues)).toBe(false);
    expect(needsNotice(parseHash('#r=30&r=31').issues)).toBe(false);
    expect(needsNotice(parseHash(`#${formatHash(DEFAULT_VIEW)}`).issues)).toBe(false);
  });
});
