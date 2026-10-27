// When the Validation panel measures (Stage 4): only while open, once per presented camera,
// after the image is complete; results for a camera the view has left are discarded, and a
// return to the measured camera shows its result again.
import { describe, expect, it } from 'vitest';
import type { CameraParams } from '../../src/physics/index.ts';
import {
  createValidationScheduler,
  type ValidationScheduler,
} from '../../src/ui/validation-scheduler.ts';
import type { ShadowResult } from '../../src/ui/validation.ts';

const cam = (distance: number): CameraParams => ({
  distance,
  azimuthDeg: 0,
  elevationDeg: 12,
  fovYDeg: 60,
});

function setup() {
  const log: string[] = [];
  const pendingMeasures: {
    camera: CameraParams;
    resolve: (r: ShadowResult) => void;
    reject: (e: Error) => void;
  }[] = [];
  const s: ValidationScheduler = createValidationScheduler({
    measure: (camera) =>
      new Promise<ShadowResult>((resolve, reject) =>
        pendingMeasures.push({ camera, resolve, reject }),
      ),
    pending: (state, camera) => log.push(`${state} ${camera.distance}`),
    done: (result, fresh) => log.push(`done ${result.distance}${fresh ? ' fresh' : ''}`),
    failed: () => log.push('failed'),
    now: () => 0,
  });
  const result = (distance: number) => ({ distance }) as ShadowResult;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { s, log, pendingMeasures, result, flush };
}

describe('validation scheduler', () => {
  it('measures nothing while closed', () => {
    const { s, pendingMeasures } = setup();
    s.update(false, cam(30), true);
    expect(pendingMeasures).toHaveLength(0);
  });

  it('waits for a complete image, then measures the presented camera once', async () => {
    const { s, log, pendingMeasures, result, flush } = setup();
    s.update(true, cam(30), false);
    expect(log).toEqual(['waiting 30']);
    s.update(true, cam(30), true);
    s.update(true, cam(30), true);
    expect(pendingMeasures).toHaveLength(1);
    pendingMeasures[0]!.resolve(result(30));
    await flush();
    s.update(true, cam(30), true);
    expect(log).toEqual(['waiting 30', 'measuring 30', 'done 30 fresh']);
    expect(pendingMeasures).toHaveLength(1);
    expect(s.runs).toBe(1);
  });

  it('shows the stored result again when the view returns to the measured camera', async () => {
    const { s, log, pendingMeasures, result, flush } = setup();
    s.update(true, cam(30), true);
    pendingMeasures[0]!.resolve(result(30));
    await flush();
    s.update(true, cam(30), true);
    s.update(true, cam(33), false); // moved away, not settled
    s.update(true, cam(30), false); // back before settling
    s.update(true, cam(30), true);
    expect(log.slice(-2)).toEqual(['waiting 33', 'done 30']);
    expect(pendingMeasures).toHaveLength(1);
    expect(s.runs).toBe(1);
  });

  it('discards a result for a camera the view has left, then measures the new one', async () => {
    const { s, log, pendingMeasures, result, flush } = setup();
    s.update(true, cam(30), true);
    s.update(true, cam(33), false); // moved during the measurement
    pendingMeasures[0]!.resolve(result(30));
    await flush();
    s.update(true, cam(33), false);
    expect(log).toEqual(['waiting 30', 'measuring 30', 'waiting 33']);
    expect(s.runs).toBe(0);
    s.update(true, cam(33), true);
    expect(pendingMeasures).toHaveLength(2);
    expect(pendingMeasures[1]!.camera.distance).toBe(33);
    pendingMeasures[1]!.resolve(result(33));
    await flush();
    expect(log.at(-1)).toBe('done 33 fresh');
    expect(s.runs).toBe(1);
  });

  it('returning to the camera being measured shows it as measuring', async () => {
    const { s, log, pendingMeasures, result, flush } = setup();
    s.update(true, cam(30), true);
    s.update(true, cam(33), false);
    s.update(true, cam(30), false);
    expect(log.slice(-1)).toEqual(['measuring 30']);
    pendingMeasures[0]!.resolve(result(30));
    await flush();
    expect(log.at(-1)).toBe('done 30 fresh');
  });

  it('closing discards a measurement in flight; reopening measures again', async () => {
    const { s, log, pendingMeasures, result, flush } = setup();
    s.update(true, cam(30), true);
    s.close();
    pendingMeasures[0]!.resolve(result(30));
    await flush();
    expect(log).toEqual(['waiting 30', 'measuring 30']);
    expect(s.runs).toBe(0);
    s.update(true, cam(30), true);
    expect(log.at(-1)).toBe('measuring 30');
    expect(pendingMeasures).toHaveLength(2);
  });

  it('reports a failure for the presented camera only', async () => {
    const { s, log, pendingMeasures, flush } = setup();
    s.update(true, cam(30), true);
    pendingMeasures[0]!.reject(new Error('device lost'));
    await flush();
    expect(log.at(-1)).toBe('failed');
    s.update(true, cam(40), true);
    s.update(true, cam(41), false);
    pendingMeasures[1]!.reject(new Error('device lost'));
    await flush();
    expect(log.at(-1)).toBe('waiting 41');
  });
});
