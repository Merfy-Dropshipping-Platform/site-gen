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

const TAILWIND_RESETS = [
  '--color-*: initial;',
  '--font-*: initial;',
  '--text-*: initial;',
  '--radius-*: initial;',
  '--shadow-*: initial;',
];

const BASE_LAYER = [
  '@layer base {',
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

export function tailwindCss(dictionary: Dictionary): string {
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
  return `${[`/* ${GENERATED_NOTE} */`, theme, ...utilities, ...variants, BASE_LAYER].join('\n')}\n`;
}
