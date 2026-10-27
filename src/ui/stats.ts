// The page's read-only debug interface (window.photonring), shared by the app and the browser
// tests. Types only.

export interface AppStats {
  state: 'starting' | 'rendering' | 'lost';
  /** Images presented to the canvas so far. */
  frames: number;
  internalWidth: number;
  internalHeight: number;
  limitedBy: 'none' | 'texture' | 'pixels';
  /** Applied scene: what the image shows. */
  mode: 'colour' | 'termination';
  disk: boolean;
  antialias: boolean;
  distance: number;
  azimuthDeg: number;
  elevationDeg: number;
  fovYDeg: number;
  stage: 'preview' | 'trace' | 'refine' | 'done';
  /** Preview frames rendered so far, and the scale of the last one. */
  previews: number;
  previewScale: number;
  tilesRemaining: number;
  /** Measured milliseconds of the last preview, and of the current image's first pass and anti-aliasing. */
  previewMs: number;
  traceMs: number;
  refineMs: number;
  timing: 'timestamp-query' | 'wall-clock';
  /** Enabled overlays, in canonical order. */
  overlays: string[];
  controlsOpen: boolean;
  /** What the controls ask for; the image follows within the brightness limiter's interval. */
  requestedDisk: boolean;
  requestedMode: 'colour' | 'termination';
  brightnessPending: boolean;
  /** Brightness changes applied so far, and the times (performance.now) of the last 16. */
  toggleApplies: number;
  toggleApplyTimes: number[];
}

export interface PhotonringDebug {
  stats(): AppStats;
  destroyDevice(): void;
}

declare global {
  interface Window {
    photonring?: { debug: PhotonringDebug };
  }
}
