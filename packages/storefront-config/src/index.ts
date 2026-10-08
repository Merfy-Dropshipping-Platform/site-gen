// @merfy/storefront-config — конфиг витрины новых тем (design.md блока 3, раздел 6): схема v1, писатель, тег,
// читатель и события пересборки. В браузере читатель берут отдельным входом — src/read.ts
// (@merfy/storefront-config/read): так в скрипт страницы не попадает zod.

export { storefrontConfigSchema, type StorefrontConfig } from './schema';
export { buildStorefrontConfig, type StorefrontConfigInput } from './build';
export { CONFIG_TAG_ID, configTag, escapeScriptJson } from './tag';
export { parseStorefrontConfig, readStorefrontConfig, type ConfigSource } from './read';
export { rebuildEvents, type RebuildEvent } from './events';
export { StorefrontConfigError, type StorefrontConfigErrorCode } from './errors';
