// @merfy/storefront-config — конфиг витрины новых тем (design.md блока 3, раздел 6): схема v1, писатель, тег,
// читатель и события пересборки. В браузере читатель берут отдельным входом — src/read.ts
// (@merfy/storefront-config/read): так в скрипт страницы не попадает zod.

export {
  COUNTER_KINDS,
  COUNTER_NUMBERS,
  isCounterNumber,
  storefrontConfigSchema,
  type AnalyticsConfig,
  type Counter,
  type CounterKind,
  type CustomCode,
  type StorefrontConfig,
} from './schema';
export { buildStorefrontConfig, type StorefrontConfigInput } from './build';
// Блок 9 «Секций и SDK», часть 9б: сквозные настройки темы — theme.settings конфига и ctx.theme ядра витрины.
export { THEME_SETTING_NAMES, type ThemeSettings } from './theme-settings';
// Блок 9 «Секций и SDK», часть 9в: сторы и методы расширений для секций и "ext:<id>" в uses.
export {
  EXT_USE_PREFIX,
  extUseSchema,
  extensionStorefrontSchema,
  storefrontExtensionsSchema,
  type ExtUse,
  type ExtensionStorefront,
  type StorefrontExtensions,
} from './extensions';
export { CONFIG_TAG_ID, configTag, escapeScriptJson } from './tag';
export { parseStorefrontConfig, readStorefrontConfig, type ConfigSource } from './read';
export { rebuildEvents, type RebuildEvent } from './events';
export { StorefrontConfigError, type StorefrontConfigErrorCode } from './errors';
