// Structural rules for the production build (Stage 5), run on dist/ at the end of every
// npm run build by tools/check-dist.ts: every asset hashed and referenced, nothing GitHub Pages
// would drop, no inline code in index.html, the CSP meta right after <meta charset> with exactly
// the policy in tools/csp.ts, and no absolute URL or data: URI outside an exact allowlist. Each
// rule and why: docs/DESIGN.md, section 14.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { CSP_POLICY } from './csp.ts';

/** Files copied unhashed from public/. Anything else there must be imported, so it is hashed. */
export const PUBLIC_FILES: readonly string[] = ['favicon.svg'];

/** The only absolute URLs the built files may contain: the SVG namespace and the repository
 * links in src/ui/links.ts. They are text, never fetched. */
export const ALLOWED_URLS: ReadonlySet<string> = new Set([
  'http://www.w3.org/2000/svg',
  'https://github.com/Waiivyy/photonring',
  'https://github.com/Waiivyy/photonring/blob/main/',
]);

const HASHED = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(js|css|png|svg|woff2)$/;
const TEXT = /\.(html|js|css|svg)$/;
const ABSOLUTE_URL = /\b(?:https?|wss?|ftp):\/\/[^\s"'`)<>\\]+/gi;
// Media-type form only: a bare "data:" also matches minified properties such as {data:r}.
const DATA_URI = /\bdata:[a-z]+\/[a-z0-9.+-]+[;,]/gi;
const RESOURCE_HINT = /\b(preconnect|dns-prefetch|prefetch|prerender|preload|modulepreload)\b/i;
const URL_ATTRIBUTES = ['src', 'href', 'srcset', 'poster', 'data', 'action', 'formaction'];
/** Directives a policy delivered by a meta tag cannot enforce (CSP Level 3, section 3.3). */
const IGNORED_IN_META = ['frame-ancestors', 'sandbox', 'report-uri', 'report-to'];

interface Tag {
  readonly name: string;
  readonly attrs: ReadonlyMap<string, string>;
}

/** Every file below dir, as a POSIX path relative to it; dotfiles included. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) visit(join(d, e.name));
      else out.push(relative(dir, join(d, e.name)).split(sep).join('/'));
    }
  };
  visit(dir);
  return out.sort();
}

function tags(html: string): Tag[] {
  return [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)].map((m) => {
    const attrs = new Map<string, string>();
    for (const a of m[2]!.matchAll(
      /\s([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g,
    )) {
      attrs.set(a[1]!.toLowerCase(), a[2] ?? a[3] ?? a[4] ?? '');
    }
    return { name: m[1]!.toLowerCase(), attrs };
  });
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const isCspMeta = (t: Tag) =>
  t.name === 'meta' && t.attrs.get('http-equiv')?.toLowerCase() === 'content-security-policy';
const isHashedAsset = (path: string) =>
  path.startsWith('assets/') && HASHED.test(path.slice('assets/'.length));

/** Returns the problems with the build in distDir; an empty list means it is clean. */
export function checkDist(distDir: string, { publicDir }: { publicDir: string }): string[] {
  const problems: string[] = [];
  const files = walk(distDir);
  const has = new Set(files);
  const read = (f: string) => readFileSync(join(distDir, f), 'utf8');
  if (!has.has('index.html')) return [`no index.html in ${distDir}`];

  // 1. Layout. upload-pages-artifact leaves out hidden files unless told otherwise.
  for (const f of files) {
    if (f.split('/').some((part) => part.startsWith('.'))) {
      problems.push(`hidden file, which GitHub Pages would leave out: ${f}`);
    } else if (f.endsWith('.map')) {
      problems.push(`source map: ${f}`);
    } else if (f.startsWith('assets/')) {
      if (!isHashedAsset(f)) problems.push(`asset without a content hash: ${f}`);
    } else if (f !== 'index.html' && !PUBLIC_FILES.includes(f)) {
      problems.push(`unexpected file: ${f}`);
    }
  }
  for (const f of PUBLIC_FILES) if (!has.has(f)) problems.push(`missing public file: ${f}`);
  // An unhashed name such as disk-inclined.png matches HASHED ("inclined" has 8 characters):
  // only this rule shows that it was copied from public/ rather than built.
  for (const f of walk(publicDir)) {
    if (!PUBLIC_FILES.includes(f)) problems.push(`public/${f} is not in PUBLIC_FILES`);
  }

  // 2. No orphans: every asset is named by index.html or by another built JS or CSS file.
  const sources = files.filter((f) => f === 'index.html' || /^assets\/.*\.(js|css)$/.test(f));
  const sourceText = new Map(sources.map((f) => [f, read(f)]));
  for (const f of files.filter((x) => x.startsWith('assets/'))) {
    const name = posix.basename(f);
    const named = sources.some((s) => s !== f && sourceText.get(s)!.includes(name));
    if (!named) problems.push(`asset not referenced by index.html or any built JS or CSS: ${f}`);
  }

  // 3. index.html.
  const raw = sourceText.get('index.html')!;
  const html = raw.replace(/<!--[\s\S]*?-->/g, '');
  const all = tags(html);
  for (const t of all) {
    for (const attr of t.attrs.keys()) {
      if (attr.startsWith('on'))
        problems.push(`index.html: event handler attribute ${attr} on <${t.name}>`);
      if (attr === 'style') problems.push(`index.html: style attribute on <${t.name}>`);
    }
    for (const attr of URL_ATTRIBUTES) {
      const value = t.attrs.get(attr);
      if (value === undefined) continue;
      const urls =
        attr === 'srcset' ? value.split(',').map((c) => c.trim().split(/\s+/)[0]!) : [value.trim()];
      for (const v of urls) {
        if (/^javascript:/i.test(v)) {
          problems.push(`index.html: javascript: URL in <${t.name} ${attr}>`);
        } else if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')) {
          problems.push(`index.html: absolute URL in <${t.name} ${attr}>: ${v}`);
        } else if (v.startsWith('/')) {
          problems.push(`index.html: root-relative URL, wrong under a project path: ${v}`);
        } else {
          const path = posix.normalize(v.split(/[?#]/)[0]!);
          if (path === '' || path === '.') continue;
          if (!has.has(path)) {
            problems.push(`index.html: <${t.name} ${attr}="${v}"> points to a missing file`);
          } else if (!PUBLIC_FILES.includes(path) && !isHashedAsset(path)) {
            problems.push(`index.html: ${v} has no content hash`);
          }
        }
      }
    }
    if (t.name === 'script' && !t.attrs.has('src')) problems.push('index.html: inline <script>');
    if (t.name === 'style') problems.push('index.html: <style> element');
    if (t.name === 'base') problems.push('index.html: <base> element');
    if (t.name === 'link' && RESOURCE_HINT.test(t.attrs.get('rel') ?? '')) {
      problems.push(`index.html: resource hint <link rel="${t.attrs.get('rel')}">`);
    }
  }
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (m[1]!.trim() !== '') problems.push('index.html: inline script content');
  }

  // 4. The CSP meta: one, in head, after nothing but <meta charset>, so it precedes every link
  // and script; exactly CSP_POLICY once entities are decoded.
  const head = tags(/<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '');
  const inHead = head.filter(isCspMeta).length;
  const elsewhere = all.filter(isCspMeta).length - inHead;
  if (inHead !== 1 || elsewhere !== 0) {
    problems.push(
      `index.html: ${inHead} CSP meta element(s) in <head> and ${elsewhere} elsewhere (expected exactly 1, in <head>)`,
    );
  } else {
    const at = head.findIndex(isCspMeta);
    const before = head.slice(0, at).filter((t) => !(t.name === 'meta' && t.attrs.has('charset')));
    if (before.length > 0) {
      problems.push(
        `index.html: CSP meta is preceded by ${before.map((t) => `<${t.name}>`).join(', ')}`,
      );
    }
    const policy = decodeEntities(head[at]!.attrs.get('content') ?? '');
    if (policy !== CSP_POLICY)
      problems.push(`index.html: CSP meta content does not match CSP_POLICY: ${policy}`);
    for (const directive of policy.split(';').map((d) => d.trim().split(/\s+/)[0]!.toLowerCase())) {
      if (IGNORED_IN_META.includes(directive)) {
        problems.push(`index.html: CSP meta has ${directive}, which a meta policy cannot enforce`);
      }
    }
  }
  // The HTML standard requires the whole charset element within the first 1024 bytes.
  const bytes = Buffer.from(raw, 'utf8').toString('latin1');
  const charset = /<meta\s[^>]*charset[^>]*>/i.exec(bytes);
  const charsetEnd = charset === null ? -1 : charset.index + charset[0].length;
  if (charsetEnd < 0 || charsetEnd > 1024) {
    problems.push(
      `index.html: <meta charset> does not end within the first 1024 bytes (ends at ${charsetEnd})`,
    );
  }

  // 5. URLs in built text files.
  for (const f of files.filter(
    (x) => TEXT.test(x) && !x.split('/').some((p) => p.startsWith('.')),
  )) {
    const text = sourceText.get(f) ?? read(f);
    for (const m of text.matchAll(ABSOLUTE_URL)) {
      if (!ALLOWED_URLS.has(m[0])) problems.push(`${f}: absolute URL ${m[0]}`);
    }
    for (const m of text.matchAll(DATA_URI)) problems.push(`${f}: data: URI ${m[0]}`);
    if (!f.endsWith('.css')) continue;
    if (/@import\b/i.test(text)) problems.push(`${f}: @import`);
    for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
      const u = m[2]!.trim();
      if (u.startsWith('#')) continue; // a fragment of the same document
      const path = posix.normalize(posix.join(posix.dirname(f), u.split(/[?#]/)[0]!));
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(u) || u.startsWith('/') || !has.has(path)) {
        problems.push(`${f}: url(${u}) is not a file in dist/`);
      }
    }
  }
  return problems;
}
