import { createEngine } from "./internal/engine";
import { createManagedSheet } from "./internal/pending";
import { CORNER_SHAPE_VAR } from "./internal/scan";
import type { HyperellipseController, HyperellipseOptions } from "./types";

const DEFAULT_PENDING_RADIUS_SCALE = 0.6;

/**
 * Мост для браузеров с нативной поддержкой: позволяет писать только
 * `--corner-shape` и получать нативный рендер. `@property` с
 * inherits: false повторяет ненаследуемость нативного corner-shape,
 * а правило с нулевой специфичностью не перебивает авторские стили.
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
    // Уже зарегистрировано или API недоступен — не критично:
    // фоллбек таргетит только элементы из просканированных селекторов.
  }
};

const createInertController = (supported: boolean): HyperellipseController => ({
  supported,
  active: false,
  refresh: () => {
    // SSR/неприменимо — нечего обновлять.
  },
  destroy: () => {
    // SSR/неприменимо — нечего останавливать.
  },
});

let activeController: HyperellipseController | null = null;

/**
 * Регистрирует corner-shape фоллбек. Идемпотентна: повторные вызовы
 * возвращают существующий контроллер.
 *
 * В браузерах с нативной поддержкой инжектится только крошечный
 * CSS-мост (`corner-shape: var(--corner-shape)`); в остальных
 * запускается JS-фоллбек на clip-path/SVG.
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
        // Нативный рендер — обновлять нечего.
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
