import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "./engine";
import { CORNER_SCALE_VAR } from "./scan";

type IoCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = "";
  readonly scrollMargin = "";
  readonly thresholds: readonly number[] = [0];

  private readonly callback: IoCallback;
  private readonly observed = new Set<Element>();

  static latest: MockIntersectionObserver | undefined;

  constructor(callback: IoCallback) {
    this.callback = callback;
    MockIntersectionObserver.latest = this;
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  emit(element: Element, isIntersecting: boolean): void {
    this.callback(
      [
        {
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: {} as DOMRectReadOnly,
          isIntersecting,
          rootBounds: null,
          target: element,
          time: 0,
        },
      ],
      this
    );
  }
}

const requireMockObserver = (): MockIntersectionObserver => {
  const observer = MockIntersectionObserver.latest;
  if (!observer) {
    throw new Error("IntersectionObserver mock not installed");
  }
  return observer;
};

const flushFrames = async (count = 2): Promise<void> => {
  for (let index = 0; index < count; index++) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  }
};

const readClipPath = (element: HTMLElement): string =>
  element.style.getPropertyValue("clip-path") ||
  element.style.getPropertyValue("-webkit-clip-path");

const waitForClipPath = async (element: HTMLElement): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt++) {
    await flushFrames(1);
    const clip = readClipPath(element);
    if (clip) {
      return clip;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error("clip-path was not applied");
};

describe("engine corner-scale lifecycle", () => {
  let engine: Engine;
  let offsetDescriptor: PropertyDescriptor | undefined;
  let originalIntersectionObserver: typeof IntersectionObserver | undefined;

  const mockLayoutDimensions = (): void => {
    offsetDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth"
    );
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: {
        configurable: true,
        get() {
          return 80;
        },
      },
      offsetHeight: {
        configurable: true,
        get() {
          return 80;
        },
      },
    });
  };

  const restoreLayoutDimensions = (): void => {
    if (offsetDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "offsetWidth",
        offsetDescriptor
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    }
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  };

  beforeEach(async () => {
    originalIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    MockIntersectionObserver.latest = undefined;

    document.head.innerHTML = `
      <style>
        :root {
          ${CORNER_SCALE_VAR}: 0.6;
        }
        .squircle {
          display: block;
          width: 80px;
          height: 80px;
          background-color: rgb(200, 200, 200);
          border-radius: 20px;
        }
      </style>
    `;
    document.body.innerHTML =
      '<div class="squircle" data-corner-shape="squircle" style="display:block;width:80px;height:80px;--corner-shape:squircle"></div>';

    mockLayoutDimensions();

    engine = createEngine(document, { pendingRadiusScale: 0.6 });

    const element = document.querySelector<HTMLElement>(".squircle");
    if (!element) {
      throw new Error("test element not found");
    }
    await flushFrames();
    requireMockObserver().emit(element, true);
    await waitForClipPath(element);
  });

  afterEach(() => {
    engine?.destroy();
    restoreLayoutDimensions();
    document.body.replaceChildren();
    document.head.replaceChildren();
    if (originalIntersectionObserver) {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    } else {
      Reflect.deleteProperty(globalThis, "IntersectionObserver");
    }
  });

  it("sets --corner-scale: 1 when --corner-shape is removed", async () => {
    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    element?.style.removeProperty("--corner-shape");
    element?.removeAttribute("data-corner-shape");
    await flushFrames();

    expect(element?.style.getPropertyValue(CORNER_SCALE_VAR)).toBe("1");
    expect(readClipPath(element as HTMLElement)).toBe("");
  });

  it("removes inline --corner-scale when shape is re-enabled", async () => {
    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    element?.style.removeProperty("--corner-shape");
    element?.removeAttribute("data-corner-shape");
    await flushFrames();
    expect(element?.style.getPropertyValue(CORNER_SCALE_VAR)).toBe("1");

    element?.style.setProperty("--corner-shape", "squircle");
    element?.setAttribute("data-corner-shape", "squircle");
    requireMockObserver().emit(element as HTMLElement, true);
    await waitForClipPath(element as HTMLElement);

    expect(element?.style.getPropertyValue(CORNER_SCALE_VAR)).toBe("");
    expect(readClipPath(element as HTMLElement)).not.toBe("");
  });

  it("sets --corner-scale: 1 on destroy for tracked elements", async () => {
    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    engine.destroy();
    await flushFrames();

    expect(element?.style.getPropertyValue(CORNER_SCALE_VAR)).toBe("1");
    expect(readClipPath(element as HTMLElement)).toBe("");
  });
});
