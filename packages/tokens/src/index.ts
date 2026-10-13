// @merfy/tokens — словарь токенов новых тем (design.md блока 1, раздел 9). Работает в браузере и на сервере,
// ничего про ИИ не импортирует: ИИ подключается переходником, который оборачивает call.

// Словарь
export { parseDictionary, platformDictionary } from './dictionary';
export { extendDictionary } from './extend';

// Значения
export { parseTheme, parseTokenEdits, readTokenEdits } from './values';

// Расчёт и печать — чистые функции
export { choiceAttributes, resolveTokens } from './resolve';
export { emitCss, tokensCss } from './emit-css';
export { contrastIssues } from './contrast';

// Шаги перевода правок между версиями темы (блок 10)
export {
  NO_MIGRATIONS,
  compareVersions,
  migrateTokenEdits,
  parseTokenMigrations,
  tokenAfter,
  tokenMigrationsSchema,
} from './migrations';
export type { TokenMigrationStep, TokenMigrations } from './migrations';

// Генераторы
export { tailwindCss } from './generate/tailwind';
export { tokensMarkdown } from './generate/markdown';
export { dictionaryJsonSchema, themeTokensJsonSchema } from './generate/json-schema';

// Помощники для панели и инструмента
export {
  checkEdits,
  compactEdits,
  dependentsOf,
  groupsOf,
  limitsOf,
  mergeEdits,
  searchCatalog,
  sourceOf,
} from './helpers';

// Схема панели темы и настройки не про вид (блок 8)
export { parsePanel, panelForTheme } from './panel/panel';
export { classesOf } from './kinds';
export { fieldVisible, isSettingField, isTokenField, panelFields, settingFields, tokenFields } from './panel/fields';
export { parseSettingsEdits, readSettingsEdits, resolveSettings } from './panel/settings';
export { panelJsonSchema } from './panel/shape';
export type * from './panel/types';

// Шрифты новых тем (блок 12): реестр и CSS шрифтов магазина
export { fontStack, fontsCss, tokensCssWithFonts } from './fonts/fonts-css';
export type { FontChoice, FontRole, FontsCss } from './fonts/fonts-css';
export { fontRegistryJsonSchema, parseFontRegistry } from './fonts/registry';
export type { FontEntry, FontFileEntry, FontRegistry } from './fonts/registry';

// Поиск и инструмент для ИИ
export { searchTokens } from './search/tokens';
export { createTokensTool, runTokensTool, tokensTool } from './tool/tool';

// Ошибка и типы
export { TokenError, type TokenErrorCode } from './errors';
export type * from './types';
