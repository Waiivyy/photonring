// Small legend swatches, drawn with the same style table as the overlays.
import { srgbEncode, TERMINATION_COLOURS, type Vec3 } from '../physics/index.ts';
import { svgEl } from './dom.ts';
import { rampColours } from './eht-legend.ts';
import { HALO, type OverlayStyle, type TerminationKind } from './overlay-style.ts';

/** A short sample of an overlay line on its halo. */
export function lineSwatch(style: OverlayStyle): SVGSVGElement {
  const line = (stroke: string, width: number, dash: readonly number[], opacity = 1) =>
    svgEl('line', {
      x1: 2,
      y1: 7,
      x2: 30,
      y2: 7,
      stroke,
      'stroke-width': width,
      'stroke-opacity': opacity,
      'stroke-dasharray': dash.length > 0 ? dash.join(' ') : null,
    });
  return svgEl(
    'svg',
    {
      class: 'swatch',
      width: 32,
      height: 14,
      viewBox: '0 0 32 14',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    line('#000', style.width + HALO.extraWidth, [], HALO.alpha),
    line(style.colour, style.width, style.dash),
  );
}

/** CSS colour of a linear sRGB colour as the blit shows it (no tone mapping in that view). */
export function displayColour(c: Vec3): string {
  const v = c.map((x) => Math.round(255 * srgbEncode(Math.min(1, Math.max(0, x)))));
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
}

export { TERMINATION_LABELS, type TerminationKind } from './overlay-style.ts';

/** The EHT-style view's colour ramp as thin bars (no gradient, so no element ids to clash). */
export function rampSwatch(width = 48, height = 10): SVGSVGElement {
  const n = 24;
  const colours = rampColours(n);
  return svgEl(
    'svg',
    {
      class: 'swatch ramp',
      width,
      height,
      viewBox: `0 0 ${n} 1`,
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    ...colours.map((fill, i) => svgEl('rect', { x: i, y: 0, width: 1.05, height: 1, fill })),
  );
}

/** A filled square in a termination colour. */
export function colourSwatch(kind: TerminationKind): SVGSVGElement {
  return svgEl(
    'svg',
    {
      class: 'swatch',
      width: 14,
      height: 14,
      viewBox: '0 0 14 14',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    svgEl('rect', {
      x: 1,
      y: 1,
      width: 12,
      height: 12,
      fill: displayColour(TERMINATION_COLOURS[kind]),
    }),
  );
}
