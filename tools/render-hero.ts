// Renders the README image with the CPU reference renderer (64-bit floats, 3 x 3 samples per
// pixel), from the view and sizes in tools/hero-views.ts.
// Usage: npm run render:hero                    docs/images/hero.png (HERO_VIEW)
//        npm run render:hero -- --social        public/social-preview.png (HERO_VIEW); it must
//                                               be listed in PUBLIC_FILES (tools/dist-rules.ts)
//        npm run render:hero -- --candidates    every view at both sizes, plus a contact sheet,
//                                               into artifacts/stage6/ (gitignored)
// Writes nothing and exits 1 if a sample is not finite or a file is over its size budget.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '../src/cpu-renderer/png.ts';
import { encodeImage, renderImage } from '../src/cpu-renderer/render.ts';
import {
  HERO,
  HERO_VIEW,
  heroSettings,
  SOCIAL,
  viewHash,
  VIEWS,
  type ImageSize,
  type ViewName,
} from './hero-views.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);

interface Rendered {
  readonly path: string;
  readonly png: Buffer;
  readonly rgb: Uint8Array;
  readonly size: ImageSize;
}

function render(name: ViewName, size: ImageSize, path: string): Rendered {
  const s = heroSettings(name, size);
  const t0 = performance.now();
  const out = renderImage(s);
  const rgb = encodeImage(out, s);
  const png = encodePng(s.width, s.height, rgb);
  const seconds = ((performance.now() - t0) / 1000).toFixed(1);
  const { escaped, captured, stepLimit, nonFinite } = out.stats;
  const sha = createHash('sha256').update(png).digest('hex');
  console.log(
    `${path}: ${png.length} bytes, ${seconds} s, ${s.width} x ${s.height}, samples: ` +
      `${escaped} escaped, ${captured} captured, ${stepLimit} step limit, ${nonFinite} non-finite; ` +
      `sha256 ${sha}; page view #${viewHash(name)}`,
  );
  if (stepLimit > 0) console.warn(`  warning: ${stepLimit} samples hit the step limit`);
  if (nonFinite > 0) throw new Error(`${path}: ${nonFinite} non-finite samples`);
  if (png.length > size.maxBytes) {
    throw new Error(`${path}: ${png.length} bytes, over the budget of ${size.maxBytes}`);
  }
  return { path, png, rgb, size };
}

/** Box average of an RGB image by an integer factor. */
function shrink(rgb: Uint8Array, width: number, height: number, k: number): Uint8Array {
  const w = width / k;
  const h = height / k;
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = 0; dy < k; dy++) {
          for (let dx = 0; dx < k; dx++) sum += rgb[((y * k + dy) * width + x * k + dx) * 3 + c]!;
        }
        out[(y * w + x) * 3 + c] = Math.round(sum / (k * k));
      }
    }
  }
  return out;
}

/** The four heroes at half size in a 2 x 2 grid above the four social images at quarter size. */
function contactSheet(heroes: Rendered[], socials: Rendered[]): Buffer {
  const gap = 10;
  const [hw, hh] = [HERO.width / 2, HERO.height / 2];
  const [sw, sh] = [SOCIAL.width / 4, SOCIAL.height / 4];
  const width = 2 * hw + 3 * gap;
  const height = 2 * hh + sh + 4 * gap;
  const sheet = new Uint8Array(width * height * 3);
  const paste = (img: Uint8Array, w: number, h: number, x0: number, y0: number) => {
    for (let y = 0; y < h; y++) {
      sheet.set(img.subarray(y * w * 3, (y + 1) * w * 3), ((y0 + y) * width + x0) * 3);
    }
  };
  heroes.forEach((r, i) => {
    const x0 = gap + (i % 2) * (hw + gap);
    const y0 = gap + Math.floor(i / 2) * (hh + gap);
    paste(shrink(r.rgb, HERO.width, HERO.height, 2), hw, hh, x0, y0);
  });
  socials.forEach((r, i) => {
    paste(
      shrink(r.rgb, SOCIAL.width, SOCIAL.height, 4),
      sw,
      sh,
      gap + i * (sw + gap),
      2 * hh + 3 * gap,
    );
  });
  return encodePng(width, height, sheet);
}

function write(files: { path: string; png: Buffer }[]): void {
  for (const { path, png } of files) {
    mkdirSync(dirname(`${ROOT}${path}`), { recursive: true });
    writeFileSync(`${ROOT}${path}`, png);
  }
}

if (args.includes('--candidates')) {
  const names = Object.keys(VIEWS) as ViewName[];
  const n = (i: number) => String(i + 1).padStart(2, '0');
  const heroes = names.map((name, i) =>
    render(name, HERO, `artifacts/stage6/${n(i)}-hero-${name}.png`),
  );
  const socials = names.map((name, i) =>
    render(name, SOCIAL, `artifacts/stage6/${n(i)}-social-${name}.png`),
  );
  write([
    ...heroes,
    ...socials,
    { path: 'artifacts/stage6/00-contact-sheet.png', png: contactSheet(heroes, socials) },
  ]);
} else if (args.includes('--social')) {
  write([render(HERO_VIEW, SOCIAL, SOCIAL.path)]);
} else {
  write([render(HERO_VIEW, HERO, HERO.path)]);
}
