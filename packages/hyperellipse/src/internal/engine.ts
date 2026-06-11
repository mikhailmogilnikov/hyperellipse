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
  hostAttr: string;
  key: string;
  owned: string[];
  /** Snapshot of the `style` attribute after our write — distinguishes our mutations from author/React updates. */
  snapshot: string;
  source: SourceStyles | null;
}

const createEntry = (): Entry => ({
  source: null,
  key: "",
  owned: [],
  snapshot: "",
  hostAttr: "",
});

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
  const resized = new Set<HTMLElement>();

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
      if (element instanceof HTMLElement && tracked.has(element)) {
        const entry = entries.get(element);
        if (entry?.source) {
          // Size-only change — reuse cached source, skip getComputedStyle.
          resized.add(element);
        } else {
          dirty.add(element);
        }
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
    resized.delete(element);
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

  const clearOwned = (element: HTMLElement, entry: Entry): void => {
    for (const prop of entry.owned) {
      element.style.removeProperty(prop);
    }
    if (entry.hostAttr) {
      element.removeAttribute(HOST_ATTR);
    }
    entry.owned = [];
    entry.key = "";
    entry.hostAttr = "";
  };

  const applyTarget = (
    element: HTMLElement,
    entry: Entry,
    target: RenderTarget
  ): void => {
    if (target === CLEAR_TARGET) {
      clearOwned(element, entry);
      entry.snapshot = element.getAttribute("style") ?? "";
      return;
    }
    if (target.key === entry.key) {
      return;
    }
    const nextProps = Object.keys(target.styles);
    for (const prop of entry.owned) {
      if (!(prop in target.styles)) {
        element.style.removeProperty(prop);
      }
    }
    for (const prop of nextProps) {
      element.style.setProperty(prop, target.styles[prop] ?? "");
    }
    if (target.hostAttr !== entry.hostAttr) {
      if (target.hostAttr) {
        element.setAttribute(HOST_ATTR, target.hostAttr);
      } else {
        element.removeAttribute(HOST_ATTR);
      }
    }
    entry.owned = nextProps;
    entry.key = target.key;
    entry.hostAttr = target.hostAttr;
    entry.snapshot = element.getAttribute("style") ?? "";
  };

  const collectBatch = (): {
    dirtyList: HTMLElement[];
    sizeList: HTMLElement[];
  } => {
    const dirtyList: HTMLElement[] = [];
    const sizeList: HTMLElement[] = [];
    for (const element of dirty) {
      if (element.isConnected) {
        dirtyList.push(element);
      } else {
        untrack(element);
      }
    }
    for (const element of resized) {
      if (!element.isConnected) {
        untrack(element);
        continue;
      }
      if (!dirty.has(element)) {
        sizeList.push(element);
      }
    }
    dirty.clear();
    resized.clear();
    return { dirtyList, sizeList };
  };

  /**
   * Clears our inline overrides and re-reads original computed values with the
   * pending sheet disabled (so the full radius is visible, not the reduced one).
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
        clearOwned(element, entry);
      }
    }
    for (const element of dirtyList) {
      const entry = entries.get(element);
      if (entry) {
        entry.source = readSource(element);
      }
    }
    readSheet.setDisabled(true);
    pendingSheet.setDisabled(false);
  };

  const computeJobs = (
    elementList: HTMLElement[]
  ): [HTMLElement, Entry, RenderTarget][] => {
    const jobs: [HTMLElement, Entry, RenderTarget][] = [];
    for (const element of elementList) {
      const entry = entries.get(element);
      if (!entry) {
        continue;
      }
      if (!entry.source) {
        entry.snapshot = element.getAttribute("style") ?? "";
        continue;
      }
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (!(width && height)) {
        continue;
      }
      jobs.push([element, entry, computeTarget(entry.source, width, height)]);
    }
    return jobs;
  };

  /**
   * Flush phases: clear dirty elements + disable pending sheet → all reads →
   * re-enable sheets → all writes. Layout is touched at most twice per batch.
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

    const { dirtyList, sizeList } = collectBatch();
    if (dirtyList.length === 0 && sizeList.length === 0) {
      return;
    }

    readDirtySources(dirtyList);
    const jobs = computeJobs([...dirtyList, ...sizeList]);
    for (const [element, entry, target] of jobs) {
      applyTarget(element, entry, target);
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
      resized.clear();
      pendingSheet.remove();
      baseSheet.remove();
      readSheet.remove();
    },
  };
};
