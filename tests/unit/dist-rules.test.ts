// Structural rules for the production build (Stage 5): hashed assets, no inline code, the CSP
// meta first in head, and no absolute URL or data: URI outside an exact allowlist. Checked on a
// synthetic dist/ that is clean, then broken one rule at a time.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { injectCsp } from '../../tools/csp.ts';
import { checkDist } from '../../tools/dist-rules.ts';

const JS = 'assets/index-AbCd1234.js';
const CSS = 'assets/index-EfGh5_78.css';
const PNG = 'assets/disk-face-on-Ij9_kL0m.png';

// The shape of the real built index.html.
const INDEX = injectCsp(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>photonring</title>
    <meta
      name="description"
      content="A description."
    />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <script type="module" crossorigin src="./${JS}"></script>
    <link rel="stylesheet" crossorigin href="./${CSS}">
  </head>
  <body>
    <main id="app"></main>
  </body>
</html>
`);

type Files = Record<string, string>;

// The JS names the image the way Vite's new URL(..., import.meta.url) does, and holds the three
// allowed absolute URLs and a minified property that looks like the start of a data: URI.
const clean = (): Files => ({
  'dist/index.html': INDEX,
  'dist/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  [`dist/${JS}`]:
    'const a=new URL(`disk-face-on-Ij9_kL0m.png`,import.meta.url).href;' +
    'const ns=`http://www.w3.org/2000/svg`;const r=`https://github.com/Waiivyy/photonring`;' +
    'const l=`https://github.com/Waiivyy/photonring/blob/main/`;const o={data:r};',
  [`dist/${CSS}`]: 'body{margin:0}',
  [`dist/${PNG}`]: 'png',
  'public/favicon.svg': '<svg></svg>',
});

let roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots = [];
});

