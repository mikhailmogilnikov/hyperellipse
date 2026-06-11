/**
 * Squircle fallback для браузеров без CSS Paint API (Safari, Firefox).
 *
 * Вместо canvas-полифилла (который на iOS опирался на удалённый из WebKit
 * -webkit-canvas() и деградировал до растровых data:URL-масок) рисует ту же
 * геометрию, что и /scripts/squircle.min.js, но чистым CSS:
 *   - .squircle         → inline `clip-path: path("…")`
 *   - .squircle-outline → inline SVG data-URI фон (stroke)
 *   - .squircle-shadow  → inline SVG data-URI фон (fill, drop-shadow следует альфе)
 *
 * Чистая геометрия не инвалидируется iOS при сворачивании вкладки/bfcache,
 * применяется синхронно (без мигания) и остаётся векторной на любом DPR.
 */
/** biome-ignore-all lint/style/useNumberNamespace: <> */
/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: <> */

(() => {
  if (globalThis.__squircleFallbackStarted) {
    return;
  }
  globalThis.__squircleFallbackStarted = true;

  const SELECTOR = ".squircle, .squircle-outline, .squircle-shadow";
  // Коэффициенты идентичны squircle.min.js — визуальный паритет с native paint().
  const DISTANCE_RATIO = 1.8;
  const SMOOTH_RATIO = 10;
  const DEFAULT_SMOOTH = 0.85;
  const DEFAULT_RADIUS = 8;

  const TEST_PATH = 'path("M 0 0 L 1 0 L 1 1 Z")';
  const supportsClipPath =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    (CSS.supports("clip-path", TEST_PATH) ||
      CSS.supports("-webkit-clip-path", TEST_PATH));

  /** element → { key: string, owned: string[] } — что мы применили инлайном */
  const applied = new WeakMap();
  const tracked = new WeakSet();
  const pending = new Set();
  let flushScheduled = false;

  const fmt = (n) => String(Math.round(n * 100) / 100);

  /**
   * Контур повторяет drawSquircle из squircle.min.js
   * (offset = lineWidth / 2 для stroke-вариантов, 0 для заливки/клипа).
   */
  function buildPath(w, h, r, s, o) {
    return [
      `M ${fmt(r[0])} ${fmt(o)}`,
      `L ${fmt(w - r[1])} ${fmt(o)}`,
      `C ${fmt(w - r[1] / s)} ${fmt(o)} ${fmt(w - o)} ${fmt(r[1] / s)} ${fmt(w - o)} ${fmt(r[1])}`,
      `L ${fmt(w - o)} ${fmt(h - r[2])}`,
      `C ${fmt(w - o)} ${fmt(h - r[2] / s)} ${fmt(w - r[2] / s)} ${fmt(h - o)} ${fmt(w - r[2])} ${fmt(h - o)}`,
      `L ${fmt(r[3])} ${fmt(h - o)}`,
      `C ${fmt(r[3] / s)} ${fmt(h - o)} ${fmt(o)} ${fmt(h - r[3] / s)} ${fmt(o)} ${fmt(h - r[3])}`,
      `L ${fmt(o)} ${fmt(r[0])}`,
      `C ${fmt(o)} ${fmt(r[0] / s)} ${fmt(r[0] / s)} ${fmt(o)} ${fmt(r[0])} ${fmt(o)}`,
      "Z",
    ].join(" ");
  }

  function readVar(cs, names) {
    for (const name of names) {
      const value = cs.getPropertyValue(name).trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function parseRadii(cs, w, h) {
    const corners = [
      "--squircle-radius-top-left",
      "--squircle-radius-top-right",
      "--squircle-radius-bottom-right",
      "--squircle-radius-bottom-left",
    ].map((prop) => {
      const value = cs.getPropertyValue(prop).trim();
      return value ? parseFloat(value) * DISTANCE_RATIO : NaN;
    });

    let shorthand = null;
    if (corners.some(Number.isNaN)) {
      const raw = readVar(cs, ["--squircle-radius", "--radius"]);
      const matches = raw ? raw.match(/\d*\.?\d+/g) : null;
      if (matches) {
        let list = matches.map((v) => parseFloat(v) * DISTANCE_RATIO);
        if (list.length === 1) {
          list = [list[0], list[0], list[0], list[0]];
        } else if (list.length === 2) {
          list = [list[0], list[1], list[0], list[1]];
        } else if (list.length === 3) {
          list = [list[0], list[1], list[2], list[1]];
        }
        shorthand = list;
      } else {
        const fallback = corners.every(Number.isNaN)
          ? DEFAULT_RADIUS * DISTANCE_RATIO
          : 0;
        shorthand = [fallback, fallback, fallback, fallback];
      }
    }

    let radii = corners.map((v, i) => (Number.isNaN(v) ? shorthand[i] : v));

    const maxRadius = Math.max(radii[0], radii[1], radii[2], radii[3]);
    if (maxRadius >= w / 2 || maxRadius >= h / 2) {
      const minRadius = Math.min(w / 2, h / 2);
      radii = [minRadius, minRadius, minRadius, minRadius];
    }
    return radii;
  }

  function parseSmooth(cs) {
    const raw = readVar(cs, ["--squircle-smooth", "--smooth"]);
    const value = raw ? parseFloat(raw) : DEFAULT_SMOOTH;
    if (Number.isNaN(value)) {
      return DEFAULT_SMOOTH * SMOOTH_RATIO;
    }
    if (value === 0) {
      return 1;
    }
    return value * SMOOTH_RATIO;
  }

  function getVariant(element) {
    const cl = element.classList;
    if (cl.contains("squircle-outline")) {
      return "outline";
    }
    if (cl.contains("squircle-shadow")) {
      return "shadow";
    }
    if (cl.contains("squircle")) {
      return "mask";
    }
    return null;
  }

  function isDisabled() {
    return (
      document.body &&
      document.body.getAttribute("data-border-smooth") === "false"
    );
  }

  const CLEAR = { clear: true };

  /** Фаза чтения: считает целевые инлайн-стили, ничего не пишет в DOM. */
  function computeTarget(element) {
    const variant = getVariant(element);
    if (!variant || isDisabled()) {
      return applied.has(element) ? CLEAR : null;
    }

    const w = element.offsetWidth;
    const h = element.offsetHeight;
    if (!(w && h)) {
      return null;
    }

    const cs = getComputedStyle(element);
    const radii = parseRadii(cs, w, h);
    const smooth = parseSmooth(cs);

    if (variant === "mask") {
      if (!supportsClipPath) {
        return null;
      }
      const d = buildPath(w, h, radii, smooth, 0);
      const clip = `path("${d}")`;
      return {
        key: `m|${clip}`,
        styles: {
          "clip-path": clip,
          "-webkit-clip-path": clip,
          "border-radius": "0",
        },
      };
    }

    const lineWidth =
      variant === "outline"
        ? parseFloat(readVar(cs, ["--squircle-outline", "--border-width"])) || 1
        : 0;
    const color =
      readVar(cs, ["--squircle-fill"]) ||
      readVar(cs, [variant === "outline" ? "--outline" : "--default"]) ||
      "#f45";
    const d = buildPath(w, h, radii, smooth, lineWidth / 2);
    const paint =
      variant === "outline"
        ? `fill:none;stroke:${color};stroke-width:${fmt(lineWidth)}`
        : `fill:${color}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" style="${paint}"/></svg>`;
    const background = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 100% 100% no-repeat`;

    const styles = {
      background,
      "border-radius": "0",
    };
    if (variant === "outline") {
      styles.border = "none";
    }
    return { key: `${variant}|${background}`, styles };
  }

  /** Фаза записи: применяет/снимает только наши инлайн-свойства. */
  function applyTarget(element, target) {
    const prev = applied.get(element);

    if (target.clear) {
      if (prev) {
        for (const prop of prev.owned) {
          element.style.removeProperty(prop);
        }
        applied.delete(element);
      }
      return;
    }

    if (prev && prev.key === target.key) {
      return;
    }

    const nextProps = Object.keys(target.styles);
    if (prev) {
      for (const prop of prev.owned) {
        if (!(prop in target.styles)) {
          element.style.removeProperty(prop);
        }
      }
    }
    for (const prop of nextProps) {
      element.style.setProperty(prop, target.styles[prop]);
    }
    applied.set(element, { key: target.key, owned: nextProps });
  }

  function flush() {
    flushScheduled = false;
    const elements = Array.from(pending);
    pending.clear();

    // Сначала все чтения (layout/computed style), затем все записи —
    // без чередования, чтобы не дёргать layout по кругу.
    const jobs = [];
    for (const element of elements) {
      if (!element.isConnected) {
        continue;
      }
      const target = computeTarget(element);
      if (target) {
        jobs.push([element, target]);
      }
    }
    for (const [element, target] of jobs) {
      applyTarget(element, target);
    }
  }

  function schedule(element) {
    pending.add(element);
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flush);
    }
  }

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      schedule(entry.target);
    }
  });

  function track(element) {
    if (!tracked.has(element)) {
      tracked.add(element);
      resizeObserver.observe(element);
    }
    schedule(element);
  }

  function refreshAll() {
    for (const element of document.querySelectorAll(SELECTOR)) {
      track(element);
    }
  }

  function handleAddedNode(node) {
    if (node.nodeType !== 1) {
      return;
    }
    if (node.matches?.(SELECTOR)) {
      track(node);
    }
    if (node.querySelectorAll) {
      for (const element of node.querySelectorAll(SELECTOR)) {
        track(element);
      }
    }
  }

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          handleAddedNode(node);
        }
        for (const node of record.removedNodes) {
          if (node.nodeType === 1 && tracked.has(node)) {
            resizeObserver.unobserve(node);
          }
        }
        continue;
      }

      // attributes
      const target = record.target;
      if (target === document.documentElement || target === document.body) {
        // Смена темы/класса dark/data-border-smooth — пересчитать всё.
        refreshAll();
        continue;
      }
      if (target.nodeType !== 1) {
        continue;
      }
      if (target.matches?.(SELECTOR)) {
        track(target);
      } else if (applied.has(target)) {
        // Класс squircle сняли — почистим инлайн-стили.
        schedule(target);
      }
      // Изменение style/class контейнера могло поменять CSS-переменные потомков.
      if (target.querySelectorAll) {
        for (const element of target.querySelectorAll(SELECTOR)) {
          schedule(element);
        }
      }
    }
  });

  function start() {
    refreshAll();
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-border-smooth"],
    });

    // Дешёвая страховка: после bfcache/смены системной темы кэш сам
    // отсеет элементы без изменений, лишних записей в DOM не будет.
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        refreshAll();
      }
    });
    const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    colorScheme?.addEventListener?.("change", refreshAll);
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
