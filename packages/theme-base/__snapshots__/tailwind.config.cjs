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
  ],
  theme: {
    extend: {},
  },
  // Intentionally keep plugins empty — the goal is a deterministic,
  // theme-token-driven CSS output. Per-theme tokens are injected after.
  plugins: [],
};
