// Flux Catalog — использует базовый puckConfig (Figma «Группа товаров» parity).
// Тема переопределяет только Astro-рендер (Catalog.astro — родная вёрстка flux:
// top/side раскладки фильтров + гидрация живого API). Puck-схема общая для всех
// тем, чтобы сайдбар конструктора показывал одинаковые настройки везде.
//
// flux-дефолты полей (filterPosition='side', cardStyle='square', buttonStyle=
// 'primary', quickAdd='cart', columns=3, padding 80/80) приходят из
// packages/theme-flux/theme.json `blockDefaults.Catalog` — НЕ из схемы.
// Отдельный re-export держит блок-папку override в каноне анатомии
// (X.puckConfig / X.classes / X.tokens / index).
export {
  CatalogPuckConfig,
  CatalogSchema,
  type CatalogProps,
} from '../../../theme-base/blocks/Catalog/Catalog.puckConfig';
