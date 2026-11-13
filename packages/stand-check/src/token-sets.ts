import { platformDictionary, type TokenKind } from '@merfy/tokens';
import type { TokenSetName } from './types';

// Виды без CSS-переменной на :root: выбор — атрибут на <html>, схема детали — класс (design.md блока 1).
const WITHOUT_VARIABLE: ReadonlySet<TokenKind> = new Set<TokenKind>(['choice', 'scheme']);

const baseTokens = Object.entries(platformDictionary.tokens).filter(([, token]) => !WITHOUT_VARIABLE.has(token.kind));
const baseVariables = baseTokens.map(([name]) => `--${name}`);

// Имена CSS-переменных, которые стенд снимает с :root и проверяет в tokens-present.
// Набор base — базовые токены словаря @merfy/tokens: 84 токена без 5 выборов и 3 схем деталей, 76 переменных.
export const TOKEN_SETS: Readonly<Record<TokenSetName, readonly string[]>> = { base: baseVariables };
