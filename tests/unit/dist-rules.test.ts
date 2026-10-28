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

  const broken: [string, Files, RegExp][] = [
    // Layout.
    ['an unexpected file at the root', { ...clean(), 'dist/robots.txt': 'x' }, /unexpected file/],
    ['a source map', { ...clean(), [`dist/${JS}.map`]: '{}' }, /source map/],
    ['a hidden file', { ...clean(), 'dist/.vite/manifest.json': '{}' }, /hidden/],
    ['an extra file in public/', { ...clean(), 'public/robots.txt': 'x' }, /public\//],
    [
      // The name matches the hash pattern ("inclined" has 8 characters); only public/ shows it.
      'an unhashed image copied from public/',
      {
        ...clean(),
        'public/assets/disk-inclined.png': 'x',
        'dist/assets/disk-inclined.png': 'x',
        [`dist/${JS}`]: clean()[`dist/${JS}`] + 'const b=`./assets/disk-inclined.png`;',
      },
      /public\/assets\/disk-inclined\.png/,
    ],
    // Hashes.
    [
      'an asset without a content hash',
      { ...clean(), 'dist/assets/logo.png': 'x' },
      /content hash/,
    ],
    [
      'an asset nothing refers to',
      { ...clean(), 'dist/assets/orphan-Zz9_Yy8x.png': 'x' },
      /not referenced/,
    ],
    // index.html.
    [
      'a reference to a missing file',
      withIndex((h) => h.replace(JS, 'assets/index-Missing1.js')),
      /missing file/,
    ],
    [
      'an absolute script URL',
      withIndex((h) => h.replace(`./${JS}`, 'https://cdn.example.com/x.js')),
      /absolute URL/,
    ],
    [
      'an inline script',
      withIndex((h) => h.replace('</body>', '<script>alert(1)</script></body>')),
      /inline/,
    ],
    [
      'a style element',
      withIndex((h) => h.replace('</head>', '<style>body{}</style></head>')),
      /<style>/,
    ],
    [
      'a style attribute',
      withIndex((h) => h.replace('<main id="app">', '<main id="app" style="color:red">')),
      /style attribute/,
    ],
    [
      'an event handler attribute',
      withIndex((h) => h.replace('<main id="app">', '<main id="app" onclick="x()">')),
      /event handler/,
    ],
    [
      'a javascript: URL',
      withIndex((h) => h.replace('</body>', '<a href="javascript:void 0">x</a></body>')),
      /javascript:/,
    ],
    [
      'a resource hint',
      withIndex((h) => h.replace('</head>', `<link rel="modulepreload" href="./${JS}"></head>`)),
      /resource hint/,
    ],
    ['a base element', withIndex((h) => h.replace('</head>', '<base href="./"></head>')), /<base>/],
    // CSP meta.
    ['no CSP meta', withIndex((h) => h.replace(CSP_META, '')), /0 CSP meta/],
    [
      'two CSP metas',
      withIndex((h) =>
        h.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="x" /></head>`),
      ),
      /2 CSP meta/,
    ],
    [
      'a CSP meta after the scripts',
      withIndex((h) => {
        const meta = CSP_META.exec(h)![0];
        return h.replace(meta, '').replace('</head>', `${meta}</head>`);
      }),
      /preceded by/,
    ],
    [
      'a CSP meta in the body',
      withIndex((h) => {
        const meta = CSP_META.exec(h)![0];
        return h.replace(meta, '').replace('</body>', `${meta}</body>`);
      }),
      /0 CSP meta/,
    ],
    [
      'another policy',
      withIndex((h) => h.replace("img-src 'self'", "img-src 'self' https:")),
      /does not match/,
    ],
    [
      'a directive a meta policy ignores',
      withIndex((h) => h.replace("base-uri 'none'", "base-uri 'none'; frame-ancestors 'none'")),
      /frame-ancestors/,
    ],
    [
      'a charset meta outside the first 1024 bytes',
      withIndex((h) => h.replace('<html lang="en">', `<html lang="en"><!--${'x'.repeat(1100)}-->`)),
      /1024/,
    ],
    // URLs in built code.
    ['an absolute URL in the code', withJs('fetch(`https://example.com/t`)'), /absolute URL/],
    ['a WebSocket URL in the code', withJs('`wss://example.com/s`'), /absolute URL/],
    [
      'a longer URL that starts with an allowed one',
      withJs('`https://github.com/Waiivyy/photonring.evil`'),
      /absolute URL/,
    ],
    ['a data: URI in the code', withJs('`data:image/png;base64,AAAA`'), /data: URI/],
    ['an @import in the CSS', withCss('@import "x.css";body{}'), /@import/],
    ['a CSS url() to a missing file', withCss('body{background:url(./none.png)}'), /url\(/],
    [
      'a CSS url() to another origin',
      withCss('body{background:url(https://example.com/p.png)}'),
      /url\(/,
    ],
  ];

  it.each(broken)('finds %s', (_name, files, expected) => {
    expect(check(files).join('\n')).toMatch(expected);
  });
});
