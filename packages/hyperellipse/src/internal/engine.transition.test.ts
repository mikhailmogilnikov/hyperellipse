import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine, type Engine } from "./engine";

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

const radiusLonghands = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
] as const;

const withRadius = (
  style: CSSStyleDeclaration,
  radius: string
): CSSStyleDeclaration => {
  const getPropertyValue = (property: string): string => {
    if (
      property === "border-radius" ||
      (radiusLonghands as readonly string[]).includes(property)
    ) {
      return radius;
    }
    return style.getPropertyValue(property);
  };

  return new Proxy(style, {
    get(target, property, receiver) {
      if (property === "getPropertyValue") {
        return getPropertyValue;
      }
      if (property === "borderTopLeftRadius") {
        return radius;
      }
      if (property === "borderTopRightRadius") {
        return radius;
      }
      if (property === "borderBottomRightRadius") {
        return radius;
      }
      if (property === "borderBottomLeftRadius") {
        return radius;
      }
      return Reflect.get(target, property, receiver);
    },
  });
};

const dispatchTransition = (
  element: HTMLElement,
  type: "transitionrun" | "transitionend"
): void => {
  element.dispatchEvent(new TransitionEvent(type, { bubbles: true }));
};

describe("engine transition lifecycle", () => {
  let engine: Engine;
  let offsetDescriptor: PropertyDescriptor | undefined;
  let activeRadius = "20px";
  let getComputedStyleSpy: ReturnType<typeof vi.spyOn> | undefined;

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

  const installRadiusStyleMock = (): void => {
    const view = document.defaultView;
    if (!view) {
      throw new Error("window is unavailable");
    }
    const original = view.getComputedStyle.bind(view);
    getComputedStyleSpy = vi
      .spyOn(view, "getComputedStyle")
      .mockImplementation((element, pseudo) => {
        const style = original(element, pseudo);
        if (!(element instanceof HTMLElement)) {
          return style;
        }
        if (element.classList.contains("squircle")) {
          return withRadius(style, activeRadius);
        }
        return style;
      });
  };

  beforeEach(async () => {
    document.head.innerHTML = `
      <style>
        .squircle {
          display: block;
          width: 80px;
          height: 80px;
          background-color: rgb(200, 200, 200);
          border-radius: 20px;
          --corner-shape: squircle;
          transition: border-radius 0.2s ease;
        }
      </style>
    `;
    document.body.innerHTML =
      '<div class="squircle" data-corner-shape="squircle" style="display:block;width:80px;height:80px"></div>';

    activeRadius = "20px";
    mockLayoutDimensions();
    installRadiusStyleMock();

    engine = createEngine(document, { pendingRadiusScale: 0.6 });
    await flushFrames();
  });

  afterEach(() => {
    engine?.destroy();
    getComputedStyleSpy?.mockRestore();
    restoreLayoutDimensions();
    activeRadius = "20px";
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  it("recomputes clip-path on transitionrun", async () => {
    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    const before = await waitForClipPath(element as HTMLElement);

    activeRadius = "32px";
    dispatchTransition(element as HTMLElement, "transitionrun");
    await flushFrames();

    expect(readClipPath(element as HTMLElement)).not.toBe(before);
  });

  it("recomputes clip-path on transitionend", async () => {
    const element = document.querySelector<HTMLElement>(".squircle");
    expect(element).not.toBeNull();

    const before = await waitForClipPath(element as HTMLElement);

    activeRadius = "32px";
    dispatchTransition(element as HTMLElement, "transitionend");
    await flushFrames();

    expect(readClipPath(element as HTMLElement)).not.toBe(before);
  });

  it("ignores transitionrun on untracked elements", async () => {
    document.body.innerHTML =
      '<div class="plain" style="display:block;width:80px;height:80px"></div>';

    engine.destroy();
    engine = createEngine(document, { pendingRadiusScale: 0.6 });
    await flushFrames();

    const element = document.querySelector<HTMLElement>(".plain");
    expect(element).not.toBeNull();

    expect(() => {
      dispatchTransition(element as HTMLElement, "transitionrun");
    }).not.toThrow();
  });
});
