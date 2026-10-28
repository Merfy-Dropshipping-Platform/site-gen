// События пересборки блока 3 (rebuild-events.json пакета storefront-config) → какие входы сборки они меняют (design.md
// блока 4, Св-1: карта сущностей покрывает весь контент). data.<тип> — сущности этого типа в снимке данных. Тест сверяет
// таблицу со списком событий блока 3 и со входами: новое событие без строки здесь тест не пропустит. code — код секций
// (блок 7): публикация выносит на витрину черновики своих секций, смена и выпуск темы приносят секции темы.
export const REBUILD_EVENT_INPUTS: Readonly<Record<string, readonly string[]>> = {
  'merchant-publish': ['revision', 'code'],
  'product-change': ['data.product'],
  'theme-change': ['theme', 'code'],
  'branding-change': ['revision', 'site.description', 'site.seoTitle', 'site.keywords', 'site.logoUrl', 'site.signature'],
  'theme-release': ['theme', 'code'],
  // Выпуски блока 10: платформа меняет код рендера, ядро и секции платформы, расширение — код своих секций.
  'platform-release': ['platform', 'shell', 'code'],
  'extension-release': ['code'],
  // Выпуск нашей секции меняет код своей секции магазина (блок 15, часть 15з).
  'section-release': ['code'],
  // Блок 12 «Секций и SDK», часть 12б: включение и выключение расширения меняет код его секций на витрине.
  'extension-toggle': ['code'],
  // Блок 12 «Секций и SDK», часть 12в: откат секции с ролью меняет код своей секции магазина.
  'section-rollback': ['code'],
  'domain-change': ['site.publicUrl'],
  'shop-name-change': ['site.name'],
  'policy-change': ['data.policy'],
  'contacts-change': ['data.contacts'],
  'publication-change': ['data.publication', 'data.blog'],
  'collection-change': ['data.collection'],
  'payment-settings-change': ['data.billing'],
  'stock-change': ['data.product'],
  'analytics-counters-change': ['data.counter', 'data.custom-code'],
};
