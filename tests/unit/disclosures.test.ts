// The display choices a visitor cannot see, disclosed where visitors read (Stage 8,
// docs/DESIGN.md section 17): the disk's peak temperature is named with its value, next to the
// words "display choice", in the README, in docs/PHYSICS.md and in the About dialog; the README
// and docs/PHYSICS.md give the page's exposure; the About text says the exposure and the tone
// curve are fixed and names the clipping, the invented stars and that its black hole does not
// spin; and the page and the About text take the values from the settings, so a change of a
// setting fails here until the texts follow. The About dialog's rendered text is checked in
// tests/e2e/about.spec.ts; the colour values the docs quote, in tests/unit/colour.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DISK } from '../../src/physics/index.ts';
import { COLOURS_NOTE, NOT_M87_NOTE } from '../../src/ui/about-text.ts';
import { PAGE_SCENE } from '../../src/ui/page-scene.ts';

const ROOT = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');

/** Paragraphs of a Markdown file: blocks between blank lines, each list item on its own. */
function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(/\n(?=\s*- )/))
    .map((p) => p.replace(/\s+/g, ' ').trim());
}

const TEMPERATURE = `${DEFAULT_DISK.peakTemperature} K`;
const DOCS = { 'README.md': read('README.md'), 'docs/PHYSICS.md': read('docs/PHYSICS.md') };

describe.each(Object.entries(DOCS))('%s', (_name, text) => {
  const all = paragraphs(text);

  it("names the disk's peak temperature as a display choice in one paragraph", () => {
    const found = all.filter(
      (p) =>
        p.includes(TEMPERATURE) &&
        p.includes('display choice') &&
        p.includes("gas's own frame") &&
        p.includes('not derived from a black hole mass or accretion rate'),
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('says that the toy disk is opaque where it describes it', () => {
    const disk = all.filter((p) => p.includes(TEMPERATURE) && p.includes('display choice'));
    expect(disk.some((p) => p.includes('opaque') && p.includes('toy'))).toBe(true);
  });

  it('states the fixed exposure the page uses', () => {
    const stated = [
      ...text.matchAll(/(?:fixed\s+exposure\s+of|exposure\s+is\s+fixed\s+at)\s+(\d+(?:\.\d+)?)/g),
    ].map((m) => Number(m[1]));
    expect(stated.length).toBeGreaterThanOrEqual(1);
    for (const v of stated) expect(v).toBe(PAGE_SCENE.exposure);
  });

  it('says it is not a model of M87* or Sgr A*, with their synchrotron light', () => {
    const found = all.filter(
      (p) => /Not a model of M87\\?\* or Sgr A\\?\*/.test(p) && p.includes('synchrotron'),
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('makes none of the claims the Stage 8 review rejected', () => {
    expect(text).not.toMatch(/does not follow from any/);
    expect(text).not.toMatch(/cream to white/);
    expect(text).not.toMatch(/drawn nearly white/);
  });
});

describe('README', () => {
  it('cites the Sgr A* paper', () => {
    expect(DOCS['README.md']).toContain('arXiv:2311.09478');
  });
});

describe('the page and the About dialog take the values from the settings', () => {
  it('the About text builds the temperature from DEFAULT_DISK and writes no number for it', () => {
    const text = read('src/ui/about-text.ts');
    expect(text).toContain('${DEFAULT_DISK.peakTemperature} K');
    expect(text).not.toMatch(/\b6500\b/);
    expect(text).toContain('display choice');
  });

  it('the About dialog shows the colours note and the M87* note', () => {
    const about = read('src/ui/about.ts');
    expect(about).toContain("section('Colours and brightness', el('p', {}, COLOURS_NOTE))");
    expect(about).toContain("el('li', {}, NOT_M87_NOTE)");
  });

  it('the page renders with the PAGE_SCENE exposure, tone curve and disk', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('exposure: PAGE_SCENE.exposure');
    expect(app).toContain('toneMapping: PAGE_SCENE.toneMapping');
    expect(app).toContain('PAGE_SCENE.disk');
    expect(app).not.toMatch(/exposure:\s*\d/);
    expect(app).not.toMatch(/toneMapping:\s*(?:true|false)/);
    expect(PAGE_SCENE.disk).toBe(DEFAULT_DISK);
  });

  it('the texts say a fixed tone curve is applied, so the page applies one', () => {
    expect(PAGE_SCENE.toneMapping).toBe(true);
  });
});

describe('the About dialog names the display choices a visitor cannot see', () => {
  it("names the disk's peak temperature, then calls it a display choice", () => {
    expect(COLOURS_NOTE).toContain(
      `${TEMPERATURE} in the gas's own frame. This is a display choice`,
    );
    expect(COLOURS_NOTE).toContain('not derived from a black hole mass or accretion rate');
  });

  it('names the fixed exposure, the fixed tone curve, the clipping and the invented stars', () => {
    for (const phrase of ['fixed exposure', 'fixed tone curve', 'clipped', 'stars are invented']) {
      expect(COLOURS_NOTE).toContain(phrase);
    }
  });

  it('says it is not a model of M87* or Sgr A*, and that its black hole does not spin', () => {
    for (const phrase of [
      'Not a model of M87* or Sgr A*',
      'synchrotron',
      'blackbody',
      'does not spin',
    ]) {
      expect(NOT_M87_NOTE).toContain(phrase);
    }
  });
});
