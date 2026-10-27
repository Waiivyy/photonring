// The keyboard map: the single source for the key handler, the help text, the canvas's
// aria-keyshortcuts, the key hints on buttons and the About table. Shortcuts are single keys,
// active while the view has focus (WCAG 2.1.4); any key with Ctrl, Cmd or Alt is left to the
// browser. Toggles ignore auto-repeat, so holding a key cannot make the image flash.
import type { OverlayId } from './overlay-style.ts';

export type Action =
  | { readonly type: 'orbit'; readonly dAzimuthDeg: number; readonly dElevationDeg: number }
  | { readonly type: 'zoom'; readonly factor: number }
  | { readonly type: 'toggle'; readonly target: 'disk' | 'antialias' | 'termination' }
  | { readonly type: 'overlay'; readonly id: OverlayId }
  | { readonly type: 'panel'; readonly panel: 'controls' | 'validation' }
  | { readonly type: 'save' }
  | { readonly type: 'reset' }
  | { readonly type: 'about' }
  | { readonly type: 'escape' };

export interface KeyBinding {
  /** KeyboardEvent.key values; letters in lower case, matched case-insensitively. */
  readonly keys: readonly string[];
  readonly action: Action;
  readonly label: string;
  /** Whether auto-repeat repeats the action. */
  readonly repeat: boolean;
}

export const ORBIT_STEP_DEG = 5;
export const ZOOM_STEP = 1.1;

export const KEYMAP: readonly KeyBinding[] = [
  {
    keys: ['ArrowLeft'],
    action: { type: 'orbit', dAzimuthDeg: ORBIT_STEP_DEG, dElevationDeg: 0 },
    label: 'Orbit left',
    repeat: true,
  },
  {
    keys: ['ArrowRight'],
    action: { type: 'orbit', dAzimuthDeg: -ORBIT_STEP_DEG, dElevationDeg: 0 },
    label: 'Orbit right',
    repeat: true,
  },
  {
    keys: ['ArrowUp'],
    action: { type: 'orbit', dAzimuthDeg: 0, dElevationDeg: ORBIT_STEP_DEG },
    label: 'Orbit up',
    repeat: true,
  },
  {
    keys: ['ArrowDown'],
    action: { type: 'orbit', dAzimuthDeg: 0, dElevationDeg: -ORBIT_STEP_DEG },
    label: 'Orbit down',
    repeat: true,
  },
  {
    keys: ['+', '='],
    action: { type: 'zoom', factor: 1 / ZOOM_STEP },
    label: 'Zoom in',
    repeat: true,
  },
  { keys: ['-'], action: { type: 'zoom', factor: ZOOM_STEP }, label: 'Zoom out', repeat: true },
  {
    keys: ['d'],
    action: { type: 'toggle', target: 'disk' },
    label: 'Accretion disk',
    repeat: false,
  },
  {
    keys: ['a'],
    action: { type: 'toggle', target: 'antialias' },
    label: 'Anti-aliasing',
    repeat: false,
  },
  {
    keys: ['t'],
    action: { type: 'toggle', target: 'termination' },
    label: 'Termination view',
    repeat: false,
  },
  { keys: ['e'], action: { type: 'overlay', id: 'edge' }, label: 'Shadow edge', repeat: false },
  { keys: ['h'], action: { type: 'overlay', id: 'horizon' }, label: 'Horizon ring', repeat: false },
  {
    keys: ['p'],
    action: { type: 'overlay', id: 'photon' },
    label: 'Photon sphere ring',
    repeat: false,
  },
  { keys: ['i'], action: { type: 'overlay', id: 'isco' }, label: 'ISCO ring', repeat: false },
  {
    keys: ['c'],
    action: { type: 'panel', panel: 'controls' },
    label: 'Controls panel',
    repeat: false,
  },
  {
    keys: ['v'],
    action: { type: 'panel', panel: 'validation' },
    label: 'Validation panel',
    repeat: false,
  },
  { keys: ['s'], action: { type: 'save' }, label: 'Save image', repeat: false },
  { keys: ['r', 'Home'], action: { type: 'reset' }, label: 'Reset view', repeat: false },
  { keys: ['?'], action: { type: 'about' }, label: 'About and keys', repeat: false },
  {
    keys: ['Escape'],
    action: { type: 'escape' },
    label: 'Close the last opened panel',
    repeat: false,
  },
];

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  readonly shiftKey?: boolean;
}

const BY_KEY = new Map<string, KeyBinding>(
  KEYMAP.flatMap((b) => b.keys.map((k) => [k.length === 1 ? k.toLowerCase() : k, b] as const)),
);

/** The action for a key press, or null when the page should not handle it. */
export function keyAction(e: KeyInput): Action | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const binding = BY_KEY.get(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (!binding || (e.repeat && !binding.repeat)) return null;
  return binding.action;
}

/** Display form of a key: letters in upper case, '+' as Plus where '+' is a separator. */
export function keyName(key: string, plusAs = '+'): string {
  if (key === '+') return plusAs;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Every bound key, space separated, for aria-keyshortcuts ('+' is reserved there for chords). */
export function ariaKeyshortcuts(map: readonly KeyBinding[] = KEYMAP): string {
  return map.flatMap((b) => b.keys.map((k) => keyName(k, 'Plus'))).join(' ');
}
