// Bloom Catalog — inherits schema/fields from theme-base, overrides defaults
// to match the Bloom Figma. Differences from base:
//   • cardBackground field removed from sidebar (controlled only via Theme
//     Settings → Карточки → "В окне")
//   • cardStyle default 'auto' (base: 'portrait')
//   • quickAdd default 'none' (base: 'none' — same, kept explicit)
//   • showFilter default 'false' (base: 'true' — Bloom hides filters by default)
import {
  CatalogPuckConfig as BaseCatalogPuckConfig,
  CatalogSchema,
  type CatalogProps,
} from '../../../theme-base/blocks/Catalog/Catalog.puckConfig';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const baseProductCardFields = (BaseCatalogPuckConfig.fields as any).productCard
  ?.objectFields ?? {};

// Strip cardBackground from the sidebar — Bloom controls it via theme tokens.
const productCardFieldsWithoutCardBg: Record<string, unknown> = {};
for (const [k, v] of Object.entries(baseProductCardFields)) {
  if (k === 'cardBackground') continue;
  productCardFieldsWithoutCardBg[k] = v;
}

export const CatalogPuckConfig: BlockPuckConfig<CatalogProps> = {
  ...BaseCatalogPuckConfig,
  fields: {
    ...BaseCatalogPuckConfig.fields,
    productCard: {
      ...(BaseCatalogPuckConfig.fields as any).productCard,
      objectFields: productCardFieldsWithoutCardBg,
    },
  } as typeof BaseCatalogPuckConfig.fields,
  defaults: {
    ...BaseCatalogPuckConfig.defaults,
    productCard: {
      ...((BaseCatalogPuckConfig.defaults as any).productCard ?? {}),
      cardStyle: 'auto',
      quickAdd: 'none',
    },
    showFilter: 'false',
  } as typeof BaseCatalogPuckConfig.defaults,
};

export { CatalogSchema, type CatalogProps };
