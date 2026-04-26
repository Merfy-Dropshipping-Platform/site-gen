// Satin Catalog — uses the base puckConfig (Figma "Группа товаров" parity).
// Theme overrides only the Astro renderer (Catalog.astro mounts a satin-tuned
// CatalogIsland for live builds); the Puck schema is shared across all themes
// so the constructor sidebar shows identical settings everywhere.
export {
  CatalogPuckConfig,
  CatalogSchema,
  type CatalogProps,
} from '../../../theme-base/blocks/Catalog/Catalog.puckConfig';
