// The views a shared link can name, in canonical order, and what a view key or button does.
import { describe, expect, it } from 'vitest';
import { VIEW_MODES, isViewMode, toggledView } from '../../src/ui/view-state.ts';

describe('view modes', () => {
  it('lists the views in canonical order, colour first', () => {
    expect(VIEW_MODES[0]).toBe('colour');
    expect(new Set(VIEW_MODES).size).toBe(VIEW_MODES.length);
    expect(VIEW_MODES).toContain('termination');
  });

  it('recognises exactly the listed names', () => {
    for (const m of VIEW_MODES) expect(isViewMode(m)).toBe(true);
    for (const m of ['', 'Colour', 'TERMINATION', 'toString', '__proto__']) {
      expect(isViewMode(m)).toBe(false);
    }
  });

  it('a view key shows its view, or returns to colour when that view is already shown', () => {
    expect(toggledView('colour', 'termination')).toBe('termination');
    expect(toggledView('termination', 'termination')).toBe('colour');
    expect(toggledView('colour', 'colour')).toBe('colour');
  });
});
