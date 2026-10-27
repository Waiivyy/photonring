// Box of the legend drawn into saved images: bottom right, one row per item, sized from the
// scale between internal pixels and CSS px so it looks as it does on screen. Pure: text width is
// estimated from the character count, generously, so the drawn text fits.

export interface LegendItem {
  readonly label: string;
}

export interface LegendBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly padding: number;
  readonly fontSize: number;
  readonly swatchWidth: number;
  readonly gap: number;
  /** Vertical centre of each row. */
  readonly rows: readonly { readonly y: number }[];
}

const FONT = 12;
const LINE = 18;
const PADDING = 8;
const SWATCH = 24;
const GAP = 8;
const MARGIN = 12;
/** Average glyph width of a sans-serif font, as a fraction of the size, rounded up. */
const CHAR_WIDTH = 0.6;

export function legendLayout(
  width: number,
  height: number,
  items: readonly LegendItem[],
  scale: number,
): LegendBox | null {
  if (items.length === 0) return null;
  // Shrink when the box would not fit inside the image with its margins.
  const longest = Math.max(...items.map((i) => i.label.length));
  const unitWidth = 2 * PADDING + SWATCH + GAP + longest * CHAR_WIDTH * FONT + 2 * MARGIN;
  const unitHeight = 2 * PADDING + items.length * LINE + 2 * MARGIN;
  scale = Math.min(scale, width / unitWidth, height / unitHeight);
  const fontSize = FONT * scale;
  const padding = PADDING * scale;
  const swatchWidth = SWATCH * scale;
  const gap = GAP * scale;
  const margin = MARGIN * scale;
  const line = LINE * scale;
  const boxWidth = 2 * padding + swatchWidth + gap + longest * CHAR_WIDTH * fontSize;
  const boxHeight = 2 * padding + items.length * line;
  const x = Math.max(0, width - margin - boxWidth);
  const y = Math.max(0, height - margin - boxHeight);
  return {
    x,
    y,
    width: boxWidth,
    height: boxHeight,
    margin,
    padding,
    fontSize,
    swatchWidth,
    gap,
    rows: items.map((_, i) => ({ y: y + padding + (i + 0.5) * line })),
  };
}
