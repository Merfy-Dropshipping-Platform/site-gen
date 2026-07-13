# Rose Slideshow settings parity — design

## Goal

Make every visible Slideshow setting from the Rose/Figma contract behave consistently in constructor preview and published storefronts while preserving existing merchant data.

## Confirmed contract

The section exposes slides, image mode, size, interval, pagination, color scheme and vertical padding. Each slide exposes image, overlay, nested heading/text with sizes, nested button with page link, container toggle, 9-grid position, alignment and color scheme.

Existing Merfy-only controls and legacy values remain supported. Upload limits and interval values are out of scope: Figma does not prove a different interval range, and current upload limits are an explicit product decision.

## Root cause

Published pages run all props through the generic legacy normalizer. Its recursive envelope shortcuts turn Slideshow's semantic objects into strings or rename `button.link` to `button.href`. The Slideshow renderer then loses heading/text sizes and cannot resolve PagePicker object links. Preview receives a different shape. In addition, the base renderer accepts several visible settings but does not apply them.

## Chosen approach

Add a block-aware Slideshow normalizer at the data boundary. It preserves the canonical nested shape, accepts legacy aliases, resolves links from strings or PagePicker objects, and gives current fields priority over legacy aliases. Both preview and publish paths call the same block-aware entry point.

The base Astro renderer consumes normalized props and applies all visible settings. Rose remains a theme-specific renderer, but uses the same compatibility rules. The constructor PagePicker accepts legacy strings for display and emits the canonical object on changes.

This keeps the package-only live-build architecture intact and avoids a destructive database migration.

## Compatibility and defaults

- Current fields win when both current and legacy aliases exist.
- Legacy `imageUrl`, `subtitle`, `ctaText`, `ctaUrl`, left/right positions and string links remain readable.
- New PagePicker values use `{ href, text? }`.
- Missing section size/image mode use the current constructor defaults (`large`, `fullscreen`).
- Invalid values fall back safely instead of producing invalid classes or `[object Object]` URLs.

## Verification

Use unit tests for normalization and PagePicker compatibility, renderer contract tests for visible controls, service build/type checks, and Playwright screenshots at desktop/mobile widths. Compare local preview and live-equivalent output; production verification waits for an explicit deploy request.
