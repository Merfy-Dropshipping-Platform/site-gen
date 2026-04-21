# Visual-diff snapshots — `@merfy/theme-base`

Pixel-perfect regression guard for theme blocks. Phase 1e pilot; expanded per phase.

## Running locally

```bash
cd backend/services/sites

# Prereq — compile Astro blocks → dist/astro-blocks/
pnpm build:blocks

# Compare against committed snapshots (fails on >1% diff).
pnpm --filter @merfy/theme-base test:visual

# Regenerate snapshots after an intentional visual change.
pnpm --filter @merfy/theme-base test:visual:update
```

## When to update

| Situation | Action |
| --- | --- |
| Intentional visual change (redesign, token tweak) | Regenerate with `test:visual:update`, review diff in git, commit new PNGs. |
| Unexpected diff in CI | Treat as regression first — inspect the `test-results/` failure artifact, find the commit that broke it, fix. Only regenerate if you confirm the new look is desired. |
| New block added | Add a `<block>.visual.test.ts` next to existing ones, generate snapshot, commit. |
| New variant / viewport | Add a new `test()` case inside the existing file, generate, commit. |

## Threshold

Configured in [`playwright.config.ts`](../playwright.config.ts):

- `threshold: 0.01` — per-pixel color tolerance.
- `maxDiffPixelRatio: 0.01` — max 1% of pixels may differ before the test fails.
- `animations: 'disabled'` — deterministic rendering.

Tests run with `workers: 1` to avoid parallel render jitter.

## Current coverage

Phase 1e partial (base theme, desktop-only):

| Block | Snapshot | File |
| --- | --- | --- |
| Hero | `base/Hero/centered-1440.png` | `hero.visual.test.ts` |
| Footer | `base/Footer/default-1440.png` | `footer.visual.test.ts` |
| Collections | `base/Collections/default-1440.png` | `collections.visual.test.ts` |
| Newsletter | `base/Newsletter/default-1440.png` | `newsletter.visual.test.ts` |
| Gallery | `base/Gallery/default-1440.png` | `gallery.visual.test.ts` |

Phase 2 will add rose theme snapshots + 375px mobile viewport.

## How it works

Pipeline (`render-utils.ts`):

1. Compile Tailwind CSS once per run → `tailwind-compiled.css` (cached 60s).
2. Import the precompiled Astro block from `dist/astro-blocks/theme-base__<Block>__<Block>.mjs`.
3. Render to HTML via `experimental_AstroContainer` with minimal props + design-token CSS vars.
4. Inline Tailwind utilities + tokens into a throwaway HTML shell, serve on `127.0.0.1:0`.
5. Playwright navigates, waits for `networkidle`, captures full-page screenshot.
6. Compared against committed PNG under `__snapshots__/snapshots/` using `pixelmatch`.

Snapshot filenames follow `<theme>/<block>/<variant>-<viewport>.png` inside the test, but
Playwright flattens to `base-<Block>-<variant>-<viewport>.png` on disk
(see `snapshotPathTemplate` in `playwright.config.ts`).

## Gotchas

- **Always run `pnpm build:blocks` first** — `render-utils.ts` imports from `dist/astro-blocks/`, not source.
- **Use inline `data:image/svg+xml` for images** — network images (picsum, unsplash) flake in CI.
- **Declare tokens after Tailwind** — tokens override utility defaults; see the `<style>` order in `render-utils.ts`.
- **No animations in block CSS for the snapshot variant** — `animations: 'disabled'` covers CSS transitions,
  but JS-driven animation requires opt-in disabling in the test.
