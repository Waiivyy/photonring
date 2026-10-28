// Checks dist/ against the structural rules in tools/dist-rules.ts. Runs at the end of
// npm run build, so a build that breaks them fails locally, in CI and in the Pages workflow.
import { fileURLToPath } from 'node:url';
import { checkDist } from './dist-rules.ts';

const root = new URL('../', import.meta.url);
const problems = checkDist(fileURLToPath(new URL('dist/', root)), {
  publicDir: fileURLToPath(new URL('public/', root)),
});
if (problems.length > 0) {
  console.error(`check-dist: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('check-dist: clean');
