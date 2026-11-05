// The math in the Markdown files GitHub shows (README, CHANGELOG, docs/), written the way GitHub
// renders it as written. Checked on GitHub's renderer for the Stage 7 branch:
// - inside $...$ and $$...$$ it drops the backslash of escaped punctuation, so \, shows as a comma
//   and \{ loses its brace; only ```math blocks keep TeX as written, and \thinspace survives;
// - it leaves inline math inside _..._ or *...* emphasis as raw TeX (bold is fine);
// - Prettier reads a line that starts with $$ and does not end with one as an open math block,
//   strips escapes from it and appends a $$ at the end of the file.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url);
const FILES = [
  'README.md',
  'CHANGELOG.md',
  ...readdirSync(new URL('docs/', ROOT))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`),
];

/** The text without fenced code blocks (```math included) and inline code. */
function prose(markdown: string): string {
  return markdown.replace(/^\s*```[\s\S]*?^\s*```$/gm, '').replace(/`[^`\n]*`/g, '');
}

/** Inline math spans, $...$ on one line. */
function inlineMath(text: string): string[] {
  return [...text.matchAll(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g)].map((m) => m[1]!);
}

/**
 * Lines with inline math GitHub leaves as text: a span broken across lines (an odd number of $),
 * an opening $ after anything but a line start, whitespace, "(" or a bold mark (as in order-$n$),
 * or a space just inside a $.
 */
function unrenderedInlineMath(text: string): string[] {
  return text.split('\n').filter((line) => {
    if ((line.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2 !== 0) return true;
    return [...line.matchAll(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g)].some((m) => {
      const before = m.index === 0 ? ' ' : line[m.index - 1]!;
      return !/[\s(*]/.test(before) || /^\s|\s$/.test(m[1]!);
    });
  });
}

/** Backslash escapes of ASCII punctuation, which GitHub turns into the bare character. */
function escapedPunctuation(tex: string): string[] {
  return [...tex.matchAll(/\\[!-/:-@[-`{-~]/g)].map((m) => m[0]);
}

const MATH = 'MATHSPAN';

/**
 * Emphasis spans (_..._ or *...*, not bold), with each inline math span replaced by MATHSPAN so
 * that underscores inside math, as in $\hat{x}_o$, are not taken for emphasis marks. An opening
 * mark follows a non-word character and precedes a non-space one.
 */
function emphasisSpans(text: string): string[] {
  const plain = text
    .replace(/(?<!\$)\$(?!\$)([^$\n]+?)(?<!\\)\$(?!\$)/g, MATH)
    .replace(/\*\*/g, '');
  return [...plain.matchAll(/(?<![\w*\\])([_*])(?=\S)([\s\S]*?[^\s\\])\1(?![\w*])/g)].map(
    (m) => m[2]!,
  );
}

describe('Markdown math as GitHub renders it', () => {
  const texts = new Map(
    FILES.map((f) => [f, prose(readFileSync(new URL(f, ROOT), 'utf8'))] as const),
  );

  it('has math to check', () => {
    const spans = [...texts.values()].flatMap(inlineMath);
    expect(spans.length).toBeGreaterThan(1000);
    expect(readFileSync(new URL('docs/PHYSICS.md', ROOT), 'utf8')).toContain('```math');
  });

  it.each(FILES)('%s writes display math as ```math blocks, never $$', (file) => {
    expect(texts.get(file)!.match(/^.*\$\$.*$/gm) ?? []).toEqual([]);
  });

  it.each(FILES)('%s writes inline math so that GitHub renders it', (file) => {
    expect(unrenderedInlineMath(texts.get(file)!)).toEqual([]);
  });

  it.each(FILES)('%s has no escaped punctuation in inline math', (file) => {
    const bad = inlineMath(texts.get(file)!).filter((s) => escapedPunctuation(s).length > 0);
    expect(bad).toEqual([]);
  });

  it.each(FILES)('%s puts no inline math inside italics', (file) => {
    const bad = emphasisSpans(texts.get(file)!).filter((s) => s.includes(MATH));
    expect(bad).toEqual([]);
  });

  it('the checks find each problem when it is there', () => {
    expect(emphasisSpans('a _caption with $n$ in it_ b')).toEqual([`caption with ${MATH} in it`]);
    expect(emphasisSpans('plain $b_c$ and $\\phi_0$, then _words_ only')).toEqual(['words']);
    expect(emphasisSpans('$\\hat{x}_o$, $e_2$ and $\\phi_{n}$')).toEqual([]);
    expect(emphasisSpans('a **bold $n$** span, M87\\* and *M87\\* too*')).toEqual(['M87\\* too']);
    expect(inlineMath('x $3\\sqrt3\\,M$ and $\\lbrace 2 \\rbrace$ y')).toEqual([
      '3\\sqrt3\\,M',
      '\\lbrace 2 \\rbrace',
    ]);
    expect(escapedPunctuation('3\\sqrt3\\,M \\{x\\} 2\\%')).toEqual(['\\,', '\\{', '\\}', '\\%']);
    expect(escapedPunctuation('3\\sqrt3\\thinspace M \\lbrace x \\rbrace')).toEqual([]);
    expect(prose('a\n```math\n$$x\\,y$$\n```\nb $c$')).toBe('a\n\nb $c$');
    expect(
      unrenderedInlineMath(
        [
          'ok $a$, ($b$) and $n$-th',
          'so $b_c = 3\\sqrt{3}',
          '\\approx 5.196$ here',
          'the order-$n$ image',
          'solves $\\Phi = $ sweep',
        ].join('\n'),
      ),
    ).toEqual([
      'so $b_c = 3\\sqrt{3}',
      '\\approx 5.196$ here',
      'the order-$n$ image',
      'solves $\\Phi = $ sweep',
    ]);
  });
});
