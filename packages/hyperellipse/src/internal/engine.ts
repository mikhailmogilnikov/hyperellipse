import { buildPendingCss, createManagedSheet } from "./pending";
import {
  CLEAR_TARGET,
  computeTarget,
  HOST_ATTR,
  PSEUDO_BASE_CSS,
  type RenderTarget,
  readSource,
  type SourceStyles,
} from "./render";
import { CORNER_SCALE_VAR, scanDocument } from "./scan";

export interface EngineOptions {
  pendingRadiusScale: number;
  selector?: string;
}

export interface Engine {
  destroy: () => void;
  refresh: () => void;
}

/** Default discovery selectors beyond CSSOM-scanned rules. */
const BASE_SELECTORS = ["[data-corner-shape]", '[style*="--corner-shape"]'];

interface Entry {
  /** Last applied inline styles — needed to restore paint while a new SVG decodes. */
  applied: Record<string, string>;
  hostAttr: string;
  key: string;
  /** Monotonic token: invalidates pending async (decode) applies superseded by newer state. */
  seq: number;
  /** Snapshot of the `style` attribute after our write — distinguishes our mutations from author/React updates. */
  snapshot: string;
  source: SourceStyles | null;
}

const createEntry = (): Entry => ({
  source: null,
  key: "",
  applied: {},
  seq: 0,
  snapshot: "",
  hostAttr: "",
});

/** Upper bound for the decoded-URI memo before it resets. */
const DECODED_CACHE_LIMIT = 256;

/**
 * Inline props that hide native paint replaced by SVG layers. Applied
 * synchronously before async image decode so author `border` / `outline` /
 * `box-shadow` updates do not flash for a frame.
 */
const NATIVE_SUPPRESSIONS = [
  "border-color",
  "outline-color",
  "box-shadow",
] as const;

