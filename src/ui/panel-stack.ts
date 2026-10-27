// Order in which panels were opened, so Escape closes the most recently opened one first.

export function openPanel<T>(stack: readonly T[], panel: T, opts: { single?: boolean } = {}): T[] {
  return opts.single ? [panel] : [...stack.filter((p) => p !== panel), panel];
}

export function closePanel<T>(stack: readonly T[], panel: T): T[] {
  return stack.filter((p) => p !== panel);
}

export function topPanel<T>(stack: readonly T[]): T | null {
  return stack.length > 0 ? (stack[stack.length - 1] as T) : null;
}
