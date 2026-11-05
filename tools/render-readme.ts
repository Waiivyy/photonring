// Renders the README gallery images that carry no labels (G2 to G8 in tools/readme-views.ts) with
// the CPU reference renderer into artifacts/stage7/readme/gallery/, and records them in its
// manifest.json. G1 and G9 carry labels and are drawn by tests/gallery/readme.spec.ts.
// Usage: node tools/render-readme.ts            every unlabelled view
//        node tools/render-readme.ts G3 G6      only those
// Prints bytes, seconds, sample counts, sha256 and the page hash of each image, and whether G4,
// G5 and G8 match the unsupported page's images byte for byte. Writes nothing and exits 1 if a
// sample is not finite or a file is over its cap. Copy approved files into docs/images/ with
// node tools/accept-readme.ts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, cpus, release, type } from 'node:os';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../src/cpu-renderer/png.ts';
import { encodeImage, renderImage } from '../src/cpu-renderer/render.ts';
import {
  GALLERY_IDS,
  galleryHash,
  gallerySettings,
  galleryView,
  MANIFEST,
  mergeManifest,
  OUT,
  type GalleryId,
  type Manifest,
  type ManifestEntry,
} from './readme-views.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const plain = GALLERY_IDS.filter((id) => galleryView(id).labels === null);
const args = process.argv.slice(2);
const bad = args.filter((a) => !(plain as string[]).includes(a));
if (bad.length > 0) {
  console.error(`render-readme: not an unlabelled gallery view: ${bad.join(', ')}`);
  console.error(`expected some of ${plain.join(', ')}`);
  process.exit(1);
}
const ids = args.length === 0 ? plain : plain.filter((id) => args.includes(id));

const git = (...a: string[]) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
const os = `${type()} ${release()} ${arch()}, ${cpus()[0]?.model ?? 'unknown CPU'}`;
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const made: { entry: ManifestEntry; png: Buffer }[] = [];
for (const id of ids) made.push(render(id));

function render(id: GalleryId): { entry: ManifestEntry; png: Buffer } {
  const g = galleryView(id);
  const s = gallerySettings(id);
  const t0 = performance.now();
  const out = renderImage(s);
  const png = encodePng(s.width, s.height, encodeImage(out, s));
  const seconds = (performance.now() - t0) / 1000;
  const { escaped, captured, stepLimit, nonFinite } = out.stats;
  const sha = sha256(png);
  const hash = galleryHash(id);
  console.log(
    `${id} ${g.file}: ${png.length} bytes, ${seconds.toFixed(1)} s, ${s.width} x ${s.height}, ` +
      `${s.samplesPerAxis} x ${s.samplesPerAxis} samples: ${escaped} escaped, ${captured} ` +
      `captured, ${stepLimit} step limit, ${nonFinite} non-finite; sha256 ${sha}`,
  );
  console.log(`  page: #${hash}${g.page === 'orbit' ? ' (same orbit, framed by the page)' : ''}`);
  if (stepLimit > 0) console.warn(`  warning: ${stepLimit} samples hit the step limit`);
  if (nonFinite > 0) throw new Error(`${id}: ${nonFinite} non-finite samples`);
  if (png.length > g.maxBytes) {
    throw new Error(`${id}: ${png.length} bytes, over the cap of ${g.maxBytes}`);
  }
  let same: boolean | null = null;
  if (g.sameAs) {
    same = existsSync(`${ROOT}${g.sameAs}`) && sha256(readFileSync(`${ROOT}${g.sameAs}`)) === sha;
    console.log(`  ${same ? 'byte-identical to' : 'differs from'} ${g.sameAs}`);
  }
  const entry: ManifestEntry = {
    id,
    file: g.file,
    title: g.title,
    bytes: png.length,
    sha256: sha,
    seconds: Number(seconds.toFixed(1)),
    pageHash: hash,
    commit,
    dirty,
    date: new Date().toISOString(),
    os,
    node: process.version,
    chrome: null,
    settings: {
      producer: 'tools/render-readme.ts (CPU reference renderer, PNG from src/cpu-renderer/png.ts)',
      page: g.page,
      width: s.width,
      height: s.height,
      samplesPerAxis: s.samplesPerAxis,
      mode: s.mode,
      sky: s.sky,
      disk: s.disk !== null,
      camera: s.camera,
      dphi: s.dphi,
      maxSteps: s.maxSteps,
      exposure: s.exposure,
      toneMapping: s.toneMapping,
      stats: out.stats,
      ...(g.sameAs ? { sameAs: g.sameAs, identical: same } : {}),
    },
  };
  return { entry, png };
}

const dir = `${ROOT}${OUT.gallery}`;
mkdirSync(dir, { recursive: true });
for (const { entry, png } of made) writeFileSync(`${dir}${entry.file}`, png);
const path = `${dir}${MANIFEST}`;
const old = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest) : null;
const manifest = mergeManifest(
  old,
  made.map((m) => m.entry),
);
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
const written = made.reduce((sum, m) => sum + m.png.length, 0);
console.log(
  `wrote ${made.length} files, ${written} bytes, to ${OUT.gallery}; the gallery manifest now ` +
    `lists ${manifest.files.length} files, ${manifest.totalBytes} bytes`,
);
