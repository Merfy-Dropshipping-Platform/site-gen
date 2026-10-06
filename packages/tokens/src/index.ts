// @merfy/tokens — словарь токенов новых тем (design.md блока 1, раздел 9). Работает в браузере и на сервере,
// ничего про ИИ не импортирует: ИИ подключается переходником, который оборачивает call.

// Словарь
export { parseDictionary, platformDictionary } from './dictionary';
export { extendDictionary } from './extend';

// Значения
export { parseTheme, parseTokenEdits } from './values';

// Расчёт и печать — чистые функции
export { choiceAttributes, resolveTokens } from './resolve';
export { emitCss, tokensCss } from './emit-css';
export { contrastIssues } from './contrast';

// Генераторы
export { tailwindCss } from './generate/tailwind';
export { tokensMarkdown } from './generate/markdown';
export { dictionaryJsonSchema, themeTokensJsonSchema } from './generate/json-schema';

// Помощники для панели и инструмента
export { checkEdits, dependentsOf, groupsOf, limitsOf, mergeEdits, searchCatalog, sourceOf } from './helpers';

// Поиск и инструмент для ИИ
export { searchTokens } from './search/tokens';
export { createTokensTool, runTokensTool, tokensTool } from './tool/tool';

// Ошибка и типы
export { TokenError, type TokenErrorCode } from './errors';
export type * from './types';
