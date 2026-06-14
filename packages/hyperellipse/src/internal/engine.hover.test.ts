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

const dispatchPointerBoundary = (
  element: HTMLElement,
  type: "mouseenter" | "mouseleave"
): void => {
  element.dispatchEvent(
    new MouseEvent(type, { bubbles: type === "mouseenter", cancelable: true })
  );
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

const withHoverRadius = (
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

describe("engine hover", () => {
  let engine: Engine;
  let offsetDescriptor: PropertyDescriptor | undefined;
  let directHoverActive = false;
  let parentHoverActive = false;
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

  const installHoverStyleMock = (): void => {
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
        if (directHoverActive && element.classList.contains("squircle")) {
          return withHoverRadius(style, "32px");
        }
        if (
          parentHoverActive &&
          element.classList.contains("squircle") &&
          element.closest(".wrap")
        ) {
          return withHoverRadius(style, "32px");
        }
        return style;
      });
  };

  afterEach(() => {
    engine?.destroy();
    getComputedStyleSpy?.mockRestore();
    restoreLayoutDimensions();
    directHoverActive = false;
    parentHoverActive = false;
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  describe("direct :hover", () => {
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
          }
          .squircle:hover {
            border-radius: 32px;
          }
        </style>
      `;
      document.body.innerHTML =
        '<div class="squircle" data-corner-shape="squircle" style="display:block;width:80px;height:80px"></div>';

      mockLayoutDimensions();
      installHoverStyleMock();

      engine = createEngine(document, { pendingRadiusScale: 0.6 });
      await flushFrames();
    });

    it("recomputes clip-path on mouseenter", async () => {
      const element = document.querySelector<HTMLElement>(".squircle");
      expect(element).not.toBeNull();

      const before = await waitForClipPath(element as HTMLElement);

      directHoverActive = true;
      dispatchPointerBoundary(element as HTMLElement, "mouseenter");
      await flushFrames();

      expect(readClipPath(element as HTMLElement)).not.toBe(before);
    });

    it("restores clip-path on mouseleave", async () => {
      const element = document.querySelector<HTMLElement>(".squircle");
      expect(element).not.toBeNull();

      const before = await waitForClipPath(element as HTMLElement);

      directHoverActive = true;
      dispatchPointerBoundary(element as HTMLElement, "mouseenter");
      await flushFrames();
      expect(readClipPath(element as HTMLElement)).not.toBe(before);

      directHoverActive = false;
      dispatchPointerBoundary(element as HTMLElement, "mouseleave");
      await flushFrames();
      expect(readClipPath(element as HTMLElement)).toBe(before);
    });
  });

  describe("parent :hover", () => {
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
          }
          .wrap:hover .squircle {
            border-radius: 32px;
          }
        </style>
      `;
      document.body.innerHTML = `
        <div class="wrap" style="display:block;width:120px;height:120px">
          <div class="squircle" data-corner-shape="squircle" style="display:block;width:80px;height:80px"></div>
        </div>
      `;

      mockLayoutDimensions();
      installHoverStyleMock();

      engine = createEngine(document, { pendingRadiusScale: 0.6 });
      await flushFrames();
    });

    it("recomputes the child when the parent is hovered", async () => {
      const wrap = document.querySelector<HTMLElement>(".wrap");
      const element = document.querySelector<HTMLElement>(".squircle");
      expect(wrap).not.toBeNull();
      expect(element).not.toBeNull();

      const before = await waitForClipPath(element as HTMLElement);

      parentHoverActive = true;
      dispatchPointerBoundary(wrap as HTMLElement, "mouseenter");
      await flushFrames();

      expect(readClipPath(element as HTMLElement)).not.toBe(before);
    });
  });
});
