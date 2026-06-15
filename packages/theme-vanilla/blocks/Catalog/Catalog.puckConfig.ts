// Vanilla Catalog — использует базовый puckConfig (Figma «Группа товаров» parity).
// Тема переопределяет только Astro-рендер (Catalog.astro — родная вёрстка vanilla:
// top/side раскладки фильтров + гидрация). Puck-схема общая для всех тем, чтобы
// сайдбар конструктора показывал одинаковые настройки везде.
//
// Поле filterPosition ('top' | 'side') присутствует в базовой схеме; родная
// раскладка vanilla — 'side', Catalog.astro читает filterPosition и ставит
// data-catalog-layout (дефолт side, если не задано). Отдельный re-export держит
// блок-папку override в каноне анатомии (X.puckConfig / X.classes / X.tokens / index).
export {
  CatalogPuckConfig,
  CatalogSchema,
  type CatalogProps,
} from '../../../theme-base/blocks/Catalog/Catalog.puckConfig';
