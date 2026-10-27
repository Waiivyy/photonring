// Property tests for the URL hash (Stage 4; spec section 10, item 13): random hostile strings
// never throw and always give a valid view; every state the app can reach round-trips exactly.
import { describe, expect, it } from 'vitest';
import { cameraFrame } from '../../src/physics/index.ts';
import { ORBIT_LIMITS, orbitBy, resetOrbit, viewCamera, zoomBy } from '../../src/ui/orbit.ts';
import { OVERLAY_IDS } from '../../src/ui/overlay-style.ts';
import { formatHash, parseHash } from '../../src/ui/url-state.ts';
import { DEFAULT_VIEW, toggleOverlay, type ViewState } from '../../src/ui/view-state.ts';
import { seededRandom } from '../helpers/random.ts';

const ALPHABET = [
  ...'%&=#+.,-eE0123456789',
  ...'abcdefghijklmnopqrstuvwxyzRAVDT',
  ' ',
  '\0',
  '\u0001',
  '\u001f',
  '\u007f',
  '‏',
  '０',
  '😀',
  'r=',
  'az=',
  'el=',
  'ov=',
  'v=',
  'edge',
  'isco',
  'NaN',
  'Infinity',
  'e999',
  '%E0%A4%A',
  '__proto__',
];

function randomString(rand: () => number, maxLength: number): string {
  const n = Math.floor(rand() * maxLength);
  let s = '';
  while (s.length < n) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

describe('URL hash properties', () => {
  it('20,000 random hostile strings: no throw, valid state, a fixed point after one pass', () => {
    const rand = seededRandom(20261027);
    for (let i = 0; i < 20_000; i++) {
      const hash = `#${randomString(rand, 600)}`;
      const { state, issues } = parseHash(hash);
      expect(issues.some((x) => x.kind === 'internal')).toBe(false);
      const { distance, azimuthDeg, elevationDeg } = state.orbit;
      expect(distance >= ORBIT_LIMITS.minDistance && distance <= ORBIT_LIMITS.maxDistance).toBe(
        true,
      );
      expect(azimuthDeg >= 0 && azimuthDeg < 360).toBe(true);
      expect(elevationDeg >= -90 && elevationDeg <= 90).toBe(true);
      expect(() => cameraFrame(viewCamera(state.orbit))).not.toThrow();
      const once = formatHash(state);
      const again = parseHash(`#${once}`);
      expect(again.state).toEqual(state);
      expect(again.issues).toEqual([]);
      expect(formatHash(again.state)).toBe(once);
    }
  });

  it('2,000 random sequences of app operations: every reachable state round-trips exactly', () => {
    const rand = seededRandom(42);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    for (let seq = 0; seq < 2000; seq++) {
      let s: ViewState = DEFAULT_VIEW;
      const steps = 1 + Math.floor(rand() * 50);
      for (let k = 0; k < steps; k++) {
        const op = Math.floor(rand() * 10);
        if (op === 0) s = { ...s, orbit: orbitBy(s.orbit, pick([5, -5]), 0) };
        else if (op === 1) s = { ...s, orbit: orbitBy(s.orbit, 0, pick([5, -5])) };
        else if (op === 2) s = { ...s, orbit: zoomBy(s.orbit, pick([1 / 1.1, 1.1])) };
        else if (op === 3) {
          // Drag: 0.25 degrees per pixel of a random pointer movement.
          s = {
            ...s,
            orbit: orbitBy(s.orbit, (rand() - 0.5) * 400 * 0.25, (rand() - 0.5) * 400 * 0.25),
          };
        } else if (op === 4)
          s = { ...s, orbit: zoomBy(s.orbit, Math.exp((rand() - 0.5) * 600 * 0.001)) };
        else if (op === 5) s = { ...s, orbit: zoomBy(s.orbit, 0.5 + rand() * 1.5) };
        else if (op === 6) s = { ...s, orbit: resetOrbit(s.orbit) };
        else if (op === 7) s = toggleOverlay(s, pick(OVERLAY_IDS));
        else if (op === 8)
          s = { ...s, disk: !s.disk, view: rand() < 0.5 ? 'colour' : 'termination' };
        else s = { ...s, antialias: !s.antialias, validationOpen: rand() < 0.5 };
      }
      const hash = formatHash(s);
      expect(parseHash(`#${hash}`).state).toEqual(s);
      expect(formatHash(parseHash(`#${hash}`).state)).toBe(hash);
    }
  });
});
