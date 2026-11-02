// Shown when WebGPU is missing or no device can be created: why, where it works, and a gallery
// of images rendered beforehand by the CPU reference renderer (tools/render-gallery.ts). The
// images are imported, so the build gives them hashed names and a missing one fails the build.
import { el } from './dom.ts';
import closeUp from './gallery/close-up-5M.png';
import diskFaceOn from './gallery/disk-face-on.png';
import diskInclined from './gallery/disk-inclined.png';
import shadowAndStars from './gallery/shadow-and-stars.png';

const GALLERY = [
  { src: shadowAndStars, caption: 'The shadow and lensed stars, 30 M away, no disk.' },
  { src: diskInclined, caption: 'Thin disk seen 12 degrees above its plane.' },
  { src: diskFaceOn, caption: 'The same disk seen from above its axis.' },
  { src: closeUp, caption: 'From 5 M, with the field of view widened to 120 degrees.' },
] as const;

// Vendor status re-checked on 2026-11-02 (sources: docs/DESIGN.md, section 4).
const BROWSERS = [
  'Chrome or Edge 113 or later on Windows and macOS, and Chrome 113 or later on ChromeOS; Chrome 144 or later on Linux with Intel Gen12 or newer GPUs (147 or later with NVIDIA GPUs under Wayland).',
  'Chrome 121 or later on Android 12 or later with Qualcomm or ARM GPUs.',
  'Safari 26 or later on macOS Tahoe 26, and on iOS, iPadOS and visionOS 26 (not on macOS Sequoia or Sonoma).',
  'Firefox 141 or later on Windows, and on Macs with Apple silicon (145 or later on macOS Tahoe, 147 or later on older macOS).',
];

export function showUnsupported(root: HTMLElement, message: string): void {
  const section = el('section', { class: 'unsupported' });
  section.append(
    el('h1', {}, 'WebGPU is not available'),
    el('p', {}, message),
    el(
      'p',
      {},
      'photonring traces light around a black hole in real time with WebGPU compute shaders. It works in:',
    ),
  );
  const list = el('ul');
  for (const b of BROWSERS) list.append(el('li', {}, b));
  section.append(list, el('h2', {}, 'Pre-rendered images'));
  const gallery = el('div', { class: 'gallery' });
  for (const item of GALLERY) {
    const figure = el('figure');
    const img = el('img');
    img.src = item.src;
    img.alt = item.caption;
    img.width = 640;
    img.height = 360;
    img.loading = 'lazy';
    figure.append(img, el('figcaption', {}, item.caption));
    gallery.append(figure);
  }
  section.append(
    gallery,
    el(
      'p',
      {},
      'These images come from the CPU reference renderer. This is a toy model for learning and demonstration, not a scientific simulation of any real observation.',
    ),
  );
  root.replaceChildren(section);
}
