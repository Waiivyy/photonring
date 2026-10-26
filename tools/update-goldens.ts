// Re-renders the golden scenes and reports what changed. Writes goldens only when told to:
//   npm run golden:update                       report, write candidates to artifacts/
//   npm run golden:update -- --accept a,b       overwrite the named goldens
//   npm run golden:update -- --accept-all       overwrite every new or changed golden
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOLDEN_DIR,
  applyGoldenUpdate,
  planGoldenUpdate,
  withinTolerance,
  type Image8,
} from '../src/cpu-renderer/goldens.ts';
import { encodePng } from '../src/cpu-renderer/png.ts';
import { encodeImage, renderImage } from '../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../src/cpu-renderer/scenes.ts';

const args = process.argv.slice(2);
const acceptIndex = args.indexOf('--accept');
const accept: ReadonlySet<string> | 'all' = args.includes('--accept-all')
  ? 'all'
  : new Set(acceptIndex >= 0 ? (args[acceptIndex + 1] ?? '').split(',').filter(Boolean) : []);

const rendered = new Map<string, Image8>();
for (const [name, scene] of Object.entries(GOLDEN_SCENES)) {
  rendered.set(name, {
    width: scene.width,
    height: scene.height,
    rgb: encodeImage(renderImage(scene), scene),
  });
}

const plan = planGoldenUpdate(rendered, GOLDEN_DIR);
const candidates = 'artifacts/golden-candidates';
mkdirSync(candidates, { recursive: true });
for (const entry of plan) {
  const detail = entry.diff
    ? `max channel diff ${entry.diff.maxChannelDiff}, ${entry.diff.differingChannels} channels, ${withinTolerance(entry.diff) ? 'within' : 'OUTSIDE'} test tolerance`
    : '';
  console.log(`${entry.status.padEnd(9)} ${entry.name} ${detail}`);
  const image = rendered.get(entry.name);
  if (entry.status !== 'unchanged' && image) {
    writeFileSync(
      join(candidates, `${entry.name}.png`),
      encodePng(image.width, image.height, image.rgb),
    );
  }
}

const written = applyGoldenUpdate(plan, rendered, GOLDEN_DIR, accept);
if (written.length > 0) {
  console.log(`\nOverwrote goldens: ${written.join(', ')}`);
} else if (plan.some((p) => p.status !== 'unchanged')) {
  console.log(
    `\nNothing written. Review ${candidates}/ and rerun with --accept <names> or --accept-all.`,
  );
} else {
  console.log('\nAll goldens are up to date.');
}
