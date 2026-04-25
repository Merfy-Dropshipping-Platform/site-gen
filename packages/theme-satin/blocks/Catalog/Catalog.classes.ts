// Satin Catalog — section chrome. CatalogIsland (filter + grid + pagination)
// applies its own classes/inline styles bound to CSS variables. We only frame
// the section here (1320px max-width, 40px gutters, zero radii — Satin tokens).
export const CatalogClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'w-full max-w-[var(--container-max-width)] mx-auto px-[40px]',
} as const;
