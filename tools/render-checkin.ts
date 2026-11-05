// Renders the Stage 7 check-in images with the CPU reference renderer into the gitignored
// artifacts/stage7/checkin/, for the owner's visual check-in. Nothing here is committed.
// Usage: npm run render:checkin
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from '../src/cpu-renderer/png.ts';
import { encodeImage, renderImage, type RenderSettings } from '../src/cpu-renderer/render.ts';
import { DEFAULT_DISK } from '../src/cpu-renderer/scenes.ts';
import { ehtPlan } from '../src/gpu/host/eht-post.ts';
import { ehtFieldOfView, M87_SKY_ROLL_DEG } from '../src/physics/index.ts';

const OUT = 'artifacts/stage7/checkin';
mkdirSync(OUT, { recursive: true });

const W = 640;
const H = 360;
const eht = (distance: number, elevationDeg: number): RenderSettings => ({
  width: W,
  height: H,
  M: 1,
  camera: {
    distance,
    azimuthDeg: 0,
    elevationDeg,
    fovYDeg: ehtFieldOfView(distance, W / H),
    rollDeg: M87_SKY_ROLL_DEG,
  },
  disk: DEFAULT_DISK,
  sky: 'black',
  mode: 'eht',
  samplesPerAxis: 2,
  dphi: 0.0125,
  maxSteps: 4000,
  exposure: 1,
  toneMapping: false,
});

const images: Record<string, RenderSettings> = {
  'eht-preset-cpu': eht(200, -73),
  'eht-30M-12deg-cpu': eht(30, 12),
};

for (const [name, s] of Object.entries(images)) {
  const t0 = performance.now();
  const out = renderImage(s);
  const png = encodePng(s.width, s.height, encodeImage(out, s));
  writeFileSync(`${OUT}/${name}.png`, png);
  const plan = ehtPlan(s.camera, s.width, s.height, s.M);
  console.log(
    `${name}.png  ${s.width}x${s.height}, ${s.samplesPerAxis}x${s.samplesPerAxis} samples, ` +
      `${((performance.now() - t0) / 1000).toFixed(1)} s, ${png.length} bytes; beam ` +
      `${plan.beamFwhmPx.toFixed(1)} px FWHM, reduce ${plan.f}; non-finite ${out.stats.nonFinite}, ` +
      `step limit ${out.stats.stepLimit}`,
  );
}
