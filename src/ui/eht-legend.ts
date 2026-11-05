// Labels of the EHT-style view, shared by the on-screen legend, the Controls panel and saved
// images, so the image never appears without them (docs/DESIGN.md, section 16). Pure.
import { afmhot } from '../gpu/host/eht-post.ts';
import { ehtBeamFwhmM, edgePixelScale } from '../physics/index.ts';
import { formatNumber } from './quantise.ts';

/** Camera of the preset: 200 M away, 73 degrees below the disk, 17 degrees from its axis. */
export const EHT_PRESET = { distance: 200, azimuthDeg: 0, elevationDeg: -73 } as const;

/** The preset's button. Never "M87*" alone: the image is not M87* (owner's choice, 2026-11-04). */
export const EHT_PRESET_LABEL = 'Tilt 17°, as for M87*';

export const EHT_PRESET_DESCRIPTION =
  "Puts the camera 200 M away, 17 degrees from the disk's axis, as the EHT's models of M87* " +
  'assume, and shows the EHT-style view.';

/** Label of the colour ramp. */
export const EHT_RAMP_LABEL = 'False colour: black at 0, white at the brightest point';

/** Below this distance the beam, matched at the shadow edge, is only approximate elsewhere. */
const DISTANT_OBSERVER_M = 100;

/** The view's label lines, in order; the first says why the image is black when the disk is off. */
export function ehtLegendLines(s: { readonly distance: number; readonly disk: boolean }): string[] {
  const lines: string[] = [];
  if (!s.disk) lines.push('Disk off: nothing emits in this view.');
  lines.push('Brightness of the toy disk at all frequencies, on a linear scale.');
  lines.push(
    'Blurred to the 20 μas resolution of the 2019 M87* images, scaled to this hole: ' +
      `${formatNumber(ehtBeamFwhmM(), 1)} M.`,
  );
  lines.push(
    'Not a simulation of the EHT observation: the real ring is light from hot, tenuous gas at ' +
      '1.3 mm and, in units of M, about half this size.',
  );
  lines.push('Turned so that north is up, as for M87* on the sky.');
  if (s.distance < DISTANT_OBSERVER_M) {
    lines.push('The beam scale is defined for a distant observer.');
  }
  return lines;
}

/** Words of `text` in lines of at most `max` characters (a longer word gets a line of its own). */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= max) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** n CSS colours along the false-colour map, from 0 to 1 (display values). */
export function rampColours(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const c = afmhot(n === 1 ? 0 : i / (n - 1)).map((v) => Math.round(255 * v));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  });
}

/** Where the beam marker sits, in the image's own units of M from the centre (left, up). */
const BEAM_OFFSET_M = 21;

/**
 * The beam marker: a circle of the beam's FWHM at the shadow edge's scale, at the upper left of
 * the framing square, clear of the ring and of the page's status lines and legend (EHT figures
 * put it at the lower right, where the page's legend sits). In the units of the image box. Close
 * to the hole the framing square is larger than the image, so the marker moves in to stay inside
 * with room for its label; null when the beam is too wide for the image to show it.
 */
export function beamMarker(
  distance: number,
  width: number,
  height: number,
  tanHalfFovY: number,
): { cx: number; cy: number; r: number } | null {
  const s = edgePixelScale(distance, height, tanHalfFovY);
  const r = (ehtBeamFwhmM() * s) / 2;
  const margin = 0.02 * Math.min(width, height);
  const label = 0.05 * Math.min(width, height);
  if (2 * r + 2 * margin > width || 2 * r + 2 * margin + label > height) return null;
  return {
    cx: Math.min(width - margin - r, Math.max(margin + r, width / 2 - BEAM_OFFSET_M * s)),
    cy: Math.min(height - margin - label - r, Math.max(margin + r, height / 2 - BEAM_OFFSET_M * s)),
    r,
  };
}
