// События пересборки блока 3 (rebuild-events.json пакета storefront-config) → какие входы сборки они меняют (design.md
// блока 4, Св-1: карта сущностей покрывает весь контент). data.<тип> — сущности этого типа в снимке данных. Тест сверяет
// таблицу со списком событий блока 3 и со входами: новое событие без строки здесь тест не пропустит. code — код секций
// (блок 7): публикация выносит на витрину черновики своих секций, смена и выпуск темы приносят секции темы.
export const REBUILD_EVENT_INPUTS: Readonly<Record<string, readonly string[]>> = {
  'merchant-publish': ['revision', 'code'],
  'product-change': ['data.product'],
  'theme-change': ['theme', 'code'],
  'branding-change': ['revision', 'site.description', 'site.seoTitle', 'site.keywords', 'site.logoUrl'],
  'theme-release': ['theme', 'code'],
  // Выпуски блока 10: платформа меняет код рендера, ядро и секции платформы, расширение — код своих секций.
  'platform-release': ['platform', 'shell', 'code'],
  'extension-release': ['code'],
  'domain-change': ['site.publicUrl'],
  'shop-name-change': ['site.name'],
  'policy-change': ['data.policy'],
  'contacts-change': ['data.contacts'],
  'publication-change': ['data.publication'],
  'collection-change': ['data.collection'],
  'payment-settings-change': ['data.billing'],
  'stock-change': ['data.product'],
  'analytics-counters-change': ['data.counter', 'data.custom-code'],
};
