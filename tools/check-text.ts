// Repository text hygiene: fails if any tracked or staged text file contains an em-dash (U+2014).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EM_DASH = String.fromCharCode(0x2014);
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
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) offenders.push(`${file}:${i + 1}`);
  });
}

if (offenders.length > 0) {
  console.error(
    `Em-dash found (use a comma, colon or parentheses instead):\n${offenders.join('\n')}`,
  );
  process.exit(1);
}
console.log(`check-text: ${files.length} files clean`);
