// Copies approved README images from artifacts/stage7/readme/ into docs/images/gallery/ and
// docs/images/page/, after the owner has looked at them. Git keeps every version of every image,
// so this is a separate, deliberate step: rerunning the renders or the screenshots never adds
// files to the repository by itself.
// Usage: node tools/accept-readme.ts           every gallery image (G1 to G9) and page shot
//                                              (P1 to P6)
//        node tools/accept-readme.ts G1 P3     only those
// Each file must be listed in its folder's manifest.json with the same sha256 (what was looked at
// is what is copied) and be within its cap. Checks every file first; copies nothing and exits 1
// if any check fails.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptPlan, BUDGET_BYTES, DOCS, MANIFEST, type Manifest } from './readme-views.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

let plan: ReturnType<typeof acceptPlan>;
try {
  plan = acceptPlan(process.argv.slice(2));
} catch (e) {
  console.error(`accept-readme: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const manifests = new Map<string, Manifest | null>();
function manifestFor(dir: string): Manifest | null {
  if (!manifests.has(dir)) {
    const path = `${ROOT}${dir}${MANIFEST}`;
    manifests.set(
      dir,
      existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest) : null,
    );
  }
  return manifests.get(dir) ?? null;
}

const problems: string[] = [];
const ready: { id: string; from: string; to: string; bytes: number; sha: string }[] = [];
for (const item of plan) {
  const from = `${ROOT}${item.from}`;
  if (!existsSync(from)) {
    problems.push(`${item.id}: ${item.from} does not exist`);
    continue;
  }
  const png = readFileSync(from);
  const sha = sha256(png);
  const entry = manifestFor(`${dirname(item.from)}/`)?.files.find(
    (e) => e.file === basename(item.from),
  );
  if (!entry) problems.push(`${item.id}: ${item.from} is not in its folder's ${MANIFEST}`);
  else if (entry.sha256 !== sha) {
    problems.push(`${item.id}: ${item.from} changed since it was made (sha256 ${sha})`);
  }
  if (png.length > item.maxBytes) {
    problems.push(`${item.id}: ${png.length} bytes, over the cap of ${item.maxBytes}`);
  }
  ready.push({ id: item.id, from, to: item.to, bytes: png.length, sha });
}

if (problems.length > 0) {
  console.error(`accept-readme: nothing copied\n${problems.join('\n')}`);
  process.exit(1);
}

for (const f of ready) {
  const to = `${ROOT}${f.to}`;
  const unchanged = existsSync(to) && sha256(readFileSync(to)) === f.sha;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(f.from, to);
  console.log(
    `${f.id} ${f.to}: ${f.bytes} bytes, sha256 ${f.sha}${unchanged ? ' (unchanged)' : ''}`,
  );
}

let total = 0;
for (const dir of Object.values(DOCS)) {
  if (!existsSync(`${ROOT}${dir}`)) continue;
  for (const name of readdirSync(`${ROOT}${dir}`)) total += statSync(`${ROOT}${dir}${name}`).size;
}
console.log(
  `copied ${ready.length} files; ${Object.values(DOCS).join(' and ')} now hold ${total} bytes ` +
    `of the ${BUDGET_BYTES} byte budget`,
);
