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

// HTML-текст (статья, «Страница», политики, richtext-поля секций): тег внутри значения шаблон секции не оформит — класс
// на вложенный тег поставить нельзя. Утилита rich-text ставит вид потомкам одной обёртки, только значениями токенов
// магазина: шрифт, насыщенность и цвет заголовков, ступени шкалы text-*, радиус фото. Цвета и размер самого текста
// остаются за секцией (text-base text-foreground на обёртке). Сравнение с классами блоков Page и BlogPostSection прода
// (Page.classes.ts, BlogPostSection.classes.ts) — packages/sdk-docs/guide/styles.md. Ссылка — цвет текста с подчёркиванием:
// accent словаря — подсветка в 6 % от foreground, текстом он не читается, а читаемость primary на фоне словарь не обещает.
const RICH_TEXT_RULES = [
  '& { overflow-wrap: break-word; }',
  '& :where(p, h2, h3, h4, ul, ol, li, blockquote, figure) { margin: 0; }',
  '& > * + * { margin-top: 1rem; }',
  '& > * + h2 { margin-top: 2rem; }',
  '& > * + h3, & > * + h4 { margin-top: 1.5rem; }',
  '& > h2 + *, & > h3 + *, & > h4 + * { margin-top: 0.75rem; }',
  '& > :where(img, figure) { margin-block: 1.5rem; }',
  '& > :first-child { margin-top: 0; }',
  '& > :last-child { margin-bottom: 0; }',
  '& :where(h2, h3, h4) { color: var(--heading); font-family: var(--font-heading); font-weight: var(--weight-heading); ' +
    'letter-spacing: var(--tracking-heading); }',
  '& h2 { font-size: var(--text-xl); line-height: var(--text-xl--line-height); }',
  '& h3 { font-size: var(--text-lg); line-height: var(--text-lg--line-height); }',
  '& h4 { font-size: var(--text-base); line-height: var(--text-base--line-height); }',
  '& :where(ul, ol) { padding-left: 1.5rem; }',
  '& ul { list-style: disc; }',
  '& ol { list-style: decimal; }',
  '& li + li { margin-top: 0.25rem; }',
  '& li > :where(ul, ol) { margin-top: 0.25rem; }',
  '& a { text-decoration: underline; text-underline-offset: 2px; }',
  '& a:hover { opacity: 0.8; }',
  '& :where(strong, b) { font-weight: 600; }',
  '& :where(em, i) { font-style: italic; }',
  '& blockquote { border-left: 2px solid var(--border); padding-left: 1rem; font-style: italic; }',
  '& img { display: block; max-width: 100%; height: auto; border-radius: var(--radius-media); }',
  '& figcaption { margin-top: 0.5rem; color: var(--muted-foreground); font-size: var(--text-sm); ' +
    'line-height: var(--text-sm--line-height); }',
];

export const RICH_TEXT_UTILITY = `@utility rich-text {\n${RICH_TEXT_RULES.map((rule) => `  ${rule}`).join('\n')}\n}`;

