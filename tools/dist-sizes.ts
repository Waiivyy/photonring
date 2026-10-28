// Download sizes of the production build: raw, gzip (level 9) and brotli (quality 11) for the
// JS, the CSS, the images and everything in dist/. Run after npm run build with npm run size.
// It reports and never fails: there is no size budget.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(d, e.name))
      : [relative(dist, join(d, e.name)).split(sep).join('/')],
  );
const files = walk(dist).sort();

interface Size {
  raw: number;
  gzip: number;
  brotli: number;
}
const sizes = new Map<string, Size>(
  files.map((f) => {
    const bytes = readFileSync(join(dist, f));
    return [
      f,
      {
        raw: bytes.length,
        gzip: gzipSync(bytes, { level: 9 }).length,
        brotli: brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      },
    ];
  }),
);
const sum = (list: string[]): Size =>
  list.reduce(
    (a, f) => {
      const s = sizes.get(f)!;
      return { raw: a.raw + s.raw, gzip: a.gzip + s.gzip, brotli: a.brotli + s.brotli };
    },
    { raw: 0, gzip: 0, brotli: 0 },
  );

const row = (name: string, s: Size) =>
  `${name.padEnd(44)}${String(s.raw).padStart(10)}${String(s.gzip).padStart(10)}${String(s.brotli).padStart(10)}`;
console.log(
  `${'file (bytes)'.padEnd(44)}${'raw'.padStart(10)}${'gzip 9'.padStart(10)}${'br 11'.padStart(10)}`,
);
for (const f of files) console.log(row(f, sizes.get(f)!));
console.log('');
console.log(row('JS', sum(files.filter((f) => f.endsWith('.js')))));
console.log(row('CSS', sum(files.filter((f) => f.endsWith('.css')))));
console.log(row('images', sum(files.filter((f) => /\.(png|svg)$/.test(f)))));
console.log(row('total', sum(files)));
