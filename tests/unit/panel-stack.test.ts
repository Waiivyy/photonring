// Escape closes the most recently opened panel first (Stage 4 keyboard controls).
import { describe, expect, it } from 'vitest';
import { closePanel, openPanel, topPanel } from '../../src/ui/panel-stack.ts';

describe('panel stack', () => {
  it('keeps the opening order and closes the newest first', () => {
    let s = openPanel([], 'controls');
    s = openPanel(s, 'validation');
    expect(topPanel(s)).toBe('validation');
    s = closePanel(s, 'validation');
    expect(topPanel(s)).toBe('controls');
    s = closePanel(s, 'controls');
    expect(topPanel(s)).toBeNull();
  });

  it('reopening a panel moves it to the top; closing a closed one changes nothing', () => {
    let s = openPanel(openPanel([], 'controls'), 'validation');
    s = openPanel(s, 'controls');
    expect(s).toEqual(['validation', 'controls']);
    expect(closePanel(s, 'about')).toEqual(s);
  });

  it('with one panel at a time, opening one replaces the other', () => {
    const s = openPanel(['controls'], 'validation', { single: true });
    expect(s).toEqual(['validation']);
  });
});
