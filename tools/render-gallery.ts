// Renders the images shown on the unsupported-browser page with the CPU reference renderer.
// Usage: npm run gallery   (writes public/gallery/*.png, which are committed)
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from '../src/cpu-renderer/png.ts';
import { encodeImage, renderImage, type RenderSettings } from '../src/cpu-renderer/render.ts';
import { GOLDEN_SCENES } from '../src/cpu-renderer/scenes.ts';
import { autoFieldOfView } from '../src/physics/index.ts';

const OUT = 'public/gallery';
mkdirSync(OUT, { recursive: true });

const size = (s: RenderSettings): RenderSettings => ({
  ...s,
  width: 640,
  height: 360,
  samplesPerAxis: 3,
});
const inclined = GOLDEN_SCENES.diskInclined;
const scenes: Record<string, RenderSettings> = {
  'shadow-and-stars': size(GOLDEN_SCENES.noDisk),
  'disk-inclined': size(inclined),
  'disk-face-on': size(GOLDEN_SCENES.diskFaceOn),
  'close-up-5M': size({
    ...inclined,
    camera: { ...inclined.camera, distance: 5, fovYDeg: autoFieldOfView(5, 1, 60) },
  }),
};

for (const [name, s] of Object.entries(scenes)) {
  const t0 = performance.now();
  const png = encodePng(s.width, s.height, encodeImage(renderImage(s), s));
  writeFileSync(`${OUT}/${name}.png`, png);
  console.log(
    `${name}.png  ${(png.length / 1024).toFixed(0)} KB, ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
}
