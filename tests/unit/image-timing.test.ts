// The status line's times for the image being drawn: GPU time only when every batch of the
// image has one, otherwise the wall-clock times of all its batches, labelled as such.
import { describe, expect, it } from 'vitest';
import { ImageTiming } from '../../src/ui/image-timing.ts';

const gpu = (gpuMs: number, wallMs = gpuMs + 1) => ({ gpuMs, wallMs });
const wall = (wallMs: number) => ({ gpuMs: null, wallMs });

describe('ImageTiming', () => {
  it('sums the GPU times of the batches when every batch has one', () => {
    const t = new ImageTiming(true);
    t.add('trace', gpu(10));
    t.add('trace', gpu(5));
    t.add('refine', gpu(3));
    expect(t.view()).toEqual({
      clock: 'GPU',
      traceMs: 15,
      refineMs: 3,
      previewClock: 'GPU',
      previewMs: 0,
    });
  });

  it('shows the wall-clock sums of the whole image when any batch has no GPU time', () => {
    const t = new ImageTiming(true);
    t.add('trace', gpu(10, 12));
    t.add('trace', wall(7));
    t.add('refine', gpu(3, 4));
    const v = t.view();
    expect(v.clock).toBe('frame');
    expect(v.traceMs).toBe(19);
    expect(v.refineMs).toBe(4);
  });

  it('also when only the anti-aliasing batch lacks a GPU time', () => {
    const t = new ImageTiming(true);
    t.add('trace', gpu(10, 12));
    t.add('refine', wall(4));
    expect(t.view()).toMatchObject({ clock: 'frame', traceMs: 12, refineMs: 4 });
  });

  it('says frame time from the start when the device has no timestamp queries', () => {
    const t = new ImageTiming(false);
    expect(t.view()).toMatchObject({ clock: 'frame', previewClock: 'frame' });
    t.add('trace', wall(8));
    expect(t.view()).toMatchObject({ clock: 'frame', traceMs: 8 });
  });

  it('starts the image over on reset, GPU again if the device has timestamp queries', () => {
    const t = new ImageTiming(true);
    t.add('trace', wall(8));
    t.reset();
    expect(t.view()).toMatchObject({ clock: 'GPU', traceMs: 0, refineMs: 0 });
    t.add('trace', gpu(6));
    expect(t.view()).toMatchObject({ clock: 'GPU', traceMs: 6 });
  });

  it('labels the preview by its own clock and keeps it across resets', () => {
    const t = new ImageTiming(true);
    t.add('preview', wall(9));
    expect(t.view()).toMatchObject({ previewClock: 'frame', previewMs: 9, clock: 'GPU' });
    t.add('preview', gpu(2));
    t.reset();
    expect(t.view()).toMatchObject({ previewClock: 'GPU', previewMs: 2 });
  });
});
