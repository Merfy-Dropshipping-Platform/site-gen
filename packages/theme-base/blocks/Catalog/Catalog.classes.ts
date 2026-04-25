// Catalog — wrapper-only classes. The bulk of the layout (sidebar/grid/
// pagination) lives inside the React island (CatalogIsland) which uses inline
// styles bound to CSS vars. These classes provide the section chrome only.
export const CatalogClasses = {
  root: 'relative w-full bg-[rgb(var(--color-bg))] text-[rgb(var(--color-text))]',
  container: 'w-full max-w-[var(--container-max-width)] mx-auto px-[40px]',
} as const;
