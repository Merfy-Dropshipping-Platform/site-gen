import sampleThemeJson from '../fixtures/sample-theme.json';
import { TokenError } from '../src/errors';
import type { ParsedTheme } from '../src/types';
import { parseTheme } from '../src/values';

// Общее для тестов: образец магазина из раздела 4 design.md и розовая схема из раздела 6.

export type RawTheme = { root: Record<string, unknown>; schemes: Record<string, Record<string, unknown>> };

// Свежая копия образца: тест меняет её как хочет и не задевает соседей.
export const sampleRaw = (): RawTheme => structuredClone(sampleThemeJson);
export const sample: ParsedTheme = parseTheme(sampleThemeJson);

// Тема сама задала белую надпись на розовой кнопке (Т1-4 Б).
export const PINK_SCHEME = {
  background: '#fff7fa',
  foreground: '#2b1d24',
  primary: '#e91e8c',
  destructive: '#dc2626',
  'primary-foreground': '#ffffff',
};
export const pink: ParsedTheme = parseTheme({ root: sampleThemeJson.root, schemes: { 'scheme-1': PINK_SCHEME } });

// Проблемы из TokenError с нужным кодом; другая ошибка пролетает дальше, без ошибки — пустой список.
export function problemsOf(code: TokenError['code'], run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof TokenError && error.code === code) return error.problems;
    throw error;
  }
  return [];
}
