import { createEngine } from "./internal/engine";
import { createManagedSheet } from "./internal/pending";
import { CORNER_SHAPE_VAR } from "./internal/scan";
import type { HyperellipseController, HyperellipseOptions } from "./types";

const DEFAULT_PENDING_RADIUS_SCALE = 0.6;

/**
 * Native bridge for supporting browsers: write only `--corner-shape` and get
 * native rendering. `@property` with `inherits: false` mirrors the native
 * non-inherited `corner-shape`, and the `:where(*)` rule keeps zero specificity
 * so author styles are not overridden.
 */
const NATIVE_BRIDGE_CSS = `@property ${CORNER_SHAPE_VAR}{syntax:"*";inherits:false;}@supports (corner-shape:squircle){:where(*){corner-shape:var(${CORNER_SHAPE_VAR},round);}}`;

const detectSupport = (): boolean =>
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("corner-shape", "squircle");

const registerNonInheritedVar = (): void => {
  try {
    CSS.registerProperty?.({
      name: CORNER_SHAPE_VAR,
      syntax: "*",
      inherits: false,
    });
  } catch {
    // Already registered or API unavailable — non-fatal: the fallback only
    // targets elements discovered via scanned selectors anyway.
  }
};

/** No-op controller returned during SSR or when `document` is unavailable. */
const createInertController = (supported: boolean): HyperellipseController => ({
  supported,
  active: false,
  refresh: () => {
    // SSR / not applicable — nothing to refresh.
  },
  destroy: () => {
    // SSR / not applicable — nothing to tear down.
  },
});

let activeController: HyperellipseController | null = null;

/**
 * Registers the `corner-shape` polyfill. Idempotent: repeated calls return the
 * same controller instance.
 *
 * In supporting browsers only a tiny CSS bridge is injected
 * (`corner-shape: var(--corner-shape)`). Elsewhere the JS fallback runs on
 * clip-path / SVG pseudo-layers.
 */
export const registerHyperellipse = (
  options?: HyperellipseOptions
): HyperellipseController => {
  if (activeController) {
    return activeController;
  }
  if (typeof document === "undefined") {
    return createInertController(false);
  }

  const supported = detectSupport();

  if (supported && !options?.force) {
    const bridge = createManagedSheet(document, "bridge");
    bridge.update(NATIVE_BRIDGE_CSS);
    const controller: HyperellipseController = {
      supported,
      active: false,
      refresh: () => {
        // Native rendering — nothing for JS to update.
      },
      destroy: () => {
        bridge.remove();
        activeController = null;
      },
    };
    activeController = controller;
    return controller;
  }

  registerNonInheritedVar();
  const engine = createEngine(document, {
    selector: options?.selector,
    pendingRadiusScale:
      options?.pendingRadiusScale ?? DEFAULT_PENDING_RADIUS_SCALE,
  });

  const controller: HyperellipseController = {
    supported,
    active: true,
    refresh: () => {
      engine.refresh();
    },
    destroy: () => {
      engine.destroy();
      activeController = null;
    },
  };
  activeController = controller;
  return controller;
};
