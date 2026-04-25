// Bloom Catalog — section chrome. CatalogIsland (top toolbar dropdowns + 3-col
// grid + Show More) renders inside via templates/astro/bloom/src/pages/
// catalog.astro. We only frame the section here. Bloom uses 1320px container
// with 16-96px responsive gutters (matching the rest of bloom pages).
export const CatalogClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container:
    'w-full max-w-[var(--container-max-width,1320px)] mx-auto px-[16px] sm:px-[24px] md:px-[32px] lg:px-[64px] xl:px-[96px] 2xl:px-[40px]',
} as const;
