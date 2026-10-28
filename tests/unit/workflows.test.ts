// The GitHub Actions workflows (brief section 6, Stage 5): every third-party action pinned to a
// commit SHA, permissions limited to what each job needs, and a Pages deploy that only ever
// starts by hand. Read as text, indentation-based, with no YAML dependency: the files are
// written in the block style these helpers expect.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = new URL('../../.github/workflows/', import.meta.url);
const NAMES = ['ci.yml', 'pages.yml'];
const read = (name: string) => readFileSync(new URL(name, DIR), 'utf8');

interface Block {
  readonly inline: string;
  readonly lines: readonly string[];
}

/** The keys at exactly `indent` spaces, each with its inline value and the lines below it. */
function blocks(lines: readonly string[], indent: number): Map<string, Block> {
  const out = new Map<string, Block>();
  const key = new RegExp(`^ {${indent}}([\\w-]+):(.*)$`);
  let current: { name: string; inline: string; lines: string[] } | undefined;
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    const m = key.exec(line);
    if (m) {
      current = { name: m[1]!, inline: m[2]!.trim(), lines: [] };
      out.set(current.name, current);
    } else if (current && (line.trim() === '' || /^ +/.exec(line)![0].length > indent)) {
      current.lines.push(line);
    } else if (line.trim() !== '') {
      current = undefined;
    }
  }
  return out;
}

const top = (name: string) => blocks(read(name).split('\n'), 0);
const jobs = (name: string) => blocks(top(name).get('jobs')?.lines ?? [], 2);

/** The steps of a job, each as its lines, split on the `- ` that starts it. */
function steps(job: Block): string[][] {
  const out: string[][] = [];
  for (const line of blocks(job.lines, 4).get('steps')?.lines ?? []) {
    if (/^ {6}- /.test(line)) out.push([line.replace(/^( {6})- /, '$1  ')]);
    else out.at(-1)?.push(line);
  }
  return out;
}

describe('workflows', () => {
  it('are exactly ci.yml and pages.yml', () => {
    expect(readdirSync(DIR).sort()).toEqual(NAMES);
  });

  it.each(NAMES)('%s pins every action to a commit SHA with its release tag', (name) => {
    const uses = [...read(name).matchAll(/^\s*(?:- )?uses:\s*(.*)$/gm)].map((m) => m[1]!.trim());
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  it.each(NAMES)('%s gives every job a timeout', (name) => {
    const all = jobs(name);
    expect(all.size).toBeGreaterThan(0);
    for (const [id, job] of all) {
      expect(blocks(job.lines, 4).get('timeout-minutes')?.inline, id).toMatch(/^\d+$/);
    }
  });

  it.each(NAMES)('%s never leaves the checkout token on disk', (name) => {
    let checkouts = 0;
    for (const job of jobs(name).values()) {
      for (const step of steps(job)) {
        if (!step.some((l) => /uses:\s*actions\/checkout@/.test(l))) continue;
        checkouts++;
        expect(step.some((l) => /^\s*persist-credentials:\s*false\s*$/.test(l))).toBe(true);
      }
    }
    expect(checkouts).toBeGreaterThan(0);
  });

  it.each(NAMES)('%s has no trigger that runs with secrets for untrusted code', (name) => {
    expect(read(name)).not.toMatch(/\b(pull_request_target|workflow_run)\b/);
  });

  it.each(NAMES)('%s sets permissions at the top level', (name) => {
    expect(top(name).has('permissions')).toBe(true);
  });

  it('ci.yml can only read the repository', () => {
    const permissions = top('ci.yml').get('permissions')!;
    const granted = [...blocks(permissions.lines, 2)].map(([k, v]) => `${k}: ${v.inline}`);
    expect(granted).toEqual(['contents: read']);
    expect(read('ci.yml')).not.toMatch(/^\s*(pages|id-token):\s*write/m);
  });

  it('pages.yml starts only by hand and grants nothing by default', () => {
    const t = top('pages.yml');
    expect(t.get('on')?.inline).toBe('');
    expect([...blocks(t.get('on')!.lines, 2).keys()]).toEqual(['workflow_dispatch']);
    expect(t.get('permissions')?.inline).toBe('{}');
  });

  it('pages.yml grants the Pages and OIDC token only to the deploy job, on main', () => {
    for (const [id, job] of jobs('pages.yml')) {
      const keys = blocks(job.lines, 4);
      const granted = [...blocks(keys.get('permissions')?.lines ?? [], 6)].map(
        ([k, v]) => `${k}: ${v.inline}`,
      );
      if (id === 'deploy') {
        expect(granted.sort()).toEqual(['id-token: write', 'pages: write']);
        expect(keys.get('if')?.inline).toBe("github.ref == 'refs/heads/main'");
      } else {
        expect(granted, id).toEqual(['contents: read']);
      }
    }
  });
});
