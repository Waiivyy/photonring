// Shown when WebGPU is missing or no device can be created: why, where it works, and a gallery
// of images rendered beforehand by the CPU reference renderer (tools/render-gallery.ts).

const GALLERY = [
  { file: 'shadow-and-stars.png', caption: 'The shadow and lensed stars, 30 M away, no disk.' },
  { file: 'disk-inclined.png', caption: 'Thin disk seen 12 degrees above its plane.' },
  { file: 'disk-face-on.png', caption: 'The same disk seen from above its axis.' },
  { file: 'close-up-5M.png', caption: 'From 5 M, with the field of view widened to 120 degrees.' },
] as const;

const BROWSERS = [
  'Chrome or Edge 113 or later on Windows, macOS and ChromeOS; on Linux with recent Intel or NVIDIA GPUs.',
  'Safari 26 on macOS Tahoe 26, and on iOS and iPadOS 26.',
  'Firefox 141 or later on Windows, and 147 or later on Macs with Apple silicon.',
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function showUnsupported(root: HTMLElement, message: string): void {
  const section = el('section');
  section.className = 'unsupported';
  section.append(
    el('h1', 'WebGPU is not available'),
    el('p', message),
    el(
      'p',
      'photonring traces light around a black hole in real time with WebGPU compute shaders. It works in:',
    ),
  );
  const list = el('ul');
  for (const b of BROWSERS) list.append(el('li', b));
  section.append(list, el('h2', 'Pre-rendered images'));
  const gallery = el('div');
  gallery.className = 'gallery';
  for (const item of GALLERY) {
    const figure = el('figure');
    const img = el('img');
    img.src = `./gallery/${item.file}`;
    img.alt = item.caption;
    img.width = 640;
    img.height = 360;
    img.loading = 'lazy';
    figure.append(img, el('figcaption', item.caption));
    gallery.append(figure);
  }
  section.append(
    gallery,
    el(
      'p',
      'These images come from the CPU reference renderer. This is a toy model for learning and demonstration, not a scientific simulation of any real observation.',
    ),
  );
  root.replaceChildren(section);
}
