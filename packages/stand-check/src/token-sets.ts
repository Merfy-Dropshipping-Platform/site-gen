import type { TokenSetName } from './types';

// Имена CSS-переменных, которые стенд снимает с :root и проверяет в tokens-present.
// Набор base — базовые токены словаря @merfy/tokens. Его заполнит задача «Образцы токенов на стенде»
// (design.md блока 2, задача 8). До неё набор пуст, и tokens-present честно не проходит.
export const TOKEN_SETS: Readonly<Record<TokenSetName, readonly string[]>> = { base: [] };
