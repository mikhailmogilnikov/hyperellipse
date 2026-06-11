export interface HyperellipseOptions {
  /**
   * Force the JS fallback even when the browser supports native
   * `corner-shape` (useful for debugging and visual comparison).
   */
  force?: boolean;
  /**
   * `border-radius` multiplier applied by the automatic pending stylesheet
   * until per-element fallback styles are written. Squircles visually round
   * less than circles at the same radius, so a reduced radius softens the
   * shape jump. Range 0..1, default `0.6`. Prefer the CSS `--corner-scale`
   * snippet for SSR; this only helps after JS loads.
   */
  pendingRadiusScale?: number;
  /**
   * Extra selectors for elements that use corner shapes — escape hatch for
   * cross-origin stylesheets that cannot be scanned via CSSOM.
   */
  selector?: string;
}

export interface HyperellipseController {
  /** Whether the JS fallback engine is running (unsupported browser or `force`). */
  readonly active: boolean;
  /** Stop the fallback and remove all applied inline styles and attributes. */
  destroy: () => void;
  /** Rescan stylesheets and recompute every tracked element. */
  refresh: () => void;
  /** Whether the browser supports native `corner-shape`. */
  readonly supported: boolean;
}
