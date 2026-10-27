// Keyboard map (Stage 4): one table for the handler, the help text, aria-keyshortcuts, the key
// hints and the About table. Modified keys always pass through to the browser.
import { describe, expect, it } from 'vitest';
import { KEYMAP, ariaKeyshortcuts, keyAction, type Action } from '../../src/ui/keymap.ts';

const press = (key: string, extra: Partial<Parameters<typeof keyAction>[0]> = {}) =>
  keyAction({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });

describe('key map', () => {
  it.each<[string, Action]>([
    ['ArrowLeft', { type: 'orbit', dAzimuthDeg: 5, dElevationDeg: 0 }],
    ['ArrowRight', { type: 'orbit', dAzimuthDeg: -5, dElevationDeg: 0 }],
    ['ArrowUp', { type: 'orbit', dAzimuthDeg: 0, dElevationDeg: 5 }],
    ['ArrowDown', { type: 'orbit', dAzimuthDeg: 0, dElevationDeg: -5 }],
    ['+', { type: 'zoom', factor: 1 / 1.1 }],
    ['=', { type: 'zoom', factor: 1 / 1.1 }],
    ['-', { type: 'zoom', factor: 1.1 }],
    ['d', { type: 'toggle', target: 'disk' }],
    ['A', { type: 'toggle', target: 'antialias' }],
    ['t', { type: 'toggle', target: 'termination' }],
    ['e', { type: 'overlay', id: 'edge' }],
    ['h', { type: 'overlay', id: 'horizon' }],
    ['P', { type: 'overlay', id: 'photon' }],
    ['i', { type: 'overlay', id: 'isco' }],
    ['c', { type: 'panel', panel: 'controls' }],
    ['v', { type: 'panel', panel: 'validation' }],
    ['s', { type: 'save' }],
    ['r', { type: 'reset' }],
    ['Home', { type: 'reset' }],
    ['?', { type: 'about' }],
    ['Escape', { type: 'escape' }],
  ])('%s', (key, action) => {
    expect(press(key)).toEqual(action);
  });

  it('letters work with Shift (and caps lock); ? and + need Shift on many layouts', () => {
    expect(press('D', { shiftKey: true })).toEqual({ type: 'toggle', target: 'disk' });
    expect(press('?')).toEqual({ type: 'about' });
  });

  it('never handles a key with Ctrl, Cmd or Alt, so browser shortcuts keep working', () => {
    for (const key of ['d', 'a', 't', '=', '-', '+', 'r', 's', 'ArrowLeft', 'Escape']) {
      expect(press(key, { ctrlKey: true })).toBeNull();
      expect(press(key, { metaKey: true })).toBeNull();
      expect(press(key, { altKey: true })).toBeNull();
    }
  });

  it('auto-repeat moves the camera but never toggles', () => {
    expect(press('ArrowLeft', { repeat: true })).not.toBeNull();
    expect(press('+', { repeat: true })).not.toBeNull();
    for (const key of ['d', 'a', 't', 'e', 'h', 'p', 'i', 'c', 'v', 's', 'r', 'Home', '?']) {
      expect(press(key, { repeat: true })).toBeNull();
    }
  });

  it('ignores unbound keys, Tab included', () => {
    for (const key of ['Tab', 'Enter', ' ', 'x', 'F5', 'Shift', '']) expect(press(key)).toBeNull();
  });

  it('every binding has a label, and no key is bound twice', () => {
    const keys = KEYMAP.flatMap((b) => b.keys.map((k) => k.toLowerCase()));
    expect(new Set(keys).size).toBe(keys.length);
    for (const b of KEYMAP) expect(b.label.length).toBeGreaterThan(0);
  });

  it('aria-keyshortcuts lists every key, with the plus key written as Plus', () => {
    const tokens = ariaKeyshortcuts().split(' ');
    expect(tokens).not.toContain('+');
    expect(tokens).toContain('Plus');
    for (const b of KEYMAP) {
      for (const k of b.keys) {
        expect(tokens).toContain(k === '+' ? 'Plus' : k.length === 1 ? k.toUpperCase() : k);
      }
    }
  });
});
