/**
 * Tailwind config for the visual-snapshot pipeline (theme-rose).
 *
 * Scans BOTH rose override blocks AND base blocks — rose reuses most base
 * components (Hero, Newsletter, Gallery …) unchanged and only overrides a
 * subset (Header, Footer). Every utility class used by either set must be
 * in the compiled CSS, otherwise rose snapshots that render base blocks
 * would be unstyled. Paths are relative to the CLI cwd
 * (`packages/theme-rose/` — see `render-utils.ts#getCompiledTailwindCss`).
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    // Rose-specific overrides.
    './blocks/**/*.{astro,ts,tsx}',
    // Base blocks — rose renders them when no override exists.
    '../theme-base/blocks/**/*.{astro,ts,tsx}',
    '../theme-base/layouts/**/*.astro',
    '../theme-base/seo/**/*.{astro,ts}',
    '../theme-base/primitives/**/*.astro',
  ],
  theme: {
    extend: {},
  },
  // Intentionally keep plugins empty — the goal is a deterministic,
  // theme-token-driven CSS output. Per-theme tokens are injected after.
  plugins: [],
};
