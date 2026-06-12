# Contributing

Thanks for your interest in contributing to hyperellipse!

## Development setup

```bash
bun install
bun run dev        # docs + package watch
bun run build
bun run test
bun run check
bun run check-types
```

## Making changes

1. Fork the repo and create a branch from `main`.
2. Make your changes in `packages/hyperellipse`.
3. Add or update tests when changing parser or geometry logic.
4. Run `bun run check` and `bun run test` before opening a PR.
5. Add a [changeset](https://github.com/changesets/changesets) when your change should trigger a release:

   ```bash
   bun changeset
   ```

6. Open a pull request with a clear description and screenshots for visual changes.

## Commit messages

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(hyperellipse): add superellipse parsing for scientific notation
fix: correct radius overlap scaling
chore: update CI workflow
```

## Releases

Only `hyperellipse` is published to npm, via Changesets on a maintainer machine:

```bash
bun changeset
bun version-packages
bun release
```

## Reporting issues

Please include:

- Browser and version
- Minimal HTML/CSS reproducer
- Expected vs actual rendering
- Whether native `corner-shape` is supported (compare in Chrome vs Safari/Firefox)
