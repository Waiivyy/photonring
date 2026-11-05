// The repository text rule: no em-dash (U+2014) and no en-dash (U+2013) in tracked text files.
// Pure, so tests/unit/text-rules.test.ts can check it; tools/check-text.ts applies it to files.

const DASHES: readonly (readonly [string, string])[] = [
  [String.fromCharCode(0x2014), 'em-dash'],
  [String.fromCharCode(0x2013), 'en-dash'],
];

/** One "file:line name" entry per dash kind found on each line, in line order. */
export function dashOffences(file: string, text: string): string[] {
  const offences: string[] = [];
  text.split('\n').forEach((line, i) => {
    for (const [dash, name] of DASHES) {
      if (line.includes(dash)) offences.push(`${file}:${i + 1} ${name}`);
    }
  });
  return offences;
}
