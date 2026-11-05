// Plain-language descriptions of the view, for the canvas's accessible name, the HUD and the
// announcements. Pure.
import { formatNumber } from './quantise.ts';
import { OVERLAY_STYLES, type OverlayId } from './overlay-style.ts';
import type { ViewMode } from './view-state.ts';

export interface Described {
  readonly distance: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly disk: boolean;
  readonly view: ViewMode;
  readonly overlays: readonly OverlayId[];
}

const deg = (x: number) => `${formatNumber(Math.abs(x), 2)} degrees`;

/** Where the camera is relative to the disk plane. */
function height(elevationDeg: number): string {
  if (elevationDeg === 0) return 'in the disk plane';
  return `${deg(elevationDeg)} ${elevationDeg > 0 ? 'above' : 'below'} the disk plane`;
}

/** What the view adds to the accessible name. */
function viewPart(d: Described): string {
  switch (d.view) {
    case 'colour':
      return `disk ${d.disk ? 'on' : 'off'}`;
    case 'eht':
      return `EHT-style view, false colour, blurred to the EHT resolution${d.disk ? '' : ', disk off'}`;
    case 'termination':
      return 'termination view';
    case 'subrings':
      return 'photon subring strip';
  }
}

/** Accessible name of the canvas: what the image shows. */
export function sceneSummary(d: Described): string {
  if (d.view === 'subrings') {
    return (
      'Black hole photon subrings: magnified strip just outside the shadow edge, logarithmic ' +
      `scale, from ${d.distance.toFixed(1)} M, ${height(d.elevationDeg)}${d.disk ? '' : ', disk off'}.`
    );
  }
  const parts = [
    `Black hole seen from ${d.distance.toFixed(1)} M, ${height(d.elevationDeg)}`,
    viewPart(d),
  ];
  if (d.overlays.length > 0) {
    parts.push(
      `overlays: ${d.overlays.map((o) => OVERLAY_STYLES[o].label.toLowerCase()).join(', ')}`,
    );
  }
  return `${parts.join('; ')}.`;
}

/** The camera, as announced after keyboard or button input settles. */
export function cameraSentence(
  d: Pick<Described, 'distance' | 'azimuthDeg' | 'elevationDeg'>,
): string {
  return (
    `Distance ${d.distance.toFixed(1)} M, elevation ${formatNumber(d.elevationDeg, 2)} degrees, ` +
    `azimuth ${formatNumber(d.azimuthDeg, 2)} degrees`
  );
}
