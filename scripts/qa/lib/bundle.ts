/**
 * Победитель каскада в СОБРАННЫХ бандлах — для замеров без браузера.
 *
 * Зачем модуль. «Класс есть в разметке» и «строка есть в CSS» не отвечают на
 * вопрос, что увидит покупатель: рядом лежат утилиты Tailwind, правила темы и
 * слои, и решает каскад. Считает его ОБЩИЙ движок
 * `src/themes/__tests__/lib/css-cascade.ts` (слои → специфичность → порядок →
 * инлайн); здесь — сборка бандла, переменные и перевод значения в пиксели.
 *
 * Два бандла, и путать их нельзя:
 *   • `dist/theme-css/<тема>.css` — то, что реально уедет на витрину;
 *   • `dist/preview-tailwind.css` — добавка превью конструктора. Класс, которого
 *     нет в первом, но есть во втором, в конструкторе «работает», а у
 *     покупателя нет: ровно так vanilla показывала зазор 16px вместо живых 40.
 */
import { themeCss, previewCss, rulesOf, cssVars, type Rule, type MatchableElement } from "./tailwind-css";
import { winnerIn } from "./tailwind-css";

export type Bundle = {
  label: string;
  css: string;
  rules: Rule[];
  vars: Record<string, string>;
};

const cache = new Map<string, Bundle>();

/**
 * Бандл темы. `withPreview` подмешивает CSS превью ПЕРЕД темой (тема сильнее,
 * как и в конструкторе).
 */
export function loadBundle(theme: string, opts: { withPreview?: boolean } = {}): Bundle {
  const withPreview = opts.withPreview ?? false;
  const key = `${theme}/${withPreview}`;
  const ready = cache.get(key);
  if (ready) return ready;
  const css = withPreview ? `${previewCss()}\n${themeCss(theme)}` : themeCss(theme);
  const bundle: Bundle = {
    label: key,
    css,
    rules: rulesOf(css, key),
    vars: cssVars(css, key),
  };
  cache.set(key, bundle);
  return bundle;
}

/** Победившее правило для свойства на узле при ширине окна. */
export const winnerFor = (
  b: Bundle,
  el: MatchableElement,
  prop: string,
  widthPx: number,
): Rule | null => winnerIn(b.css, b.rules, el, prop, widthPx);

/**
 * Первое из свойств-синонимов, у которого есть победитель
 * (`column-gap` и `gap`, `flex-grow` и `flex`).
 */
export function declaredValue(
  b: Bundle,
  el: MatchableElement,
  props: readonly string[],
  widthPx: number,
): { prop: string; value: string; selector: string } | null {
  for (const prop of props) {
    const rule = winnerFor(b, el, prop, widthPx);
    if (rule) return { prop, value: rule.decls[prop], selector: rule.selector };
  }
  return null;
}

/**
 * Значение CSS в пикселях. `null` — «предела нет» (none/normal/auto) либо
 * значение не число (проценты, fr, calc с процентами).
 */
export function toPx(b: Bundle, raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let v = raw.trim().replace(/\s*!\s*important\s*$/i, "");
  for (let i = 0; i < 6 && /var\(/.test(v); i++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_all, name: string, fb: string) =>
      b.vars[name] !== undefined ? b.vars[name] : (fb ?? "0"),
    );
  }
  if (/^(none|normal|auto)$/.test(v)) return null;
  const calc = /^calc\(\s*([\d.]+)(rem|px)?\s*\*\s*([\d.]+)\s*\)$/.exec(v);
  if (calc) {
    const unit = calc[2] === "px" ? 1 : 16;
    return Number(calc[1]) * unit * Number(calc[3]);
  }
  const num = /^([\d.]+)(px|rem)?$/.exec(v);
  if (num) return Number(num[1]) * (num[2] === "rem" ? 16 : 1);
  return null;
}

/** Удобная пара: значение свойства узла в пикселях. */
export const pxOf = (
  b: Bundle,
  el: MatchableElement,
  props: readonly string[],
  widthPx: number,
): number | null => toPx(b, declaredValue(b, el, props, widthPx)?.value ?? null);
