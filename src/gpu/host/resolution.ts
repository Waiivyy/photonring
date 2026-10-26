// Internal render resolution: CSS size x device pixel ratio x quality scale, reduced (keeping the
// aspect ratio) to fit the device's texture limit and a pixel budget.

export interface ResolutionRequest {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  /** Quality scale, 1 = full resolution. */
  readonly scale: number;
  readonly maxTextureDimension2D: number;
  readonly maxPixels: number;
}

export interface Resolution {
  readonly width: number;
  readonly height: number;
  readonly limitedBy: 'none' | 'texture' | 'pixels';
}

const positive = (v: number, fallback: number) => (Number.isFinite(v) && v > 0 ? v : fallback);

export function chooseInternalResolution(r: ResolutionRequest): Resolution {
  const factor = positive(r.devicePixelRatio, 1) * positive(r.scale, 1);
  let w = Math.max(1, Math.round(positive(r.cssWidth, 1) * factor));
  let h = Math.max(1, Math.round(positive(r.cssHeight, 1) * factor));
  let limitedBy: Resolution['limitedBy'] = 'none';

  const maxDim = Math.max(1, Math.floor(positive(r.maxTextureDimension2D, 8192)));
  if (w > maxDim || h > maxDim) {
    const k = Math.min(maxDim / w, maxDim / h);
    w = Math.max(1, Math.min(maxDim, Math.floor(w * k)));
    h = Math.max(1, Math.min(maxDim, Math.floor(h * k)));
    limitedBy = 'texture';
  }
  const maxPixels = positive(r.maxPixels, Infinity);
  if (w * h > maxPixels) {
    const k = Math.sqrt(maxPixels / (w * h));
    w = Math.max(1, Math.floor(w * k));
    h = Math.max(1, Math.floor(h * k));
    limitedBy = 'pixels';
  }
  return { width: w, height: h, limitedBy };
}
