import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "./engine";

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

describe("engine intersection observer", () => {
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

  beforeEach(() => {
    originalIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    MockIntersectionObserver.latest = undefined;
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

  it("defers work while off-screen and applies on enter", async () => {
    document.head.innerHTML = `
      <style>
        .squircle {
          display: block;
          width: 80px;
          height: 80px;
          background-color: rgb(200, 200, 200);
          border-radius: 20px;
          --corner-shape: squircle;
        }
      </style>
    `;
    document.body.innerHTML =
      '<div class="squircle" data-corner-shape="squircle" style="display:block;width:80px;height:80px"></div>';

    mockLayoutDimensions();
    engine = createEngine(document, { pendingRadiusScale: 0.6 });

    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    const observer = MockIntersectionObserver.latest;
    expect(observer).toBeDefined();
    observer?.emit(element as HTMLElement, false);
    await flushFrames();

    expect(readClipPath(element as HTMLElement)).toBe("");

    observer?.emit(element as HTMLElement, true);
    const clip = await waitForClipPath(element as HTMLElement);
    expect(clip).not.toBe("");
  });

  it("queues pending dirty work until the element re-enters the viewport", async () => {
    document.head.innerHTML = `
      <style>
        .squircle {
          display: block;
          width: 80px;
          height: 80px;
          background-color: rgb(200, 200, 200);
          border-radius: 20px;
          --corner-shape: squircle;
        }
        .squircle.is-wide {
          border-radius: 32px;
        }
      </style>
    `;
    document.body.innerHTML =
      '<div class="squircle" data-corner-shape="squircle" style="display:block;width:80px;height:80px"></div>';

    mockLayoutDimensions();
    engine = createEngine(document, { pendingRadiusScale: 0.6 });
    await flushFrames();

    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    const observer = MockIntersectionObserver.latest;
    expect(observer).toBeDefined();

    const before = await waitForClipPath(element as HTMLElement);

    observer?.emit(element as HTMLElement, false);
    await flushFrames();

    element?.classList.add("is-wide");
    engine.refresh();
    await flushFrames();

    expect(readClipPath(element as HTMLElement)).toBe(before);

    observer?.emit(element as HTMLElement, true);
    await flushFrames();

    expect(readClipPath(element as HTMLElement)).not.toBe(before);
  });
});
