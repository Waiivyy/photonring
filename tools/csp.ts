// The Content-Security-Policy of the built page, delivered by a meta tag because GitHub Pages
// cannot set response headers. Only the production build gets it: in the dev server it would
// block Vite's WebSocket and error overlay. Each directive and what a meta tag cannot enforce:
// docs/DESIGN.md, section 14.
import type { Plugin } from 'vite';

export const CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  // These three do not fall back to default-src (worker-src falls back to script-src).
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
] as const;

export const CSP_POLICY = CSP_DIRECTIVES.join('; ');

const ANCHOR = '<meta charset="utf-8" />';

/** Inserts the CSP meta right after <meta charset>, so it precedes every link and script. */
export function injectCsp(html: string): string {
  if (/http-equiv\s*=\s*["']?content-security-policy/i.test(html)) {
    throw new Error('index.html already has a CSP meta tag');
  }
  const at = html.indexOf(ANCHOR);
  if (at < 0) throw new Error(`index.html has no ${ANCHOR}`);
  const end = at + ANCHOR.length;
  return (
    `${html.slice(0, end)}\n    <meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />` +
    html.slice(end)
  );
}

export const cspPlugin = (): Plugin => ({
  name: 'photonring-csp',
  apply: 'build',
  transformIndexHtml: { order: 'post', handler: injectCsp },
});
