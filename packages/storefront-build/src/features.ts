import type { KitPlan } from './bundle';

// Что странице нужно из поведений и анимаций SDK (блок 6, часть 6б, Р6б-2): по HTML секций страницы и текстам их
// скриптов. Имена поведений — только те, что есть в dist/behaviors (known, порядок каталога); остальные игнорируются:
// на сохранении это отказ (storefront-sections), на странице часть behaviors пишет «такого нет в каталоге SDK».
const BEHAVIOR_ATTRIBUTE = /\bdata-behavior\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/g;
const ANIMATE_ATTRIBUTE = /\bdata-animate\b/;
// ctx.animate, ctx.split и ctx.on(…, 'pointermove') (12.11) — провайдеры одного файла animate.js; split ловим только как
// ctx.split, голое слово встречается у строк (text.split(',')).
const ANIMATE_CALL = /\banimate\b|\bctx\s*\.\s*split\b|\bpointermove\b/;

const namesIn = (text: string): string[] =>
  [...text.matchAll(BEHAVIOR_ATTRIBUTE)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');

export function kitPlanOf(known: readonly string[], html: readonly string[], scripts: readonly string[]): KitPlan {
  const texts = [...html, ...scripts];
  const found = new Set(texts.flatMap(namesIn));
  return {
    behaviors: known.filter((name) => found.has(name)),
    reveal: texts.some((text) => ANIMATE_ATTRIBUTE.test(text)),
    animate: scripts.some((text) => ANIMATE_CALL.test(text)),
  };
}
