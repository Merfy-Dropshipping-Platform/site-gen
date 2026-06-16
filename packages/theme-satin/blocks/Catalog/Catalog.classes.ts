// Satin Catalog — классы. Родной рендер (Catalog.astro) несёт собственную
// Tailwind-вёрстку верстальщика (top/side раскладки, DS-фильтры, satin-card),
// поэтому эти классы напрямую им не используются; re-export из base держит
// блок-папку override в каноне анатомии и совместимым с loader/diff-инструментами.
export { CatalogClasses } from '../../../theme-base/blocks/Catalog/Catalog.classes';
