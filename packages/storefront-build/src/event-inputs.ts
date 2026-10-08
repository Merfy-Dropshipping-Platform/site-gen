// События пересборки блока 3 (rebuild-events.json пакета storefront-config) → какие входы сборки они меняют (design.md
// блока 4, Св-1: карта сущностей покрывает весь контент). data.<тип> — сущности этого типа в снимке данных. Тест сверяет
// таблицу со списком событий блока 3 и со входами: новое событие без строки здесь тест не пропустит.
export const REBUILD_EVENT_INPUTS: Readonly<Record<string, readonly string[]>> = {
  'merchant-publish': ['revision'],
  'product-change': ['data.product'],
  'theme-change': ['theme'],
  'branding-change': ['revision', 'site.description', 'site.seoTitle', 'site.keywords'],
  'theme-release': ['theme'],
  'domain-change': ['site.publicUrl'],
  'shop-name-change': ['site.name'],
  'policy-change': ['data.policy'],
  'contacts-change': ['data.contacts'],
  'publication-change': ['data.publication'],
  'collection-change': ['data.collection'],
  'payment-settings-change': ['data.billing'],
  'stock-change': ['data.product'],
};
