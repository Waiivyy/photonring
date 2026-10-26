// Seeded pseudo-random numbers so randomised tests are reproducible (mulberry32).
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniformly distributed unit vector. */
export function randomUnitVector(rand: () => number): [number, number, number] {
  const z = 2 * rand() - 1;
  const phi = 2 * Math.PI * rand();
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(phi), s * Math.sin(phi), z];
}
