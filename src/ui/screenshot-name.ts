// File name of a saved image: the view it shows, at the URL's precision, in ASCII.
import { ANGLE_DECIMALS, DISTANCE_DECIMALS, formatNumber, quantiseOrbit } from './quantise.ts';
import type { ViewMode } from './view-state.ts';

export function screenshotName(s: {
  readonly distance: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly view: ViewMode;
}): string {
  const o = quantiseOrbit({ ...s, baseFovDeg: 60 });
  const r = formatNumber(o.distance, DISTANCE_DECIMALS);
  const az = formatNumber(o.azimuthDeg, ANGLE_DECIMALS);
  const el = formatNumber(o.elevationDeg, ANGLE_DECIMALS);
  return `photonring-r${r}-az${az}-el${el}${s.view === 'termination' ? '-termination' : ''}.png`;
}
