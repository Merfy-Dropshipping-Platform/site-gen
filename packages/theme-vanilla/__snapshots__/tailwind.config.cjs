/**
 * Tailwind config for the visual-snapshot pipeline (theme-vanilla).
 *
 * Scans BOTH vanilla override blocks AND base blocks — vanilla reuses most
 * base components (Hero, Newsletter, Gallery …) unchanged and only overrides
 * a subset (Header, Footer). Every utility class used by either set must be
 * in the compiled CSS, otherwise vanilla snapshots that render base blocks
 * would be unstyled.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    // Vanilla-specific overrides.
    './blocks/**/*.{astro,ts,tsx}',
    // Base blocks — vanilla renders them when no override exists.
    '../theme-base/blocks/**/*.{astro,ts,tsx}',
    '../theme-base/layouts/**/*.astro',
    '../theme-base/seo/**/*.{astro,ts}',
    '../theme-base/primitives/**/*.astro',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
