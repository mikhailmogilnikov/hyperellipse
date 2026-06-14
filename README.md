<p align="left">
  <a href="https://hyperellipse.vercel.app">
    <img src="https://hyperellipse.vercel.app/hyperellipse_logo.svg" alt="hyperellipse" height="48">
  </a>
</p>

# hyperellipse

**Docs:** [hyperellipse.vercel.app](https://hyperellipse.vercel.app)

[![npm version](https://img.shields.io/npm/v/hyperellipse.svg)](https://www.npmjs.com/package/hyperellipse)
[![CI](https://github.com/mikhailmogilnikov/hyperellipse/actions/workflows/ci.yml/badge.svg)](https://github.com/mikhailmogilnikov/hyperellipse/actions/workflows/ci.yml)
[![skills.sh](https://skills.sh/b/mikhailmogilnikov/hyperellipse)](https://skills.sh/mikhailmogilnikov/hyperellipse)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**A transparent polyfill for CSS [`corner-shape`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape)** — squircles, superellipses, scoops, notches, and per-corner mixes.

Native rendering where the browser already supports `corner-shape`. A spec-accurate JS fallback everywhere else (Safari, Firefox).

```css
.card {
  --corner-shape: squircle;
  border-radius: calc(24px * var(--corner-scale, 1));
  background: #4f46e5;
}
```

```ts
import { registerHyperellipse } from "hyperellipse";

registerHyperellipse();
```

## Features

- **Progressive** — supporting browsers get a tiny zero-specificity CSS bridge; no observers, no layout work in JS
- **Spec-aligned geometry** — superellipse math from [CSS Borders 4](https://drafts.csswg.org/css-borders/#corner-shaping), so Chrome and the fallback match
- **Real-world CSS** — backgrounds, gradients, borders, `box-shadow`, `outline` + `outline-offset`
- **SSR-friendly** — optional `--corner-scale` snippet removes the flash of overly round corners before hydration
- **Tiny API** — one `registerHyperellipse()` call; idempotent and SSR-safe

## Installation

```bash
npm install hyperellipse
# bun add hyperellipse
# pnpm add hyperellipse
```

## Quick start

**1. Style elements with a custom property carrier**

Browsers without `corner-shape` drop the native property at parse time. `--corner-shape` survives in the CSSOM and drives both native and fallback paths:

```css
.button {
  --corner-shape: squircle;
  border-radius: 45px;
  background: #2563eb;
}
```

You can also set the native property for zero-JS Chrome:

```css
.button {
  corner-shape: squircle;
  --corner-shape: squircle;
  border-radius: 45px;
}
```

**2. Register once on the client**

```ts
import { registerHyperellipse } from "hyperellipse";

registerHyperellipse();
```

**3. (Recommended) Add the SSR radius snippet**

Squircles look less round than circles at the same radius. Scale `border-radius` down in unsupported browsers so the first paint already feels right:

```css
/* global.css */
@supports not (corner-shape: squircle) {
  :root {
    --corner-scale: 0.6;
  }
}
```

```css
.button {
  --corner-shape: squircle;
  border-radius: calc(45px * var(--corner-scale, 1));
}
```

Or import the bundled snippet:

```css
@import "hyperellipse/css";
```

## Supported values

Same shorthand grammar as native `corner-shape` (1–4 values):

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
  selector: ".card",           // extra selectors (cross-origin sheets)
  pendingRadiusScale: 0.6,     // pre-hydration radius scale when JS runs
  force: false,                // force fallback in supporting browsers
});

controller.supported; // native corner-shape?
controller.active;    // fallback engine running?
controller.refresh(); // rescan + recompute
controller.destroy(); // tear down
```

Full API notes, rendering strategies, limitations, and performance details live in [`packages/hyperellipse/README.md`](./packages/hyperellipse/README.md).

## How it works

| Environment | What happens |
| --- | --- |
| Chrome / native `corner-shape` | Injects `corner-shape: var(--corner-shape, round)` via `@property` bridge |
| Safari / Firefox | Scans stylesheets for `--corner-shape`, renders with `clip-path` / SVG layers |
| SSR | `--corner-scale` CSS snippet softens corners before JS loads |

## Agent skill

An [Agent Skill](https://www.skills.sh/docs) ships with this repo so coding agents integrate hyperellipse correctly (SSR snippet, API, limitations). Works with any agent on [skills.sh](https://skills.sh/) — Cursor, Claude Code, Codex, GitHub Copilot, Windsurf, and others.

```bash
npx skills add mikhailmogilnikov/hyperellipse@hyperellipse -y
```

Source: [`skills/hyperellipse/SKILL.md`](./skills/hyperellipse/SKILL.md)

## Documentation site

**[hyperellipse.vercel.app](https://hyperellipse.vercel.app)**

```bash
cd apps/docs
bun install
bun run dev
bun run build
bun run preview
```

## Development

Monorepo managed with [Bun workspaces](https://bun.sh/docs/install/workspaces) and [Turborepo](https://turbo.build/).

```bash
bun install
bun run build          # build all packages
bun run dev            # docs + package watch
bun run check          # lint / format (ultracite)
bun run check-types    # typecheck
```

### Releases

[Changesets](https://github.com/changesets/changesets) locally. Only `hyperellipse` is versioned and published to npm:

```bash
bun changeset          # describe your change
bun version-packages   # bump versions + changelog
bun release            # build + publish to npm
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © [Mikhail Mogilnikov](https://github.com/mikhailmogilnikov)
