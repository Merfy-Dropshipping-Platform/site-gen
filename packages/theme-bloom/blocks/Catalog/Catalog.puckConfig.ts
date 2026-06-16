// Bloom Catalog — использует базовый puckConfig (Figma «Группа товаров» parity).
// Тема переопределяет только Astro-рендер (Catalog.astro — родная вёрстка bloom:
// top/side раскладки фильтров + гидрация живого API). Puck-схема общая для всех
// тем, чтобы сайдбар конструктора показывал одинаковые настройки везде.
//
// Поле filterPosition ('top' | 'side') присутствует в базовой схеме; базовый
// дефолт уже 'top' (родная раскладка bloom) — Catalog.astro читает его и ставит
// data-catalog-layout. Отдельный re-export держит блок-папку override в каноне
// анатомии (X.puckConfig / X.classes / X.tokens / index).
export {
  CatalogPuckConfig,
  CatalogSchema,
  type CatalogProps,
} from '../../../theme-base/blocks/Catalog/Catalog.puckConfig';
