import { dictionaryNames } from '../dictionary';
import { block } from '../emit-css';
import { suffixOf } from '../kinds';
import type { Dictionary, TokenKind } from '../types';

// Классы Tailwind из словаря (design.md 8.6). inline — класс ссылается прямо на переменную страницы; reference —
// Tailwind не печатает свои переменные в :root; initial — выключает встроенные цвета, шрифты, размеры текста,
// скругления и тени. Шкалы отступов, ширин и межбуквенного Tailwind остаются служебными.

export const GENERATED_NOTE = 'Сгенерировано из словаря командой generate — руками не править.';

const themeVar = (name: string): string => `--${name}: var(--${name});`;

const TAILWIND_THEME: Partial<Record<TokenKind, (name: string) => string[]>> = {
  color: (name) => [`--color-${name}: var(--${name});`],
  font: (name) => [themeVar(name)],
  text: (name) => [themeVar(name), `--${name}--line-height: var(--${name}--line-height);`],
  tracking: (name) => [themeVar(name)],
  radius: (name) => [themeVar(name)],
  shadow: (name) => [themeVar(name)],
  spacing: (name) => [themeVar(name)],
  width: (name) => [`--container-${suffixOf(name, 'width')}: var(--${name});`],
};

// Насыщенность и толщина рамки — свои утилиты: у Tailwind для них нет пространства переменных.
const TAILWIND_UTILITY: Partial<Record<TokenKind, (name: string) => string>> = {
  weight: (name) => `@utility ${name} { font-weight: var(--${name}); }`,
  'border-width': (name) => `@utility ${name} { border-style: solid; border-width: var(--${name}); }`,
};

// Строки одного токена для @theme и @utility (блок 4 «Секций и SDK», Р4-10): те же таблицы, по одному токену секции.
export const tokenThemeLines = (kind: TokenKind, name: string): string[] => TAILWIND_THEME[kind]?.(name) ?? [];
export const tokenUtilityLine = (kind: TokenKind, name: string): string | null => TAILWIND_UTILITY[kind]?.(name) ?? null;

// Тени drop-shadow, text-shadow и inset-shadow у Tailwind — сырой чёрный мимо токенов (блок 4 «Секций и SDK», 4.6).
const TAILWIND_RESETS = [
  '--color-*: initial;',
  '--font-*: initial;',
  '--text-*: initial;',
  '--radius-*: initial;',
  '--shadow-*: initial;',
  '--drop-shadow-*: initial;',
  '--text-shadow-*: initial;',
  '--inset-shadow-*: initial;',
];

// Полоса прокрутки у <html> занимает место всегда: окно и шторка запрещают прокрутку страницы (overflow: hidden),
// без резерва полоса исчезает и страница сдвигается вбок на её ширину.
const BASE_LAYER = [
  '@layer base {',
  '  html { scrollbar-gutter: stable; }',
  '  body { font-family: var(--font-body); font-weight: var(--weight-body); letter-spacing: var(--tracking-body); }',
  '  h1, h2, h3, h4, h5, h6 { color: var(--heading); font-family: var(--font-heading); ' +
    'font-weight: var(--weight-heading); letter-spacing: var(--tracking-heading); }',
  '}',
].join('\n');

// Выбор — вариант на каждое значение: card-style-card:p-card ловит data-card-style="card" на <html> и внутри.
function choiceVariants(name: string, values: readonly string[]): string[] {
  const suffix = suffixOf(name, 'choice');
  return values.map((value) => {
    const match = `[data-${suffix}="${value}"]`;
    return `@custom-variant ${suffix}-${value} (&:where(${match}, ${match} *));`;
  });
}

// Слой base — сброс стилей браузера — нужен странице темы. CSS секций (блок 1 «Секций и SDK») собирается без него.
export interface TailwindOptions {
  base: boolean;
}

export function tailwindCss(dictionary: Dictionary, options: TailwindOptions = { base: true }): string {
  const names = dictionaryNames(dictionary);
  const kindOf = (name: string): TokenKind => dictionary.tokens[name].kind;
  const themeLines = names.flatMap((name) => TAILWIND_THEME[kindOf(name)]?.(name) ?? []);
  const utilities = names.flatMap((name) => {
    const make = TAILWIND_UTILITY[kindOf(name)];
    return make === undefined ? [] : [make(name)];
  });
  const variants = names
    .filter((name) => kindOf(name) === 'choice')
    .flatMap((name) => choiceVariants(name, dictionary.tokens[name].values ?? []));
  const theme = block('@theme inline reference', [...TAILWIND_RESETS, ...themeLines]);
  const base = options.base ? [BASE_LAYER] : [];
  return `${[`/* ${GENERATED_NOTE} */`, theme, ...utilities, ...variants, ...base].join('\n')}\n`;
}
