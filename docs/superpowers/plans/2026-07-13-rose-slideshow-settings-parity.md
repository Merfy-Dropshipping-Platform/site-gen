# Rose Slideshow settings parity — implementation plan

## Global constraints

- Do not change upload limits.
- Do not change the product interval range in this wave.
- Preserve package-only live generation and the Rose theme override.
- Preserve legacy Slideshow data without a destructive migration.
- Current nested fields take precedence over legacy aliases.
- Preview and publish must use the same block-aware prop normalization.
- Follow TDD: add a failing test before each behavior change.

## Task 1 — Canonical Slideshow boundary in sites

Add focused tests around live prop normalization covering nested heading/text sizes, PagePicker object/string links, current-over-legacy precedence and legacy fallbacks. Implement a block-aware normalization entry point and call it from publish and preview extraction paths. Keep generic behavior unchanged for other blocks.

Expected tests: service normalizer Jest suite plus existing preview extraction tests.

## Task 2 — Base and Rose renderer parity

Update the Slideshow schema to accept canonical PagePicker links while preserving strings. Add pure normalization/layout helpers where useful. Apply size, image mode, per-slide overlay, container, 9-grid position, heading size, text size and pagination counter in the base renderer. Make Rose link/image/text resolution current-first with legacy fallback. Repair stale Slideshow contract assertions without redefining interval behavior.

Expected tests: theme-base Slideshow Jest suites, source/renderer contract tests, theme section compilation.

## Task 3 — Constructor legacy PagePicker compatibility

Add a failing component test showing that PagePicker renders a legacy string link. Update PagePicker's input normalization so it accepts string or object and still emits canonical objects. Do not change unrelated field behavior or limits.

Expected tests: PagePicker Vitest suite and constructor build.

## Task 4 — Integration verification and review

Run focused tests, lint/type/build checks, then create local preview/live-equivalent Slideshow fixtures. Use Playwright for desktop and mobile screenshots and inspect overflow, sizing, overlay, positions, typography, pagination and CTA href. Request independent code review and resolve important findings.

Do not commit, push or deploy until the user explicitly requests those actions for this wave.
