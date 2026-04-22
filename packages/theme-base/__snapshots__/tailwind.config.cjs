/**
 * Tailwind config for the visual-snapshot pipeline.
 *
 * Scans all theme-base blocks / layouts / seo for utility classes so the
 * compiled CSS injected into `renderBlockToHtml()` has parity with what
 * storefront builds emit. Paths are resolved relative to the package root
 * (cwd = packages/theme-base) because the CLI is executed from there — see
 * `render-utils.ts#getCompiledTailwindCss`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    './blocks/**/*.{astro,ts,tsx}',
    './layouts/**/*.astro',
    './seo/**/*.{astro,ts}',
    './primitives/**/*.astro',
    // Per-theme block overrides and custom blocks live outside theme-base but
    // render in the same preview surface. Without these globs Tailwind prunes
    // any class they use (e.g. satin/vanilla header's `hidden md:flex`).
    '../theme-rose/blocks/**/*.{astro,ts,tsx}',
    '../theme-rose/customBlocks/**/*.{astro,ts,tsx}',
    '../theme-vanilla/blocks/**/*.{astro,ts,tsx}',
    '../theme-vanilla/customBlocks/**/*.{astro,ts,tsx}',
    '../theme-satin/blocks/**/*.{astro,ts,tsx}',
    '../theme-satin/customBlocks/**/*.{astro,ts,tsx}',
    '../theme-bloom/blocks/**/*.{astro,ts,tsx}',
    '../theme-bloom/customBlocks/**/*.{astro,ts,tsx}',
    '../theme-flux/blocks/**/*.{astro,ts,tsx}',
    '../theme-flux/customBlocks/**/*.{astro,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  // Intentionally keep plugins empty — the goal is a deterministic,
  // theme-token-driven CSS output. Per-theme tokens are injected after.
  plugins: [],
};
