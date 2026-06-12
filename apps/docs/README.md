# hyperellipse docs

Documentation site for [hyperellipse](https://github.com/mikhailmogilnikov/hyperellipse).

**Production:** [hyperellipse.vercel.app](https://hyperellipse.vercel.app)

## Development

Requires Node.js >= 22.12 and [Bun](https://bun.sh).

```bash
cd apps/docs
bun install
bun run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start Astro dev server |
| `bun run build` | Build static site to `dist/` |
| `bun run preview` | Preview production build locally |
| `bun run check-types` | Run `astro check` |

## Deploy

Deployed to Vercel from `apps/docs`:

- **Root Directory:** `apps/docs`
- **Build Command:** `bun run build`
- **Output Directory:** `dist`

Site URL is configured in `astro.config.mjs` as `https://hyperellipse.vercel.app`.

Analytics: [@vercel/analytics](https://vercel.com/docs/analytics) (enable in the Vercel project dashboard).

## Assets

- OG image source: `public/og.svg` → regenerate PNG with `rsvg-convert -w 1200 -h 630 public/og.svg -o public/og.png`
- Favicons: generated via [RealFaviconGenerator](https://realfavicongenerator.net/)
