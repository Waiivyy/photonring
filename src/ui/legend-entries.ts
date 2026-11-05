// What the legend of a saved image lists: the enabled overlays, then the key of the view (the
// termination colours, or the EHT-style view's colour ramp and labels). Pure.
import { EHT_RAMP_LABEL, ehtLegendLines, wrapText } from './eht-legend.ts';
import {
  OVERLAY_STYLES,
  TERMINATION_LABELS,
  type OverlayId,
  type TerminationKind,
} from './overlay-style.ts';
import type { ViewMode } from './view-state.ts';

export type LegendEntry =
  | { readonly kind: 'overlay'; readonly id: OverlayId; readonly label: string }
  | { readonly kind: 'termination'; readonly id: TerminationKind; readonly label: string }
  | { readonly kind: 'ramp'; readonly label: string }
  | { readonly kind: 'text'; readonly label: string };

/** Longest line of label text in a saved image, in characters. */
const TEXT_WIDTH = 52;

export function legendEntries(
  overlays: readonly OverlayId[],
  view: ViewMode,
  eht: { readonly distance: number; readonly disk: boolean } | null = null,
): LegendEntry[] {
  const out: LegendEntry[] = overlays.map((id) => ({
    kind: 'overlay',
    id,
    label: OVERLAY_STYLES[id].label,
  }));
  if (view === 'termination') {
    for (const id of Object.keys(TERMINATION_LABELS) as TerminationKind[]) {
      out.push({ kind: 'termination', id, label: TERMINATION_LABELS[id] });
    }
  } else if (view === 'eht' && eht) {
    out.unshift({ kind: 'ramp', label: EHT_RAMP_LABEL });
    for (const line of ehtLegendLines(eht)) {
      for (const part of wrapText(line, TEXT_WIDTH)) out.push({ kind: 'text', label: part });
    }
  }
  return out;
}
