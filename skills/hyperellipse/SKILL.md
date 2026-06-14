---
name: hyperellipse
description: >-
  Integrates the hyperellipse CSS corner-shape polyfill (squircles, superellipses,
  scoops, notches). Use when the user asks for squircles, corner-shape, superellipse,
  Safari/Firefox rounded corners, or mentions the hyperellipse npm package.
metadata:
  author: mikhailmogilnikov
  version: "1.0.0"
---

# hyperellipse

Transparent polyfill for CSS [`corner-shape`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape). Native rendering in supporting browsers; spec-accurate JS fallback in Safari and Firefox.

Docs: https://hyperellipse.vercel.app

## When to use

- User wants squircles, superellipses, scoops, or notches with cross-browser support
- User mentions `corner-shape` outside Chrome
- User integrates, debugs, or migrates to the `hyperellipse` npm package

## Setup checklist

1. Install: `npm install hyperellipse` (or `bun` / `pnpm`)
2. CSS: set `--corner-shape` on each shaped element (does not inherit)
3. Client: call `registerHyperellipse()` once
4. SSR: add the CSS scale snippet (see below)

```ts
import { registerHyperellipse } from "hyperellipse";

registerHyperellipse();
```

## CSS patterns

Browsers without native `corner-shape` drop the property at parse time. Use `--corner-shape` as the carrier:

```css
.card {
  --corner-shape: squircle;
  border-radius: calc(24px * var(--corner-scale, 1));
  background: #4f46e5;
}
```

For zero-JS Chrome, also set the native property:

```css
.card {
  corner-shape: squircle;
  --corner-shape: squircle;
  border-radius: calc(24px * var(--corner-scale, 1));
}
```

### SSR zero-flash snippet (recommended)

Squircles look less round than circles at the same radius. Scale radius in unsupported browsers before JS loads:

```css
@import "hyperellipse/css";
/* equivalent:
@supports not (corner-shape: squircle) {
  :root { --corner-scale: 0.6; }
}
*/
```

Prefer this CSS snippet over relying on JS-only `pendingRadiusScale`. The engine force-overrides `--corner-scale: 1` per element after init so geometry uses the full radius.

### Supported values

Same shorthand grammar as native `corner-shape` (1–4 values: top-left, top-right, bottom-right, bottom-left):

```css
--corner-shape: squircle;
--corner-shape: superellipse(4);
--corner-shape: squircle bevel scoop notch;
```

Keywords: `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, `superellipse(K)`.

Per-element without a stylesheet rule:

```html
<div data-corner-shape="squircle" style="border-radius: 32px"></div>
```

## API

```ts
const controller = registerHyperellipse({
  selector: ".card, .button", // cross-origin sheets that cannot be scanned
  pendingRadiusScale: 0.6,     // secondary to CSS --corner-scale snippet
  force: false,                // force fallback in supporting browsers (debug)
});

controller.supported; // native corner-shape?
controller.active;    // JS fallback running?
controller.refresh(); // rescan stylesheets, recompute all elements
controller.destroy(); // tear down
```

`registerHyperellipse()` is idempotent and SSR-safe (no-op without `document`). Repeated calls return the same controller.

## How it works

| Environment | Behavior |
| --- | --- |
| Chrome / native `corner-shape` | Tiny zero-specificity CSS bridge via `@property`; no observers |
| Safari / Firefox | Scans stylesheets for `--corner-shape`, renders with `clip-path` / SVG layers |
| SSR | `--corner-scale` snippet softens corners before hydration |

## Critical rules

- Set `--corner-shape` on the element itself, not an ancestor (`inherits: false`)
- Write `border-radius` through `calc(Npx * var(--corner-scale, 1))` for SSR apps
- Call `controller.refresh()` after dynamic style changes not covered by transitions (e.g. `:hover`-only rules)
- In layer mode (shadow/outline present), `::before` and `::after` must be free

## Framework integration

- **Next.js / Remix / Astro / Vite**: import and call `registerHyperellipse()` in a client-only entry (layout, provider, or `useEffect`)
- **Global styles**: `@import "hyperellipse/css"` in `global.css`
- Do not call `registerHyperellipse()` during SSR

## Do not promise unsupported behavior

- `inset` box-shadows are dropped
- Dashed/dotted/per-side borders render as a uniform solid ring
- Layer mode + background images/gradients: corners may stick out (solid colors OK)
- Layer mode: children are not clipped to the shape (`overflow: hidden` clips to rect)
- Animating `corner-shape`, `border-radius`, `box-shadow`, or `outline` in keyframes is not tracked frame-by-frame in the fallback — only size (`width` / `height`) animates smoothly

For rendering strategy details and performance notes, see [limitations.md](limitations.md).
