import {
  contrastIssues,
  fontStack,
  parseFontRegistry,
  parseTheme,
  resolveTokens,
  TokenError,
  type ParsedTheme,
  type ResolvedTokens,
} from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import fontsJson from '../../theme-contract/fonts/fonts.json';
import themeJson from '../../theme-nova/theme.json';

// Тема nova, вид «Чистый» (design.md блока 9): четыре схемы (Т9-3 Б), ноль проблем читаемости («решил сам» 3),
// в theme.json — обязательные значения и явные только там, где правило словаря даёт не то («решил сам» 2), панель
// целиком («решил сам» 6), шрифт — из библиотеки платформы (блок 12: стек реестра при печати CSS, файлы — fontsCss).
type RawTokens = { root: Record<string, unknown>; schemes: Record<string, Record<string, unknown>> };
// Место значения в theme.json: корень или схема.
type Place = { scheme?: string; key: string };

const raw: RawTokens = themeJson.tokens;
const theme = parseTheme(raw);
const resolved = resolveTokens(theme.dictionary, theme.tokens, {});

const placeName = (place: Place): string => `${place.scheme ?? 'root'}.${place.key}`;

const allPlaces = (): Place[] => [
  ...Object.keys(raw.root).map((key) => ({ key })),
  ...Object.entries(raw.schemes).flatMap(([scheme, values]) => Object.keys(values).map((key) => ({ scheme, key }))),
];

const omit = (values: Record<string, unknown>, key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).filter(([name]) => name !== key));

// Значения темы без одного места.
function rawWithout(place: Place): RawTokens {
  const { scheme } = place;
  if (scheme === undefined) return { root: omit(raw.root, place.key), schemes: raw.schemes };
  return { root: raw.root, schemes: { ...raw.schemes, [scheme]: omit(raw.schemes[scheme], place.key) } };
}

// Тема без одного значения. undefined — словарь отказал (theme-invalid): значение обязательное. Другая ошибка
// летит дальше.
function parsedWithout(place: Place): ParsedTheme | undefined {
  try {
    return parseTheme(rawWithout(place));
  } catch (error) {
    if (error instanceof TokenError && error.code === 'theme-invalid') return undefined;
    throw error;
  }
}

const valueAt = (tokens: ResolvedTokens, place: Place): unknown =>
  place.scheme === undefined ? tokens.root[place.key] : tokens.schemes[place.scheme][place.key];

// Явное значение лишнее, если без него расчёт даёт то же самое.
function sameWithout(place: Place, parsed: ParsedTheme): boolean {
  const without = resolveTokens(parsed.dictionary, parsed.tokens, {});
  return JSON.stringify(valueAt(without, place)) === JSON.stringify(valueAt(resolved, place));
}

// Первое имя стека шрифта: «Onest, system-ui, sans-serif» → «Onest».
const firstFamily = (stack: unknown): string => (typeof stack === 'string' ? stack.split(',')[0].trim() : '');
const weightText = (weight: unknown): string => (typeof weight === 'number' ? `${weight}` : '');

// Начертания, которые нужны theme.json: шрифт текста и шрифт заголовков, каждый со своей насыщенностью.
function neededFaces(): string[] {
  const { root } = resolved;
  const faces = [
    `${firstFamily(root['font-body'])} ${weightText(root['weight-body'])}`,
    `${firstFamily(root['font-heading'])} ${weightText(root['weight-heading'])}`,
  ];
  return [...new Set(faces)].sort();
}

describe('тема nova: вид «Чистый»', () => {
  it('четыре схемы: основная, мягкая, акцентная, тёмная (Т9-3 Б)', () => {
    expect(Object.keys(raw.schemes)).toEqual(['scheme-1', 'scheme-2', 'scheme-3', 'scheme-4']);
  });

  it('проблем читаемости нет ни в одной схеме', () => {
    expect(contrastIssues(theme.dictionary, resolved)).toEqual([]);
  });

  it('34 значения: 32 обязательных и два явных — межбуквенное заголовков и ширина логотипа', () => {
    const optional = allPlaces().filter((place) => parsedWithout(place) !== undefined);
    expect(allPlaces()).toHaveLength(34);
    expect(optional.map(placeName)).toEqual(['root.tracking-heading', 'root.width-logo']);
  });

  it('каждое явное значение меняет расчёт: без него значение другое', () => {
    const redundant = allPlaces().filter((place) => {
      const parsed = parsedWithout(place);
      return parsed !== undefined && sameWithout(place, parsed);
    });
    expect(redundant.map(placeName)).toEqual([]);
  });

  it('тема не прячет полей панели: в theme.json только имя, версия и токены', () => {
    expect(Object.keys(themeJson)).toEqual(['name', 'version', 'tokens']);
  });

  it('шрифт темы — из библиотеки платформы (блок 12): в theme.json — формат панели, в CSS — стек реестра', () => {
    const registry = parseFontRegistry(fontsJson);
    expect(neededFaces()).toEqual(['Onest 400', 'Onest 600']);
    const panelStack = 'Onest, system-ui, sans-serif';
    expect(resolved.root['font-body']).toBe(panelStack);
    expect(fontStack(registry, panelStack)).toBe(registry.fonts.onest.stack);
    expect(registry.fonts.onest.cyrillic).toBe(true);
  });
});
