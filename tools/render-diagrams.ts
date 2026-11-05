// Draws the README diagrams (tools/diagrams.ts) as SVG files.
// Usage: node tools/render-diagrams.ts            artifacts/stage7/readme/diagrams/ (gitignored)
//        node tools/render-diagrams.ts --accept   the same, and copies the same bytes to
//                                                 docs/images/diagrams/ (after a visual check)
// Prints each file's bytes, milliseconds and sha256. Writes nothing and exits 1 if any file
// breaks a rule (diagramProblems: size cap, forbidden content, root element, rounding).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGRAMS, diagramProblems } from './diagrams.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'artifacts/stage7/readme/diagrams');
const ACCEPTED = join(ROOT, 'docs/images/diagrams');

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--accept');
if (unknown.length > 0) {
  console.error(`unknown argument: ${unknown.join(' ')}`);
  process.exit(2);
}
const accept = args.includes('--accept');

const drawn = DIAGRAMS.map(({ file, draw }) => {
  const t0 = performance.now();
  const { svg } = draw();
  const ms = performance.now() - t0;
  const bytes = Buffer.from(svg, 'utf8');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const problems = diagramProblems(svg);
  console.log(`${file}: ${bytes.length} bytes, ${ms.toFixed(0)} ms, sha256 ${sha}`);
  for (const p of problems) console.error(`  ${file}: ${p}`);
  return { file, bytes, problems };
});

if (drawn.some((d) => d.problems.length > 0)) {
  console.error('Nothing written: fix the problems above first.');
  process.exit(1);
}

const targets = accept ? [OUT, ACCEPTED] : [OUT];
for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  for (const { file, bytes } of drawn) writeFileSync(join(dir, file), bytes);
  console.log(`wrote ${drawn.length} files to ${dir}`);
}