function check(files: Files): string[] {
  const root = mkdtempSync(join(tmpdir(), 'dist-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return checkDist(join(root, 'dist'), { publicDir: join(root, 'public') });
}

const withIndex = (edit: (html: string) => string): Files => {
  const f = clean();
  f['dist/index.html'] = edit(f['dist/index.html']!);
  return f;
};
const withJs = (extra: string): Files => {
  const f = clean();
  f[`dist/${JS}`] += extra;
  return f;
};
const withCss = (text: string): Files => ({ ...clean(), [`dist/${CSS}`]: text });
const CSP_META = /\n\s*<meta http-equiv="Content-Security-Policy"[^>]*>/;

describe('dist rules', () => {
  it('a clean build has no problems', () => {
    expect(check(clean())).toEqual([]);
  });

  it('a policy written with HTML entities still matches', () => {
    const files = withIndex((h) =>
      h.replace(CSP_META, (meta) => meta.replace(/'/g, '&#39;').replace(/; /g, ';&#32;')),
    );
    expect(files['dist/index.html']).toContain('&#39;');
    expect(check(files)).toEqual([]);
  });

  it('markup inside a comment is not checked', () => {
    const files = withIndex((h) =>
      h.replace('</body>', '<!-- <script>alert(1)</script> --></body>'),
    );
    expect(check(files)).toEqual([]);
  });

  const withoutFavicon = (): Files => {
    const f = withIndex((h) => h.replace(/\s*<link rel="icon"[^>]*>/, ''));
    delete f['dist/favicon.svg'];
    return f;
  };
  const cspMeta = (h: string) => CSP_META.exec(h)![0];

  // Each fixture breaks one rule; the test asks for that rule's own message, so a fixture that
  // only trips some other rule fails.
  const broken: [string, Files, string | RegExp][] = [
    // Layout.
    [
      'an unexpected file at the root',
      { ...clean(), 'dist/robots.txt': 'x' },
      'unexpected file: robots.txt',
    ],
    ['a source map', { ...clean(), [`dist/${JS}.map`]: '{}' }, `source map: ${JS}.map`],
    [
      'a hidden file',
      { ...clean(), 'dist/.vite/manifest.json': '{}' },
      'hidden file, which GitHub Pages would leave out: .vite/manifest.json',
    ],
    [
      'an extra file in public/',
      { ...clean(), 'public/robots.txt': 'x' },
      'public/robots.txt is not in PUBLIC_FILES',
    ],
    [
      // The name matches the hash pattern ("inclined" has 8 characters); only public/ shows it.
      'an unhashed image copied from public/',
      {
        ...clean(),
        'public/assets/disk-inclined.png': 'x',
        'dist/assets/disk-inclined.png': 'x',
        [`dist/${JS}`]: clean()[`dist/${JS}`] + 'const b=`./assets/disk-inclined.png`;',
      },
      'public/assets/disk-inclined.png is not in PUBLIC_FILES',
    ],
    ['a public file missing from the build', withoutFavicon(), 'missing public file: favicon.svg'],
    // Hashes.
    [
      'an asset without a content hash',
      { ...clean(), 'dist/assets/logo.png': 'x' },
      'asset without a content hash: assets/logo.png',
    ],
    [
      'an asset nothing refers to',
      { ...clean(), 'dist/assets/orphan-Zz9_Yy8x.png': 'x' },
      'asset not referenced by index.html or any built JS or CSS: assets/orphan-Zz9_Yy8x.png',
    ],
    // index.html.
    [
      'a reference to a missing file',
      withIndex((h) => h.replace(JS, 'assets/index-Missing1.js')),
      'index.html: <script src="./assets/index-Missing1.js"> points to a missing file',
    ],
    [
      'a reference to a file without a content hash',
      {
        ...withIndex((h) =>
          h.replace('</head>', '<link rel="icon" href="./assets/logo.png"></head>'),
        ),
        'dist/assets/logo.png': 'x',
      },
      'index.html: ./assets/logo.png has no content hash',
    ],
    [
      'an absolute script URL',
      withIndex((h) => h.replace(`./${JS}`, 'https://cdn.example.com/x.js')),
      'index.html: absolute URL in <script src>: https://cdn.example.com/x.js',
    ],
    [
      'an absolute URL in a srcset',
      withIndex((h) =>
        h.replace(
          '</body>',
          '<img srcset="./favicon.svg 1x, https://example.com/a.png 2x"></body>',
        ),
      ),
      'index.html: absolute URL in <img srcset>: https://example.com/a.png',
    ],
    [
      'a root-relative URL',
      withIndex((h) => h.replace('href="./favicon.svg"', 'href="/favicon.svg"')),
      'index.html: root-relative URL, wrong under a project path: /favicon.svg',
    ],
    [
      'a script element without src',
      withIndex((h) => h.replace('</body>', '<script>alert(1)</script></body>')),
      'index.html: inline <script>',
    ],
    [
      'inline content in a script element with src',
      withIndex((h) => h.replace(`src="./${JS}"></script>`, `src="./${JS}">alert(1)</script>`)),
      'index.html: inline script content',
    ],
    [
      'a style element',
      withIndex((h) => h.replace('</head>', '<style>body{}</style></head>')),
      'index.html: <style> element',
    ],
    [
      'a style attribute',
      withIndex((h) => h.replace('<main id="app">', '<main id="app" style="color:red">')),
      'index.html: style attribute on <main>',
    ],
    [
      'an event handler attribute',
      withIndex((h) => h.replace('<main id="app">', '<main id="app" onclick="x()">')),
      'index.html: event handler attribute onclick on <main>',
    ],
    [
      'a javascript: URL',
      withIndex((h) => h.replace('</body>', '<a href="javascript:void 0">x</a></body>')),
      'index.html: javascript: URL in <a href>',
    ],
    [
      'a resource hint',
      withIndex((h) => h.replace('</head>', `<link rel="modulepreload" href="./${JS}"></head>`)),
      'index.html: resource hint <link rel="modulepreload">',
    ],
    [
      'a base element',
      withIndex((h) => h.replace('</head>', '<base href="./"></head>')),
      'index.html: <base> element',
    ],
    // CSP meta.
    [
      'no CSP meta',
      withIndex((h) => h.replace(CSP_META, '')),
      'index.html: 0 CSP meta element(s) in <head> and 0 elsewhere (expected exactly 1, in <head>)',
    ],
    [
      'two CSP metas',
      withIndex((h) =>
        h.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="x" /></head>`),
      ),
      'index.html: 2 CSP meta element(s) in <head> and 0 elsewhere (expected exactly 1, in <head>)',
    ],
    [
      'a CSP meta after the scripts',
      withIndex((h) => h.replace(cspMeta(h), '').replace('</head>', `${cspMeta(h)}</head>`)),
      'index.html: CSP meta is preceded by <meta>, <title>, <meta>, <link>, <script>, <link>',
    ],
    [
      'a CSP meta in the body',
      withIndex((h) => h.replace(cspMeta(h), '').replace('</body>', `${cspMeta(h)}</body>`)),
      'index.html: 0 CSP meta element(s) in <head> and 1 elsewhere (expected exactly 1, in <head>)',
    ],
    [
      'a second CSP meta in the body',
      withIndex((h) => h.replace('</body>', `${cspMeta(h)}</body>`)),
      'index.html: 1 CSP meta element(s) in <head> and 1 elsewhere (expected exactly 1, in <head>)',
    ],
    [
      'another policy',
      withIndex((h) => h.replace("img-src 'self'", "img-src 'self' https:")),
      /^index\.html: CSP meta content does not match CSP_POLICY: .*img-src 'self' https:/,
    ],
    [
      'a directive a meta policy ignores',
      withIndex((h) => h.replace("base-uri 'none'", "base-uri 'none'; frame-ancestors 'none'")),
      'index.html: CSP meta has frame-ancestors, which a meta policy cannot enforce',
    ],
    [
      'a charset meta outside the first 1024 bytes',
      withIndex((h) => h.replace('<html lang="en">', `<html lang="en"><!--${'x'.repeat(1100)}-->`)),
      /^index\.html: <meta charset> does not end within the first 1024 bytes \(ends at \d+\)$/,
    ],
    // URLs in built code.
    [
      'an absolute URL in the code',
      withJs('fetch(`https://example.com/t`)'),
      `${JS}: absolute URL https://example.com/t`,
    ],
    [
      'a WebSocket URL in the code',
      withJs('`wss://example.com/s`'),
      `${JS}: absolute URL wss://example.com/s`,
    ],
    [
      'a longer URL that starts with an allowed one',
      withJs('`https://github.com/Waiivyy/photonring.evil`'),
      `${JS}: absolute URL https://github.com/Waiivyy/photonring.evil`,
    ],
    [
      'a data: URI in the code',
      withJs('`data:image/png;base64,AAAA`'),
      `${JS}: data: URI data:image/png;`,
    ],
    ['an @import in the CSS', withCss('@import "x.css";body{}'), `${CSS}: @import`],
    [
      'a CSS url() to a missing file',
      withCss('body{background:url(./none.png)}'),
      `${CSS}: url(./none.png) is not a file in dist/`,
    ],
    [
      'a CSS url() to another origin',
      withCss('body{background:url(https://example.com/p.png)}'),
      `${CSS}: url(https://example.com/p.png) is not a file in dist/`,
    ],
  ];

  it.each(broken)('finds %s', (_name, files, expected) => {
    expect(check(files)).toEqual(
      expect.arrayContaining([
        typeof expected === 'string' ? expected : expect.stringMatching(expected),
      ]),
    );
  });
});
