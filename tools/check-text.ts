// Repository text hygiene: fails if any tracked or staged text file contains an em-dash (U+2014)
// or an en-dash (U+2013). The rule itself is in tools/text-rules.ts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dashOffences } from './text-rules.ts';

const BINARY = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf)$/i;

const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
});
const files = listed.split('\n').filter((f) => f !== '' && !BINARY.test(f));

const offenders: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  offenders.push(...dashOffences(file, text));
}

if (offenders.length > 0) {
  console.error(
    `Em-dash or en-dash found (use a comma, colon, parentheses or a hyphen instead):\n${offenders.join('\n')}`,
  );
  process.exit(1);
}
console.log(`check-text: ${files.length} files clean`);
