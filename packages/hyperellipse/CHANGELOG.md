# hyperellipse

## 1.0.5

### Patch Changes

- Set inline `--corner-scale: 1` when `--corner-shape` is removed at runtime so round mode matches Chrome in Safari and Firefox instead of staying at the SSR pending ×0.6.

## 1.0.4

### Patch Changes

- Observe `:hover` in the Safari / Firefox fallback via `mouseenter` / `mouseleave` on tracked elements and their ancestors.
- Listen for `transitionrun` and `transitionend` on tracked elements so CSS transitions on shaped properties update at the start and end of the animation.
- Skip off-screen elements via a shared `IntersectionObserver` until they enter the viewport; pending updates flush on scroll-in.

## 1.0.3

### Patch Changes

- Suppress native `border-color`, `outline-color`, and `box-shadow` synchronously while SVG data URIs decode so author style updates do not flash for a frame. Force layout before activating pseudo-layer host attributes so custom-property insets resolve before `::before`/`::after` paint, fixing one-frame outline corners outside the box.

## 1.0.2

### Patch Changes

- Implement curve-aligned offset contours per css-borders-4 §3.9.4. Border rings now use a filled band between outer and inner contours instead of a centered stroke, fixing inward bleed on concave corners (scoop, notch). Outlines render via outward dilation masks with miter joins, matching native sharp concave-corner miters and eliminating seams where the outline touches the border.

## 1.0.1

### Patch Changes

- Fix border, outline, and shadow rendering with curve-following corner offsets per css-borders-4 §3.9.4. Pre-decode SVG data URIs and apply resize updates synchronously to eliminate flicker and one-frame corner lag. Compensate layer/outline pseudo-element insets for border width and hide outline seam artifacts when the outline touches the border.

## 1.0.0

### Major Changes

- 224c49d: Initial public release of the CSS `corner-shape` polyfill with native bridge, SSR-friendly `--corner-scale` snippet, and spec-aligned fallback rendering.
