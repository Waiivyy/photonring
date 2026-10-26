// Renders the Stage 1 check-in images with the CPU reference renderer into artifacts/stage1/,
// and measures the shadow radius on validation renders.
// Usage: npm run render:cpu
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from '../src/cpu-renderer/png.ts';
import { encodeImage, renderImage, type RenderSettings } from '../src/cpu-renderer/render.ts';
import { DEFAULT_DISK, GOLDEN_SCENES, validationScene } from '../src/cpu-renderer/scenes.ts';
import { measureShadowRadius } from '../src/cpu-renderer/shadow.ts';
import { autoFieldOfView, shadowAngularRadius } from '../src/physics/index.ts';

const OUT = 'artifacts/stage1';
mkdirSync(OUT, { recursive: true });

const big = (s: RenderSettings): RenderSettings => ({
  ...s,
  width: 320,
  height: 180,
  samplesPerAxis: 3,
});
const inclined = GOLDEN_SCENES.diskInclined;
const images: Record<string, RenderSettings> = {
  '1-flat-space': big(GOLDEN_SCENES.flatSpace),
  '2-no-disk': big(GOLDEN_SCENES.noDisk),
  '3-disk-face-on': big(GOLDEN_SCENES.diskFaceOn),
  '4-disk-inclined': big(inclined),
  '5-disk-inclined-opacity-0.6': big({ ...inclined, disk: { ...DEFAULT_DISK, opacity: 0.6 } }),
  '6-disk-nearly-edge-on': big({ ...inclined, camera: { ...inclined.camera, elevationDeg: 3 } }),
  '7-close-5M-auto-fov': big({
    ...inclined,
    camera: { ...inclined.camera, distance: 5, fovYDeg: autoFieldOfView(5, 1, 60) },
  }),
  '8-termination-debug': big({ ...inclined, mode: 'termination' }),
};

for (const [name, s] of Object.entries(images)) {
  const t0 = performance.now();
  const out = renderImage(s);
  const ms = performance.now() - t0;
  writeFileSync(`${OUT}/${name}.png`, encodePng(s.width, s.height, encodeImage(out, s)));
  const rays = s.width * s.height * s.samplesPerAxis ** 2;
  console.log(
    `${name}.png  ${s.width}x${s.height}, ${s.samplesPerAxis}x${s.samplesPerAxis} samples, ${(ms / 1000).toFixed(1)} s, ` +
      `escaped ${out.stats.escaped}, captured ${out.stats.captured}, step limit ${out.stats.stepLimit}, non-finite ${out.stats.nonFinite} of ${rays} rays`,
  );
}

console.log('\nShadow radius on validation renders (320x180, 1 sample per pixel, uniform sky):');
console.log('| r_o (M) | fov (deg) | analytic (px) | measured (px) | difference (px) | relative |');
console.log('|---|---|---|---|---|---|');
for (const ro of [5, 10, 30, 100, 200]) {
  const s = validationScene(ro, 320, 180);
  const m = measureShadowRadius(renderImage(s), s);
  const exact =
    Math.tan(shadowAngularRadius(ro, 1)) /
    ((2 * Math.tan((s.camera.fovYDeg * Math.PI) / 360)) / s.height);
  console.log(
    `| ${ro} | ${s.camera.fovYDeg.toFixed(1)} | ${exact.toFixed(3)} | ${m.radiusPx.toFixed(3)} | ${(m.radiusPx - exact).toFixed(3)} | ${((m.radiusPx / exact - 1) * 100).toFixed(3)} % |`,
  );
}