const isValidSelector = (doc: Document, selector: string): boolean => {
  try {
    doc.querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

const isStyleNode = (node: Node): boolean =>
  node instanceof Element &&
  (node.tagName === "STYLE" || node.tagName === "LINK");

/**
 * Fallback engine: discovers elements, observes DOM/size changes, batches
 * read/write phases per animation frame, and applies inline fallback styles.
 */
export const createEngine = (doc: Document, options: EngineOptions): Engine => {
  const entries = new WeakMap<HTMLElement, Entry>();
  const tracked = new Set<HTMLElement>();
  const dirty = new Set<HTMLElement>();
  /** Data URIs already decoded by the browser — safe to apply synchronously. */
  const decodedImages = new Set<string>();

  let selectorString = BASE_SELECTORS.join(", ");
  let flushScheduled = false;
  let rescanScheduled = false;
  let rafId = 0;
  let destroyed = false;

  const pendingSheet = createManagedSheet(doc, "pending");
  const baseSheet = createManagedSheet(doc, "base");
  baseSheet.update(PSEUDO_BASE_CSS);
  // Enabled only during the read phase: neutralizes SSR radius reduction
  // (`--corner-scale` from the `@supports` snippet) so geometry uses the
  // full radius. `!important` also wins over scoped declarations on ancestors.
  const readSheet = createManagedSheet(doc, "read");
  readSheet.update(`*{${CORNER_SCALE_VAR}:1 !important;}`);
  readSheet.setDisabled(true);

  const resizeObserver = new ResizeObserver((roEntries) => {
    for (const roEntry of roEntries) {
      const element = roEntry.target;
      if (!(element instanceof HTMLElement && tracked.has(element))) {
        continue;
      }
      const entry = entries.get(element);
      if (entry?.source) {
        // Size-only change — reuse cached source and apply right away:
        // ResizeObserver fires after layout but before paint, so synchronous
        // writes land in the same frame (no one-frame corner lag).
        handleResize(element, entry);
      } else {
        dirty.add(element);
        scheduleFlush();
      }
    }
  });

  const scheduleFlush = (): void => {
    if (flushScheduled || destroyed) {
      return;
    }
    flushScheduled = true;
    rafId = requestAnimationFrame(flush);
  };

  const markDirty = (element: HTMLElement): void => {
    dirty.add(element);
    scheduleFlush();
  };

  const track = (element: Element): void => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (!tracked.has(element)) {
      tracked.add(element);
      entries.set(element, entries.get(element) ?? createEntry());
      resizeObserver.observe(element);
    }
    markDirty(element);
  };

  const untrack = (element: HTMLElement): void => {
    tracked.delete(element);
    dirty.delete(element);
    resizeObserver.unobserve(element);
  };

  const trackQueryResults = (root: ParentNode): void => {
    for (const element of root.querySelectorAll(selectorString)) {
      track(element);
    }
  };

  const refreshAll = (): void => {
    for (const element of tracked) {
      dirty.add(element);
    }
    scheduleFlush();
  };

  /** Removes our inline props from the DOM without resetting entry bookkeeping. */
  const removeApplied = (element: HTMLElement, entry: Entry): void => {
    for (const prop of Object.keys(entry.applied)) {
      element.style.removeProperty(prop);
    }
  };

  /** Re-applies the last target so the old paint persists while a new SVG decodes. */
  const restoreApplied = (element: HTMLElement, entry: Entry): void => {
    for (const [prop, value] of Object.entries(entry.applied)) {
      element.style.setProperty(prop, value);
    }
    entry.snapshot = element.getAttribute("style") ?? "";
  };

  const clearOwned = (element: HTMLElement, entry: Entry): void => {
    entry.seq += 1;
    removeApplied(element, entry);
    if (entry.hostAttr) {
      element.removeAttribute(HOST_ATTR);
    }
    entry.applied = {};
    entry.key = "";
    entry.hostAttr = "";
  };

  /** Hides native border/outline/shadow while SVG data URIs decode. */
  const applyNativeSuppressions = (
    element: HTMLElement,
    entry: Entry,
    target: RenderTarget
  ): void => {
    if (target === CLEAR_TARGET) {
      return;
    }
    let changed = false;
    for (const prop of NATIVE_SUPPRESSIONS) {
      const value = target.styles[prop];
      if (value !== undefined && entry.applied[prop] !== value) {
        element.style.setProperty(prop, value);
        entry.applied[prop] = value;
        changed = true;
      }
    }
    if (changed) {
      entry.snapshot = element.getAttribute("style") ?? "";
    }
  };

  const applyTarget = (
    element: HTMLElement,
    entry: Entry,
    target: RenderTarget
  ): void => {
    entry.seq += 1;
    if (target === CLEAR_TARGET) {
      clearOwned(element, entry);
      entry.snapshot = element.getAttribute("style") ?? "";
      return;
    }
    if (target.key === entry.key) {
      return;
    }
    for (const prop of Object.keys(entry.applied)) {
      if (!(prop in target.styles)) {
        element.style.removeProperty(prop);
      }
    }
    for (const [prop, value] of Object.entries(target.styles)) {
      element.style.setProperty(prop, value);
    }
    const hostChanging = target.hostAttr !== entry.hostAttr;
    if (hostChanging) {
      // Custom properties must resolve on the host before `::before` /
      // `::after` activate — otherwise inset/image vars fall back to 0 /
      // none for one frame and outline corners paint outside the box.
      if (target.hostAttr) {
        element.getBoundingClientRect();
        element.setAttribute(HOST_ATTR, target.hostAttr);
      } else {
        element.removeAttribute(HOST_ATTR);
      }
    }
    entry.applied = { ...target.styles };
    entry.key = target.key;
    entry.hostAttr = target.hostAttr;
    entry.snapshot = element.getAttribute("style") ?? "";
  };

  const rememberDecoded = (uris: string[]): void => {
    if (decodedImages.size >= DECODED_CACHE_LIMIT) {
      decodedImages.clear();
    }
    for (const uri of uris) {
      decodedImages.add(uri);
    }
  };

  /** Loads + decodes data URIs off-DOM so the later CSS swap hits the image cache. */
  const decodeImages = (uris: string[]): Promise<void> => {
    const jobs = uris.map((uri) => {
      const image = doc.createElement("img");
      image.src = uri;
      return image.decode();
    });
    return Promise.allSettled(jobs).then(() => {
      rememberDecoded(uris);
    });
  };

  /**
   * Applies a target, pre-decoding its SVG images first. Swapping a
   * `background-image` to a not-yet-decoded data URI paints a blank frame
   * (visible as flicker during resize); decoding up front keeps the previous
   * paint on screen until the new image is ready.
   */
  const scheduleApply = (
    element: HTMLElement,
    entry: Entry,
    target: RenderTarget
  ): void => {
    if (target !== CLEAR_TARGET && target.key === entry.key) {
      return;
    }
    const pending = target.images.filter((uri) => !decodedImages.has(uri));
    if (target !== CLEAR_TARGET && pending.length > 0) {
      applyNativeSuppressions(element, entry, target);
    }
    if (target === CLEAR_TARGET || pending.length === 0) {
      applyTarget(element, entry, target);
      return;
    }
    entry.seq += 1;
    const seq = entry.seq;
    decodeImages(pending).then(() => {
      const stale =
        destroyed ||
        entry.seq !== seq ||
        !element.isConnected ||
        !tracked.has(element);
      if (!stale) {
        applyTarget(element, entry, target);
      }
    });
  };

  const handleResize = (element: HTMLElement, entry: Entry): void => {
    if (dirty.has(element) || !entry.source) {
      return;
    }
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (!(width && height)) {
      return;
    }
    scheduleApply(element, entry, computeTarget(entry.source, width, height));
  };

  const collectDirty = (): HTMLElement[] => {
    const dirtyList: HTMLElement[] = [];
    for (const element of dirty) {
      if (element.isConnected) {
        dirtyList.push(element);
      } else {
        untrack(element);
      }
    }
    dirty.clear();
    return dirtyList;
  };

  /**
   * Temporarily removes our inline overrides, re-reads original computed
   * values with the pending sheet disabled (so the full radius is visible),
   * then restores the previous overrides. The remove/restore round-trip stays
   * within one rAF callback, so the intermediate state never paints — and the
   * old visuals keep rendering while the new SVG decodes asynchronously.
   */
  const readDirtySources = (dirtyList: HTMLElement[]): void => {
    if (dirtyList.length === 0) {
      return;
    }
    pendingSheet.setDisabled(true);
    readSheet.setDisabled(false);
    for (const element of dirtyList) {
      const entry = entries.get(element);
      if (entry) {
        removeApplied(element, entry);
      }
    }
    for (const element of dirtyList) {
      const entry = entries.get(element);
      if (entry) {
        entry.source = readSource(element);
      }
    }
    for (const element of dirtyList) {
      const entry = entries.get(element);
      if (entry) {
        restoreApplied(element, entry);
      }
    }
    readSheet.setDisabled(true);
    pendingSheet.setDisabled(false);
  };

  /**
   * Flush phases: remove overrides + disable pending sheet → all reads →
   * restore + re-enable sheets → all writes. Layout is touched at most twice
   * per batch.
   */
  const flush = (): void => {
    flushScheduled = false;
    if (destroyed) {
      return;
    }
    if (rescanScheduled) {
      rescanScheduled = false;
      rescan();
    }

    const dirtyList = collectDirty();
    if (dirtyList.length === 0) {
      return;
    }

    readDirtySources(dirtyList);
    for (const element of dirtyList) {
      const entry = entries.get(element);
      if (!entry) {
        continue;
      }
      if (!entry.source) {
        clearOwned(element, entry);
        entry.snapshot = element.getAttribute("style") ?? "";
        continue;
      }
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (!(width && height)) {
        continue;
      }
      scheduleApply(element, entry, computeTarget(entry.source, width, height));
    }
  };

  const rescan = (): void => {
    const result = scanDocument(doc);
    const selectors = [...BASE_SELECTORS, ...result.selectors];
    if (options.selector) {
      selectors.push(options.selector);
    }
    selectorString = selectors
      .filter((selector) => isValidSelector(doc, selector))
      .join(", ");
    pendingSheet.update(
      buildPendingCss(result.pendingRules, options.pendingRadiusScale)
    );
    pendingSheet.bump();
    trackQueryResults(doc);
    refreshAll();
  };

  const scheduleRescan = (): void => {
    rescanScheduled = true;
    scheduleFlush();
  };

  const handleChildList = (record: MutationRecord): void => {
    for (const node of record.addedNodes) {
      if (isStyleNode(node)) {
        scheduleRescan();
      }
      if (node instanceof Element) {
        if (node instanceof HTMLElement && node.matches(selectorString)) {
          track(node);
        }
        trackQueryResults(node);
      }
    }
    for (const node of record.removedNodes) {
      if (isStyleNode(node)) {
        scheduleRescan();
      }
    }
  };

  const handleAttributeMutation = (record: MutationRecord): void => {
    const element = record.target;
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (element === doc.documentElement || element === doc.body) {
      // Root class/data change (theme toggle) — colors may have changed.
      refreshAll();
      return;
    }
    if (tracked.has(element)) {
      const entry = entries.get(element);
      if (
        record.attributeName === "style" &&
        (element.getAttribute("style") ?? "") === entry?.snapshot
      ) {
        // Our own style write — ignore to avoid feedback loops.
        return;
      }
      markDirty(element);
    } else if (element.matches(selectorString)) {
      track(element);
    }
    // Container class/style may have changed inherited custom properties on descendants.
    for (const descendant of element.querySelectorAll(selectorString)) {
      if (descendant instanceof HTMLElement && tracked.has(descendant)) {
        markDirty(descendant);
      }
    }
  };

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        handleChildList(record);
      } else {
        handleAttributeMutation(record);
      }
    }
  });

  const handleTransitionEnd = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLElement && tracked.has(target)) {
      markDirty(target);
    }
  };

  const handleFocusChange = (event: FocusEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement && tracked.has(target)) {
      markDirty(target);
    }
  };

  const handlePageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      refreshAll();
    }
  };

  const handleLoad = (): void => {
    scheduleRescan();
  };

  const colorScheme = doc.defaultView?.matchMedia?.(
    "(prefers-color-scheme: dark)"
  );
  const handleColorScheme = (): void => {
    refreshAll();
  };

  const start = (): void => {
    if (destroyed) {
      return;
    }
    rescan();
    mutationObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-corner-shape"],
    });
    doc.addEventListener("transitionend", handleTransitionEnd, true);
    doc.addEventListener("animationend", handleTransitionEnd, true);
    doc.addEventListener("focusin", handleFocusChange, true);
    doc.addEventListener("focusout", handleFocusChange, true);
    doc.defaultView?.addEventListener("pageshow", handlePageShow);
    doc.defaultView?.addEventListener("load", handleLoad);
    colorScheme?.addEventListener?.("change", handleColorScheme);
  };

  if (doc.body) {
    start();
  } else {
    doc.addEventListener("DOMContentLoaded", start, { once: true });
  }

  return {
    refresh: () => {
      scheduleRescan();
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      cancelAnimationFrame(rafId);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      doc.removeEventListener("transitionend", handleTransitionEnd, true);
      doc.removeEventListener("animationend", handleTransitionEnd, true);
      doc.removeEventListener("focusin", handleFocusChange, true);
      doc.removeEventListener("focusout", handleFocusChange, true);
      doc.defaultView?.removeEventListener("pageshow", handlePageShow);
      doc.defaultView?.removeEventListener("load", handleLoad);
      colorScheme?.removeEventListener?.("change", handleColorScheme);
      for (const element of tracked) {
        const entry = entries.get(element);
        if (entry) {
          clearOwned(element, entry);
        }
      }
      tracked.clear();
      dirty.clear();
      decodedImages.clear();
      pendingSheet.remove();
      baseSheet.remove();
      readSheet.remove();
    },
  };
};
