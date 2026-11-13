import type { KitPlan } from './bundle';

// Что странице нужно из поведений и анимаций SDK (блок 6, часть 6б, Р6б-2): по HTML секций страницы и текстам их
// скриптов. Имена поведений — только те, что есть в dist/behaviors (known, порядок каталога); остальные игнорируются:
// на сохранении это отказ (storefront-sections), на странице часть behaviors пишет «такого нет в каталоге SDK».
const BEHAVIOR_ATTRIBUTE = /\bdata-behavior\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/g;
const ANIMATE_ATTRIBUTE = /\bdata-animate\b/;
// ctx.animate, ctx.split и ctx.on(…, 'pointermove') (12.11) — провайдеры одного файла animate.js; split ловим только как
// ctx.split, голое слово встречается у строк (text.split(',')).
const ANIMATE_CALL = /\banimate\b|\bctx\s*\.\s*split\b|\bpointermove\b/;
// 13.11, часть 2б спеки анимаций: ctx.scroll — файл scroll.js по слову scroll (ложное срабатывание на ctx.on(…, 'scroll')
// стоит 4 КБ — допустимо), ctx.inView — in-view.js по слову inView.
const SCROLL_CALL = /\bscroll\b/;
const IN_VIEW_CALL = /\binView\b/;
// 13.11, часть 2в: библиотеки каталога — по "lib:<имя>" в uses секций страницы (точное объявление, не по тексту).
export const LIB_USE_PREFIX = 'lib:';

const namesIn = (text: string): string[] =>
  [...text.matchAll(BEHAVIOR_ATTRIBUTE)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');

// Библиотеки из uses секций страницы, которые есть в сборке ядра (knownLibs, порядок сборки).
export const libsOf = (knownLibs: readonly string[], uses: readonly string[]): string[] =>
  knownLibs.filter((name) => uses.includes(`${LIB_USE_PREFIX}${name}`));

// scroll, inView и libs — только когда нужны: у страниц без них план (и бандл) прежний.
export function kitPlanOf(
  known: readonly string[],
  html: readonly string[],
  scripts: readonly string[],
  libs: readonly string[] = [],
): KitPlan {
  const texts = [...html, ...scripts];
  const found = new Set(texts.flatMap(namesIn));
  const scroll = scripts.some((text) => SCROLL_CALL.test(text));
  const inView = scripts.some((text) => IN_VIEW_CALL.test(text));
  return {
    behaviors: known.filter((name) => found.has(name)),
    reveal: texts.some((text) => ANIMATE_ATTRIBUTE.test(text)),
    animate: scripts.some((text) => ANIMATE_CALL.test(text)),
    ...(scroll ? { scroll } : {}),
    ...(inView ? { inView } : {}),
    ...(libs.length > 0 ? { libs } : {}),
  };
}