// Движение секций (шаг 6, 01.11): бегущая строка и параллакс — CSS без скрипта и библиотек. Движение каждой утилиты —
// только под prefers-reduced-motion: no-preference, при «уменьшить движение» элемент стоит. Бегущая строка сдвигает
// элемент на половину его ширины: в нём два одинаковых ряда подряд (второй — aria-hidden). Параллакс — анимация по
// прокрутке (animation-timeline: view()); браузер без неё оставляет элемент на месте. Кадры лежат в @theme: Tailwind
// печатает их, только когда класс есть в разметке. Паузу даёт animate-paused с вариантом: hover:animate-paused.
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)';
// 13.11: покачивание, блик, медленное вращение и появление от прокрутки классом (scroll-reveal на animation-timeline:
// view(); браузер без неё — элемент просто виден). Блик — слой ::after поверх элемента: ставить вместе с relative и
// overflow-hidden, свой фон элемента не трогается.
const MOTION_KEYFRAMES = [
  '@keyframes merfy-marquee { to { translate: -50% 0; } }',
  '@keyframes merfy-parallax { from { translate: 0 -8%; } to { translate: 0 8%; } }',
  '@keyframes merfy-parallax-strong { from { translate: 0 -16%; } to { translate: 0 16%; } }',
  '@keyframes merfy-float { 50% { translate: 0 -0.5rem; } }',
  '@keyframes merfy-shimmer { from { background-position: 150% 0; } to { background-position: -50% 0; } }',
  '@keyframes merfy-spin { to { rotate: 360deg; } }',
  '@keyframes merfy-reveal { from { opacity: 0; translate: 0 1.5rem; } }',
  '@keyframes merfy-reveal-up { from { opacity: 0; translate: 0 3rem; } }',
  '@keyframes merfy-reveal-fade { from { opacity: 0; } }',
];
const SHIMMER_LAYER =
  "&::after { content: ''; position: absolute; inset: 0; pointer-events: none; " +
  'background-image: linear-gradient(110deg, transparent 35%, rgb(255 255 255 / 0.45) 50%, transparent 65%); ' +
  'background-size: 250% 100%; animation: merfy-shimmer 2.5s linear infinite; }';
const scrollReveal = (frames: string): string =>
  `${NO_PREFERENCE} { @supports (animation-timeline: view()) { animation: ${frames} linear both; animation-timeline: view(); animation-range: entry 0% cover 30%; } }`;
const MOTION_RULES: Readonly<Record<string, string>> = {
  'animate-marquee': `${NO_PREFERENCE} { animation: merfy-marquee 40s linear infinite; }`,
  'animate-marquee-slow': `${NO_PREFERENCE} { animation: merfy-marquee 80s linear infinite; }`,
  'animate-marquee-fast': `${NO_PREFERENCE} { animation: merfy-marquee 20s linear infinite; }`,
  'animate-marquee-reverse': `${NO_PREFERENCE} { animation: merfy-marquee 40s linear infinite reverse; }`,
  parallax: `${NO_PREFERENCE} { @supports (animation-timeline: view()) { animation: merfy-parallax linear both; animation-timeline: view(); } }`,
  'parallax-strong': `${NO_PREFERENCE} { @supports (animation-timeline: view()) { animation: merfy-parallax-strong linear both; animation-timeline: view(); } }`,
  'animate-paused': 'animation-play-state: paused;',
  'animate-float': `${NO_PREFERENCE} { animation: merfy-float 6s ease-in-out infinite; }`,
  'animate-shimmer': `${NO_PREFERENCE} { ${SHIMMER_LAYER} }`,
  'animate-spin-slow': `${NO_PREFERENCE} { animation: merfy-spin 8s linear infinite; }`,
  'scroll-reveal': scrollReveal('merfy-reveal'),
  'scroll-reveal-up': scrollReveal('merfy-reveal-up'),
  'scroll-reveal-fade': scrollReveal('merfy-reveal-fade'),
};
// Классы движения, которые сами учитывают «уменьшить движение» (проверка вкуса секций их не отмечает).
export const MOTION_UTILITIES: readonly string[] = Object.keys(MOTION_RULES);
const MOTION_CSS = [
  block('@theme inline', MOTION_KEYFRAMES),
  ...Object.entries(MOTION_RULES).map(([name, rule]) => `@utility ${name} { ${rule} }`),
].join('\n');

// Строки одного токена для @theme и @utility (блок 4 «Секций и SDK», Р4-10): те же таблицы, по одному токену секции.
export const tokenThemeLines = (kind: TokenKind, name: string): string[] => TAILWIND_THEME[kind]?.(name) ?? [];
export const tokenUtilityLine = (kind: TokenKind, name: string): string | null =>
  TAILWIND_UTILITY[kind]?.(name) ?? null;

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
  const parts = [`/* ${GENERATED_NOTE} */`, theme, ...utilities, RICH_TEXT_UTILITY, MOTION_CSS, ...variants, ...base];
  return `${parts.join('\n')}\n`;
}
