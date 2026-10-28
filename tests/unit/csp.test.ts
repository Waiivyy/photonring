// The Content-Security-Policy of the built page (Stage 5; brief section 5, "Privacy"): one
// strict policy, delivered by a meta tag that precedes every script and stylesheet.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP_DIRECTIVES, CSP_POLICY, injectCsp } from '../../tools/csp.ts';

const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('Content-Security-Policy', () => {
  it('is exactly the measured policy', () => {
    expect(CSP_POLICY).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; worker-src 'none'; " +
        "base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'",
    );
    expect(CSP_POLICY).toBe(CSP_DIRECTIVES.join('; '));
  });

  it('names the directives that do not fall back to default-src', () => {
    const names = CSP_DIRECTIVES.map((d) => d.split(' ')[0]);
    for (const name of ['default-src', 'worker-src', 'base-uri', 'form-action']) {
      expect(names).toContain(name);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it('contains nothing a meta tag ignores and nothing that loosens it', () => {
    for (const bad of [
      'frame-ancestors',
      'sandbox',
      'report-uri',
      'report-to',
      'unsafe-inline',
      'unsafe-eval',
      'unsafe-hashes',
      'wasm-unsafe-eval',
      'data:',
      'blob:',
      'http:',
      'https:',
      '*',
      'upgrade-insecure-requests',
    ]) {
      expect(CSP_POLICY).not.toContain(bad);
    }
  });

  it('is inserted once, right after the charset meta, before every link and script', () => {
    const html = injectCsp(INDEX);
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />`;
    expect(html.split(meta)).toHaveLength(2);
    const charset = html.indexOf('<meta charset="utf-8" />');
    const at = html.indexOf(meta);
    expect(charset).toBeGreaterThanOrEqual(0);
    expect(html.slice(charset + '<meta charset="utf-8" />'.length, at).trim()).toBe('');
    for (const tag of ['<link', '<script']) {
      const first = html.indexOf(tag);
      if (first >= 0) expect(at).toBeLessThan(first);
    }
    // Everything else is unchanged.
    expect(html.replace(`\n    ${meta}`, '')).toBe(INDEX);
  });

  it('refuses a page without the charset meta, or with a policy already', () => {
    expect(() => injectCsp('<html><head></head></html>')).toThrow(/charset/);
    expect(() => injectCsp(injectCsp(INDEX))).toThrow(/already/);
    expect(() =>
      injectCsp(`<meta charset="utf-8" /><meta http-equiv='content-security-policy' content="x">`),
    ).toThrow(/already/);
  });
});
