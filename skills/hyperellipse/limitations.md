# hyperellipse — limitations and rendering

## Fallback rendering strategies

| Element styles | Strategy |
| --- | --- |
| background (color, gradients, images), content clipping | `clip-path: path(...)` on the element |
| `border` (uniform, solid) | SVG ring as top background layer; native border made transparent |
| `box-shadow` (outer, with real `spread`) | Gaussian-blurred shape in static SVG on `::before` |
| `outline` + `outline-offset` | SVG ring on `::after` |

When `box-shadow` or `outline` are present, the element switches to **layer mode** (no `clip-path`; background/border/shadows painted by a single SVG layer on `::before` with `z-index: -1`). `clip-path` clips pseudo-elements and live filters; pre-rendered SVG with `feGaussianBlur` is used instead of `filter: drop-shadow()`.

## Known limitations

- **`inset` shadows** are dropped (outer shadows, including `spread`, are exact)
- **Dashed/dotted/per-side borders** render as a uniform solid ring
- **`box-shadow`/`outline` + background images/gradients**: in layer mode the background image is not shaped
- Layer mode sets `isolation: isolate` and uses `::before`/`::after` — they must be free
- In layer mode child content is not clipped to the shape
- `:hover` and `:focus` work in the fallback; pointer enter/leave and focus events on the element and its ancestors cover parent `:hover` selectors too — call `refresh()` for other imperative updates
- `--corner-shape` does not inherit — set on the element itself
- `border-radius`, `box-shadow`, and `outline` transitions are not interpolated frame-by-frame — the shape updates on state change, at `transitionrun`, and at `transitionend`. `opacity` and `transform` always transition natively. `background-color` transitions smoothly on solid fills only (no shadow or outline); in layer mode the fill is baked into SVG and jumps. Size (`width` / `height`) transitions animate smoothly via `ResizeObserver`
- Animating `corner-shape`, `border-radius`, `box-shadow`, or `outline` in keyframes is not tracked frame-by-frame in the fallback — only size (`width` / `height`) animates smoothly

## Performance

One shared `ResizeObserver` + `MutationObserver` for all instances, batched read/write per animation frame, keyed caching (no DOM writes unless output changed). Size-only updates skip computed-style re-reads. A shared `IntersectionObserver` defers work for off-screen elements until they enter the viewport.

## `--corner-scale` tuning

Default `0.6` matches perceptual equivalence between a circle and a `squircle`. Override per element inside the `@supports not` block:

- `0.5` for `superellipse(3+)`
- `0.7` for softer shapes
