// The view state in the URL hash, version 1. The hash is untrusted input: parseHash never
// throws, bounds every loop and every value, and no camera it returns can be at or inside the
// horizon. formatHash writes the canonical form, which parses back to the same state.
// Schema and rules: docs/DESIGN.md, section 13.
import { initialOrbit } from './orbit.ts';
import { OVERLAY_IDS, type OverlayId } from './overlay-style.ts';
import {
  ANGLE_DECIMALS,
  DISTANCE_DECIMALS,
  ORBIT_LIMITS,
  formatNumber,
  quantiseOrbit,
} from './quantise.ts';
import { DEFAULT_VIEW, canonicalOverlays, type ViewMode, type ViewState } from './view-state.ts';

export const MAX_HASH_LENGTH = 512;
export const MAX_PAIRS = 32;
export const MAX_VALUE_LENGTH = 64;
export const MAX_OVERLAY_TOKENS = 8;

export type HashIssueKind =
  | 'too-long'
  | 'version'
  | 'unknown-key'
  | 'duplicate'
  | 'malformed'
  | 'clamped'
  | 'unknown-overlay'
  | 'internal';

export interface HashIssue {
  readonly kind: HashIssueKind;
  /** The schema key concerned, when there is one (never text copied from the hash). */
  readonly key?: string;
}

export interface ParsedHash {
  readonly state: ViewState;
  readonly issues: readonly HashIssue[];
}

const KEY = /^[a-z]{1,8}$/;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const KNOWN_KEYS = ['v', 'r', 'az', 'el', 'disk', 'aa', 'view', 'ov', 'val'] as const;
type Key = (typeof KNOWN_KEYS)[number];
const isKnown = (k: string): k is Key => (KNOWN_KEYS as readonly string[]).includes(k);

/** Issues that change what the link asked for, so the page says so once. */
const NOTICE: readonly HashIssueKind[] = [
  'too-long',
  'version',
  'clamped',
  'malformed',
  'unknown-overlay',
];

export function needsNotice(issues: readonly HashIssue[]): boolean {
  return issues.some((i) => NOTICE.includes(i.kind));
}

function decode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function parseNumber(v: string): number | null {
  if (!NUMBER.test(v)) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function parseFlag(v: string): boolean | null {
  return v === '1' ? true : v === '0' ? false : null;
}

export function parseHash(hash: string): ParsedHash {
  try {
    return parseUnsafe(hash);
  } catch {
    return { state: DEFAULT_VIEW, issues: [{ kind: 'internal' }] };
  }
}

function parseUnsafe(hash: string): ParsedHash {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (body.length > MAX_HASH_LENGTH) return { state: DEFAULT_VIEW, issues: [{ kind: 'too-long' }] };

  const issues: HashIssue[] = [];
  const flagged = new Set<Key>();
  const malformed = (key?: Key) => {
    if (key !== undefined && flagged.has(key)) return;
    if (key !== undefined) flagged.add(key);
    issues.push(key === undefined ? { kind: 'malformed' } : { kind: 'malformed', key });
  };
  // Raw value per known key; null once it has been reported as malformed. The first occurrence
  // of a key wins, even a malformed one, so a later duplicate cannot replace it.
  const values = new Map<Key, string | null>();
  let pairs = 0;
  for (const segment of body.split('&')) {
    if (segment === '') continue;
    if (++pairs > MAX_PAIRS) break;
    const eq = segment.indexOf('=');
    const key = decode(eq < 0 ? segment : segment.slice(0, eq));
    if (key === null) {
      malformed();
      continue;
    }
    if (!KEY.test(key) || !isKnown(key)) {
      issues.push({ kind: 'unknown-key' });
      continue;
    }
    if (values.has(key)) {
      issues.push({ kind: 'duplicate', key });
      continue;
    }
    const value = eq < 0 ? null : decode(segment.slice(eq + 1));
    if (value === null || value.length > MAX_VALUE_LENGTH) {
      malformed(key);
      values.set(key, null);
      continue;
    }
    values.set(key, value);
  }

  if (values.has('v') && values.get('v') !== '1') {
    return { state: DEFAULT_VIEW, issues: [...issues, { kind: 'version', key: 'v' }] };
  }

  /** The value of `key` read by `read`, the fallback if absent, or 'malformed' and the fallback. */
  const field = <T>(key: Key, fallback: T, read: (raw: string) => T | null): T => {
    if (!values.has(key)) return fallback;
    const raw = values.get(key) ?? null;
    const v = raw === null ? null : read(raw);
    if (v === null) {
      malformed(key);
      return fallback;
    }
    return v;
  };
  /** A number in [lo, hi] (or [lo, hi) when the top is excluded); outside it, 'clamped'. */
  const number = (key: Key, fallback: number, lo: number, hi: number, topIncluded: boolean) => {
    const x = field(key, fallback, parseNumber);
    if (x < lo || x > hi || (!topIncluded && x === hi)) issues.push({ kind: 'clamped', key });
    return x;
  };

  // Distances below the minimum (including the horizon and below) and above the maximum are
  // clamped; the azimuth is wrapped; the elevation is clamped to the poles.
  const distance = number(
    'r',
    initialOrbit.distance,
    ORBIT_LIMITS.minDistance,
    ORBIT_LIMITS.maxDistance,
    true,
  );
  const azimuthDeg = number('az', initialOrbit.azimuthDeg, 0, 360, false);
  const elevationDeg = number('el', initialOrbit.elevationDeg, -90, 90, true);
  const view = field<ViewMode>('view', DEFAULT_VIEW.view, (v) =>
    v === 'colour' || v === 'termination' ? v : null,
  );
  const overlays = field<OverlayId[]>('ov', [], (raw) => {
    if (raw === '' || raw === 'none') return [];
    const tokens = raw.split(',', MAX_OVERLAY_TOKENS);
    const known = tokens.filter((t): t is OverlayId =>
      (OVERLAY_IDS as readonly string[]).includes(t),
    );
    if (known.length < tokens.length) issues.push({ kind: 'unknown-overlay', key: 'ov' });
    return canonicalOverlays(known);
  });

  const state: ViewState = {
    orbit: quantiseOrbit({ ...initialOrbit, distance, azimuthDeg, elevationDeg }),
    disk: field('disk', DEFAULT_VIEW.disk, parseFlag),
    antialias: field('aa', DEFAULT_VIEW.antialias, parseFlag),
    view,
    overlays,
    validationOpen: field('val', DEFAULT_VIEW.validationOpen, parseFlag),
  };
  return { state, issues };
}

/** The canonical hash, without the leading '#': every key, always in this order. */
export function formatHash(s: ViewState): string {
  const o = quantiseOrbit(s.orbit);
  const flag = (b: boolean) => (b ? '1' : '0');
  return [
    'v=1',
    `r=${formatNumber(o.distance, DISTANCE_DECIMALS)}`,
    `az=${formatNumber(o.azimuthDeg, ANGLE_DECIMALS)}`,
    `el=${formatNumber(o.elevationDeg, ANGLE_DECIMALS)}`,
    `disk=${flag(s.disk)}`,
    `aa=${flag(s.antialias)}`,
    `view=${s.view}`,
    `ov=${s.overlays.length === 0 ? 'none' : canonicalOverlays(s.overlays).join(',')}`,
    `val=${flag(s.validationOpen)}`,
  ].join('&');
}
