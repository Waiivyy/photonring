// The repository text rule behind tools/check-text.ts: no em-dash and no en-dash in any tracked
// text file. Minus signs (U+2212) and ASCII hyphens stay allowed.
import { describe, expect, it } from 'vitest';
import { dashOffences } from '../../tools/text-rules.ts';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const MINUS = String.fromCharCode(0x2212);

describe('dashOffences', () => {
  it('finds nothing in clean text', () => {
    expect(dashOffences('a.md', `ranges 1-2, minus ${MINUS}3\nsecond line`)).toEqual([]);
  });

  it('reports an em-dash with its file, line and name', () => {
    expect(dashOffences('a.md', `one\ntwo ${EM} three`)).toEqual(['a.md:2 em-dash']);
  });

  it('reports an en-dash with its file, line and name', () => {
    expect(dashOffences('b.ts', `pages 4${EN}5`)).toEqual(['b.ts:1 en-dash']);
  });

  it('reports both dashes on one line once each', () => {
    expect(dashOffences('c.md', `x ${EM} y ${EN} z`)).toEqual(['c.md:1 em-dash', 'c.md:1 en-dash']);
  });
});
