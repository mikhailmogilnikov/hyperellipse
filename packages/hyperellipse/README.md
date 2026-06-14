# hyperellipse

Transparent polyfill for the CSS [`corner-shape`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape) property (squircles, superellipses, scoops, notches). Native rendering in browsers that support `corner-shape`, a high-fidelity JS fallback everywhere else (Safari, Firefox).

The fallback geometry follows the exact superellipse math from the [css-borders-4 spec](https://drafts.csswg.org/css-borders/#corner-shaping), so corners look the same in Chrome and in the fallback.

## Usage

Write a `--corner-shape` custom property next to your `border-radius` (unknown native properties are discarded by parsers in non-supporting browsers, so the custom property is the carrier):

```css
.card {
  --corner-shape: squircle;
  border-radius: 45px;
  background: red;
  border: 1px solid black;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
```

Register once on the client:

```ts
import { registerHyperellipse } from "hyperellipse";

registerHyperellipse();
```

That's it. For SSR apps, also see [Zero-flash SSR fallback](#zero-flash-ssr-fallback-recommended) below.

- **Browsers with native `corner-shape`** get a tiny CSS bridge (`corner-shape: var(--corner-shape, round)` at zero specificity) — rendering is fully native, no JS observers run.
- **Browsers without it** get the fallback: stylesheets are scanned for selectors declaring `--corner-shape`, and matching elements are rendered with `clip-path` / SVG layers / `drop-shadow` filters.

You can also write the native property alongside for zero-JS rendering in Chrome:

```css
.card {
  corner-shape: squircle;
  --corner-shape: squircle;
  border-radius: 45px;
}
```

### Supported values

Same grammar as the native shorthand, 1–4 values (top-left, top-right, bottom-right, bottom-left):

```css
--corner-shape: squircle;
--corner-shape: superellipse(4);
--corner-shape: squircle bevel scoop notch;
```

Keywords: `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, `superellipse(K)`.

### Per-element opt-in

Without a stylesheet rule you can mark elements directly:

```html
<div data-corner-shape="squircle" style="border-radius: 32px"></div>
<!-- or -->
<div style="--corner-shape: squircle; border-radius: 32px"></div>
```

## API

```ts
const controller = registerHyperellipse({
  // Extra selectors (escape hatch for cross-origin stylesheets that can't be scanned)
  selector: ".card, .button",
  // border-radius multiplier shown before the fallback applies (see below). Default 0.6
  pendingRadiusScale: 0.6,
  // Force the fallback even with native support (debugging / visual comparison)
  force: false,
});

controller.supported; // native corner-shape support
controller.active;    // JS fallback engine is running
controller.refresh(); // rescan stylesheets, recompute everything
controller.destroy(); // stop and remove all applied styles
```

Calling `registerHyperellipse()` repeatedly returns the same controller. SSR-safe (no-op without `document`).

## Zero-flash SSR fallback (recommended)

A squircle visually rounds less than a circle at the same radius, so SSR pages in Safari/Firefox briefly show "too round" corners until the JS bundle loads. JS can't fix that gap — pure CSS can. Write your radius through the `--corner-scale` multiplier:

```css
.card {
  --corner-shape: squircle;
  border-radius: calc(45px * var(--corner-scale, 1));
}
```

And add this global snippet (or `@import "hyperellipse/css"`):

```css
@supports not (corner-shape: squircle) {
  :root {
    --corner-scale: 0.6;
  }
}
```

How it behaves:

- **Native browsers**: `--corner-scale` is unset → factor `1` → full radius, native squircle. Zero flash.
- **Fallback browsers, before JS**: the `@supports not` block activates at first paint → corners render at ×0.6 radius, closely matching the perceived roundness of the future squircle. No layout shift, no JS timing involved.
- **Fallback browsers, after init**: while reading element styles the engine force-overrides `--corner-scale: 1`, so the squircle geometry is computed from the **full** radius — identical to Chrome.

`0.6` is the perceptual equivalence factor between a circle and a `squircle` (matching corner cut areas). Tune it globally or per element by overriding `--corner-scale` inside the `@supports not` block (e.g. `0.5` for `superellipse(3+)`, `0.7` for softer shapes).

### Automatic pending reduction (secondary)

If you write plain `border-radius` without the multiplier, the library still injects a stylesheet at registration time that scales matched radii down (`pendingRadiusScale`, default ×0.6) until per-element styles apply. This only kicks in once JS runs, so it covers late-mounted/CSR content but not the SSR-to-bundle gap — prefer the CSS snippet above. Radii already written via `var(--corner-scale)` are excluded from it automatically.

## How the fallback renders

| Element styles | Strategy |
| --- | --- |
| background (color, gradients, images), content clipping | `clip-path: path(...)` on the element |
| `border` (uniform, solid) | SVG ring as the top background layer, native border made transparent (layout preserved) |
| `box-shadow` (outer, with real `spread`) | Gaussian-blurred shape baked into a static SVG on a `::before` pseudo-element |
| `outline` + `outline-offset` | SVG ring on an `::after` pseudo-element |

When `box-shadow` or `outline` are present the element switches to "layer mode" (no `clip-path`, the background/border/shadows are painted by a single SVG layer on `::before` with `z-index: -1`) because `clip-path` clips pseudo-elements and filter output. Shadows are deliberately **not** rendered with `filter: drop-shadow()` — Safari clips and lags live filters (especially on zoom); a pre-rendered SVG with `feGaussianBlur` is static, vector and composited like any background image.

## Limitations

- **`inset` shadows** are dropped (outer shadows, including `spread`, are exact).
- **Dashed/dotted/per-side borders** render as a uniform solid ring.
- **`box-shadow`/`outline` + background images/gradients**: in layer mode the background image is not shaped (corners stick out). Solid colors are fully supported.
- Layer mode sets `isolation: isolate` (a stacking context) to contain the `z-index: -1` pseudo-layer, and uses the element's `::before`/`::after` — they must be free.
- In layer mode child content is not clipped to the shape (`overflow: hidden` clips to the rect).
- **`:hover` and `:focus`** work in the fallback. The engine re-reads computed styles on pointer enter/leave and focus events on the element and its ancestors — parent `:hover` rules (e.g. `.wrap:hover .block`) are covered too. Call `refresh()` for imperative updates outside CSS.
- `--corner-shape` is registered with `inherits: false` (matching the native property) — set it on the element itself, not an ancestor.
- **`border-radius`, `box-shadow`, and `outline` transitions** are not interpolated frame-by-frame — the shape updates on state change, at `transitionrun`, and at `transitionend`. `opacity` and `transform` always transition natively. `background-color` transitions smoothly on solid fills only (no shadow or outline); in layer mode the fill is baked into SVG and jumps. Size (`width` / `height`) transitions animate smoothly via `ResizeObserver`.
- Animating `corner-shape`, `border-radius`, `box-shadow`, or `outline` in keyframes is not tracked frame-by-frame in the fallback — only size (`width` / `height`) animates smoothly.

## Performance

One shared `ResizeObserver` + `MutationObserver` for all instances, batched read/write phases per animation frame, keyed caching (no DOM writes unless output changed), size-only updates skip computed-style re-reads entirely.
