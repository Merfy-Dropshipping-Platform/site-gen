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

// Поиск и инструмент для ИИ
export { searchTokens } from './search/tokens';
export { createTokensTool, runTokensTool, tokensTool } from './tool/tool';

// Ошибка и типы
export { TokenError, type TokenErrorCode } from './errors';
export type * from './types';
