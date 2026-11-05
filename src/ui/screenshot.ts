// Saved images: the presented full-quality image at internal resolution, with the visible
// overlays drawn from the same path data as the SVG layer (line widths and dashes scaled from
// CSS px) and a small legend, encoded as PNG by the browser and handed over as a download.
// Nothing leaves the device.
import { TERMINATION_COLOURS } from '../physics/index.ts';
import type { Lifecycle } from './lifecycle.ts';
import { legendLayout } from './legend-layout.ts';
import { HALO, OVERLAY_STYLES, type OverlayId } from './overlay-style.ts';
import { rampColours } from './eht-legend.ts';
import { legendEntries } from './legend-entries.ts';
import { STRIP_STYLES, stripPoint, type StripDrawing } from './strip-overlay.ts';
import { displayColour } from './swatch.ts';
import type { ViewMode } from './view-state.ts';

export { legendEntries };

export interface SaveScene {
  readonly width: number;
  readonly height: number;
  /** Internal pixels per CSS px, so lines look as they do on screen. */
  readonly scale: number;
  readonly rgba: Uint8Array;
  readonly edge: { cx: number; cy: number; rx: number; ry: number } | null;
  readonly rings: readonly { id: OverlayId; order: number; d: string }[];
  readonly overlays: readonly OverlayId[];
  readonly view: ViewMode;
  /** Photon subring view only: the strip's lines and labels (in strip coordinates). */
  readonly strip: StripDrawing | null;
  /** What the view's labels depend on: the camera distance and whether the disk is shown. */
  readonly labels: { readonly distance: number; readonly disk: boolean };
  /** EHT-style view only: its labels' inputs and the beam marker, in internal pixels. */
  readonly eht: {
    readonly distance: number;
    readonly disk: boolean;
    /** Null when the beam is too wide for the image (close to the hole). */
    readonly beam: { readonly cx: number; readonly cy: number; readonly r: number } | null;
  } | null;
}

function stroke(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  id: OverlayId,
  scale: number,
  order: number,
): void {
  const s = OVERLAY_STYLES[id];
  const width = (order === 0 ? s.width : (s.secondaryWidth ?? s.width)) * scale;
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(0, 0, 0, ${HALO.alpha})`;
  ctx.lineWidth = width + HALO.extraWidth * scale;
  draw();
  ctx.setLineDash(s.dash.map((d) => d * scale));
  ctx.strokeStyle = s.colour;
  ctx.lineWidth = width;
  draw();
}

/** Draws the image, overlays and legend into a new canvas and encodes it as PNG. */
export function composeImage(scene: SaveScene): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('2D canvas unavailable'));
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(scene.rgba), scene.width, scene.height),
    0,
    0,
  );
  const k = scene.scale;
  if (scene.edge) {
    const e = scene.edge;
    stroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      },
      'edge',
      k,
      0,
    );
  }
  for (const r of scene.rings) {
    const path = new Path2D(r.d);
    stroke(ctx, () => ctx.stroke(path), r.id, k, r.order);
  }

  if (scene.eht?.beam) drawBeam(ctx, scene.eht.beam, k);
  if (scene.strip) drawStrip(ctx, scene.strip, scene.width, scene.height, k);

  const entries = legendEntries(scene.overlays, scene.view, scene.labels);
  const box = legendLayout(scene.width, scene.height, entries, k);
  if (box) {
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(12, 12, 14, 0.78)';
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.font = `${box.fontSize}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.textBaseline = 'middle';
    entries.forEach((entry, i) => {
      const y = box.rows[i]!.y;
      const x = box.x + box.padding;
      if (entry.kind === 'overlay') {
        stroke(
          ctx,
          () => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + box.swatchWidth, y);
            ctx.stroke();
          },
          entry.id,
          k,
          0,
        );
      } else if (entry.kind === 'termination') {
        const size = box.fontSize;
        ctx.fillStyle = displayColour(TERMINATION_COLOURS[entry.id]);
        ctx.fillRect(x, y - size / 2, size, size);
        ctx.strokeStyle = '#e8e6e3';
        ctx.lineWidth = k;
        ctx.strokeRect(x, y - size / 2, size, size);
      } else if (entry.kind === 'ramp') {
        const size = box.fontSize;
        const gradient = ctx.createLinearGradient(x, 0, x + box.swatchWidth, 0);
        const stops = rampColours(5);
        stops.forEach((c, j) => gradient.addColorStop(j / (stops.length - 1), c));
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y - size / 2, box.swatchWidth, size);
      }
      ctx.fillStyle = '#e8e6e3';
      ctx.fillText(entry.label, x + box.swatchWidth + box.gap, y);
    });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}

/** The photon subring view's lines and labels, as the page draws them, at the image's scale. */
function drawStrip(
  ctx: CanvasRenderingContext2D,
  d: StripDrawing,
  width: number,
  height: number,
  k: number,
): void {
  ctx.lineJoin = 'round';
  for (const pass of ['halo', 'line'] as const) {
    for (const line of d.lines) {
      const style = STRIP_STYLES[line.kind];
      ctx.setLineDash(pass === 'line' ? style.dash.map((v) => v * k) : []);
      ctx.strokeStyle = pass === 'halo' ? `rgba(0, 0, 0, ${HALO.alpha})` : style.colour;
      ctx.lineWidth = (pass === 'halo' ? style.width + HALO.extraWidth : style.width) * k;
      ctx.beginPath();
      line.points.forEach((p, i) => {
        const [x, y] = stripPoint(p, d.range, width, height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  ctx.font = `${12 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = `rgba(0, 0, 0, ${HALO.alpha})`;
  ctx.fillStyle = '#e8e6e3';
  for (const label of d.labels) {
    const [x, y] = stripPoint([label.x, label.logEps], d.range, width, height);
    ctx.textAlign =
      label.anchor === 'middle' ? 'center' : label.anchor === 'end' ? 'right' : 'left';
    ctx.strokeText(label.text, x, y);
    ctx.fillText(label.text, x, y);
  }
  ctx.textAlign = 'start';
}

/** The beam marker: a white circle on a dark halo, labelled "beam" below it. */
function drawBeam(
  ctx: CanvasRenderingContext2D,
  beam: { readonly cx: number; readonly cy: number; readonly r: number },
  k: number,
): void {
  ctx.setLineDash([]);
  for (const [colour, width] of [
    [`rgba(0, 0, 0, ${HALO.alpha})`, 1.5 * k + HALO.extraWidth * k],
    ['#e8e6e3', 1.5 * k],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(beam.cx, beam.cy, beam.r, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.font = `${12 * k}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e8e6e3';
  ctx.fillText('beam', beam.cx, beam.cy + beam.r + 4 * k);
  ctx.textAlign = 'start';
}

/** Offers the blob as a file download and frees its object URL after a while. */
export function download(blob: Blob, name: string, life: Lifecycle): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  // Freed after a while, or at teardown (which cancels the timer); freeing twice is harmless.
  life.timeout(() => URL.revokeObjectURL(url), 10_000);
  life.onDispose(() => URL.revokeObjectURL(url));
}
