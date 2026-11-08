// The link preview tags in index.html (Stage 8, docs/DESIGN.md section 17): Open Graph and X
// card tags that point a link preview at the social preview image. Each tag appears once; the
// URLs are the ones in tools/site.ts; the three descriptions are one text that starts with the
// honesty note; the image's size and type match the file; its alt text is the same for both.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUBLIC_FILES } from '../../tools/dist-rules.ts';
import { SOCIAL } from '../../tools/hero-views.ts';
import { SITE_URL, SOCIAL_IMAGE_URL } from '../../tools/site.ts';
import { readPng } from '../helpers/png-read.ts';

const ROOT = new URL('../../', import.meta.url);
const INDEX = readFileSync(new URL('index.html', ROOT), 'utf8');

interface Meta {
  readonly key: string;
  readonly content: string;
}

/** Every <meta name> and <meta property> of the file, in order, with its content. */
function metas(html: string): Meta[] {
  return [...html.matchAll(/<meta\b([^>]*)>/g)].flatMap((m) => {
    const attrs = new Map(
      [...m[1]!.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1]!.toLowerCase(), a[2]!]),
    );
    const key = attrs.get('property') ?? attrs.get('name');
    return key === undefined ? [] : [{ key, content: attrs.get('content') ?? '' }];
  });
}

const ALL = metas(INDEX);
const one = (key: string): string => {
  const found = ALL.filter((m) => m.key === key);
  expect(found, key).toHaveLength(1);
  return found[0]!.content;
};
const title = /<title>([^<]*)<\/title>/.exec(INDEX)?.[1];

const TAGS = [
  'description',
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'og:image:type',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
  'twitter:card',
  'twitter:title',
  'twitter:description',
  'twitter:image',
  'twitter:image:alt',
];

describe('link preview tags', () => {
  it.each(TAGS)('%s appears exactly once and is not empty', (key) => {
    expect(one(key).trim()).not.toBe('');
  });

  it('point at the site and its social preview image by absolute URL', () => {
    expect(SITE_URL).toBe('https://waiivyy.github.io/photonring/');
    expect(SOCIAL_IMAGE_URL).toBe(`${SITE_URL}social-preview.png`);
    expect(one('og:url')).toBe(SITE_URL);
    expect(one('og:image')).toBe(SOCIAL_IMAGE_URL);
    expect(one('twitter:image')).toBe(SOCIAL_IMAGE_URL);
  });

  it('name the image a file the build copies unhashed from public/', () => {
    const name = SOCIAL_IMAGE_URL.slice(SITE_URL.length);
    expect(PUBLIC_FILES).toContain(name);
    expect(SOCIAL.path).toBe(`public/${name}`);
  });

  it('use the page title and one description, which starts with the honesty note', () => {
    expect(title).toBeDefined();
    expect(one('og:title')).toBe(title);
    expect(one('twitter:title')).toBe(title);
    const description = one('description');
    expect(one('og:description')).toBe(description);
    expect(one('twitter:description')).toBe(description);
    // A preview may cut the text short, so the honesty note comes first.
    expect(description.startsWith('A toy model')).toBe(true);
    expect(description).toContain('not a simulation of any real observation');
  });

  it('give the type and size of public/social-preview.png', () => {
    const png = readPng(readFileSync(new URL(SOCIAL.path, ROOT)));
    expect([png.width, png.height]).toEqual([SOCIAL.width, SOCIAL.height]);
    expect(one('og:image:width')).toBe(String(SOCIAL.width));
    expect(one('og:image:height')).toBe(String(SOCIAL.height));
    expect(one('og:image:type')).toBe('image/png');
  });

  it('describe the image with one alt text that does not name M87*', () => {
    const alt = one('og:image:alt');
    expect(one('twitter:image:alt')).toBe(alt);
    // 420 characters: X's limit for twitter:image:alt as a search snippet of its card markup page
    // gives it; the page itself could not be read (HTTP 402), so the bound is not confirmed.
    expect(alt.length).toBeLessThanOrEqual(420);
    expect(alt).not.toContain('M87');
  });

  it('have a site name, a type and a large image card', () => {
    expect(one('og:site_name')).toBe('photonring');
    expect(one('og:type')).toBe('website');
    expect(one('twitter:card')).toBe('summary_large_image');
  });
});
