import {
  fontsCss,
  parseFontRegistry,
  resolveTokens,
  tokensCssWithFonts,
  type FontsCss,
  type ParsedTheme,
  type TokenEdits,
} from '@merfy/tokens';
import fontsJson from '../../theme-contract/fonts/fonts.json';
import { hashOf } from './canonical';

// Шрифты магазина новой темы (design.md блока 12, «решил сам» 5, 6, 10, 13). Библиотека шрифтов платформы — реестр
// packages/theme-contract/fonts/fonts.json. Её версия — вход сборки fonts (отпечаток реестра): обновили библиотеку —
// следующие сборки возьмут новые файлы, живые сборки не меняются. Файлы шрифтов уже лежат в хранилище по отпечатку
// (pnpm fonts:upload пакета storefront-storage) — сборка только вписывает их в манифест.
export const FONT_REGISTRY = parseFontRegistry(fontsJson);
export const FONT_LIBRARY_HASH = hashOf(FONT_REGISTRY);

const REGULAR_WEIGHT = 400;
const stackOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const weightOf = (value: unknown): number => (typeof value === 'number' ? value : REGULAR_WEIGHT);

// CSS токенов страницы, стенда и превью: стеки font-body и font-heading — по реестру, с подогнанным запасным
// (Т12-3 А). Правки мерчанта хранятся в формате панели, подмена — только при печати.
export const themeTokensCss = (theme: ParsedTheme, edits: TokenEdits): string =>
  tokensCssWithFonts(FONT_REGISTRY, theme.dictionary, theme.tokens, edits);

// Шрифты страницы по токенам темы с правками мерчанта — те же значения, что печатает themeTokensCss.
export function themeFonts(theme: ParsedTheme, edits: TokenEdits): FontsCss {
  const { root } = resolveTokens(theme.dictionary, theme.tokens, edits);
  return fontsCss(FONT_REGISTRY, {
    body: { stack: stackOf(root['font-body']), weight: weightOf(root['weight-body']) },
    heading: { stack: stackOf(root['font-heading']), weight: weightOf(root['weight-heading']) },
  });
}
