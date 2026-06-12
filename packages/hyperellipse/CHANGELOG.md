# hyperellipse

## 1.0.1

### Patch Changes

- Fix border, outline, and shadow rendering with curve-following corner offsets per css-borders-4 §3.9.4. Pre-decode SVG data URIs and apply resize updates synchronously to eliminate flicker and one-frame corner lag. Compensate layer/outline pseudo-element insets for border width and hide outline seam artifacts when the outline touches the border.

## 1.0.0

### Major Changes

- 224c49d: Initial public release of the CSS `corner-shape` polyfill with native bridge, SSR-friendly `--corner-scale` snippet, and spec-aligned fallback rendering.
