// Saved images: the presented full-quality image at internal resolution, with the visible
// overlays drawn from the same path data as the SVG layer (line widths and dashes scaled from
// CSS px) and a small legend, encoded as PNG by the browser and handed over as a download.
// Nothing leaves the device.
import { TERMINATION_COLOURS } from '../physics/index.ts';
import type { Lifecycle } from './lifecycle.ts';
import { legendLayout } from './legend-layout.ts';
import { HALO, OVERLAY_STYLES, type OverlayId } from './overlay-style.ts';
import { TERMINATION_LABELS, displayColour, type TerminationKind } from './swatch.ts';

export interface SaveScene {
  readonly width: number;
  readonly height: number;
  /** Internal pixels per CSS px, so lines look as they do on screen. */
  readonly scale: number;
  readonly rgba: Uint8Array;
  readonly edge: { cx: number; cy: number; rx: number; ry: number } | null;
  readonly rings: readonly { id: OverlayId; order: number; d: string }[];
  readonly overlays: readonly OverlayId[];
  readonly termination: boolean;
}

type LegendEntry =
  | { readonly kind: 'overlay'; readonly id: OverlayId; readonly label: string }
  | { readonly kind: 'termination'; readonly id: TerminationKind; readonly label: string };

/** The legend of a saved image: the enabled overlays, then the termination colours. */
export function legendEntries(overlays: readonly OverlayId[], termination: boolean): LegendEntry[] {
  const out: LegendEntry[] = overlays.map((id) => ({
    kind: 'overlay',
    id,
    label: OVERLAY_STYLES[id].label,
  }));
  if (termination) {
    for (const id of Object.keys(TERMINATION_LABELS) as TerminationKind[]) {
      out.push({ kind: 'termination', id, label: TERMINATION_LABELS[id] });
    }
  }
  return out;
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

  const entries = legendEntries(scene.overlays, scene.termination);
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
      } else {
        const size = box.fontSize;
        ctx.fillStyle = displayColour(TERMINATION_COLOURS[entry.id]);
        ctx.fillRect(x, y - size / 2, size, size);
        ctx.strokeStyle = '#e8e6e3';
        ctx.lineWidth = k;
        ctx.strokeRect(x, y - size / 2, size, size);
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
