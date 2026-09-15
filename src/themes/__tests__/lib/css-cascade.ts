/**
 * Мини-каскад CSS для гардов: кто РЕАЛЬНО побеждает в бандле темы.
 *
 * Общий движок для проверок, которым мало «правило есть в файле». Правило может
 * быть — и быть перебитым утилитой Tailwind, чужим слоем или соседней копией из
 * другого места. Поэтому здесь считается победитель ровно тем порядком, что и в
 * браузере: слой → специфичность → порядок в файле.
 *
 * Вынесено из src/themes/__tests__/catalog-filters-mobile.spec.ts (гард фильтров
 * каталога) при починке пустого каталога на 375px: второму гарду понадобился тот
 * же движок, и заводить его копию было бы ровно той болезнью, которую чинили —
 * дублем правила в двух местах, который потом разъезжается.
 *
 * Единственное отличие от исходной версии: ширина окна стала ПАРАМЕТРОМ
 * (была модульной константой 375). Гарду раскладок нужны обе — 375 и 1280.
 */

export type Rule = {
  selector: string;
  decls: Record<string, string>;
  layer: string;
  atRules: string[];
  order: number;
};

/** Минимальный интерфейс узла, который нужен каскаду (node-html-parser подходит). */
export interface MatchableElement {
  matches(selector: string): boolean;
}

/**
 * Комментарии — вон до разбора.
 *
 * Иначе `/* … *\/` перед `@media` прилипает к прелюдии, блок перестаёт быть
 * at-правилом и разбирается как селектор: на исходнике общего файла (Lightning
 * CSS комментарии из бандла вырезает, а из исходника — нет) проверка слоя
 * находила ноль правил. Кавычки уважаем: в `content: "/*"` это не комментарий.
 */
export function stripComments(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const e = css.indexOf("*/", i + 2);
      i = e < 0 ? css.length : e + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      while (j < css.length && css[j] !== q) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, Math.min(j + 1, css.length));
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Разбор бандла в плоский список правил с их слоем и at-обёртками. */
export function parseRules(cssRaw: string): Rule[] {
  const css = stripComments(cssRaw);
  const rules: Rule[] = [];
  let order = 0;

  const walk = (text: string, base: number, layer: string, ats: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      // тело блока
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const prelude = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (prelude.startsWith("@layer")) {
        walk(body, base + open + 1, prelude.slice(6).trim(), ats);
      } else if (prelude.startsWith("@")) {
        walk(body, base + open + 1, layer, [...ats, prelude]);
      } else if (prelude) {
        const decls: Record<string, string> = {};
        for (const part of body.split(";")) {
          const k = part.indexOf(":");
          if (k < 0) continue;
          const prop = part.slice(0, k).trim();
          if (!prop || prop.startsWith("@") || part.includes("{")) continue;
          decls[prop] = part.slice(k + 1).trim();
        }
        for (const sel of prelude.split(","))
          rules.push({
            selector: sel.trim(),
            decls,
            layer,
            atRules: ats,
            order: order++,
          });
      }
      i = j;
    }
  };

  walk(css, 0, "UNLAYERED", []);
  return rules;
}

/**
 * Применима ли at-обёртка при ширине окна `widthPx` (палец = узкий экран).
 *
 * Неизвестное медиа-условие — не «пропустить», а упасть: молча пропущенный
 * конкурент сделал бы проверку зелёной там, где правило перебито.
 */
export function atRuleApplies(at: string, widthPx: number): boolean {
  if (at.startsWith("@supports")) return true; // современный Chromium
  if (!at.startsWith("@media")) {
    throw new Error(`неизвестная at-обёртка: ${at}`);
  }
  const query = at.slice(6).replace(/\{$/, "").trim();
  const coarse = widthPx < 768; // узкий экран меряем как тач
  return query.split(",").some((clause) => {
    const conds = clause.match(/\([^()]*\)/g) ?? [];
    if (conds.length === 0) return false;
    return conds.every((cond) => {
      const c = cond.slice(1, -1).trim();
      let m: RegExpMatchArray | null;
      const px = (v: string) =>
        v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v);
      if ((m = c.match(/^max-width:\s*([\d.]+(?:px|rem))$/)))
        return widthPx <= px(m[1]);
      if ((m = c.match(/^min-width:\s*([\d.]+(?:px|rem))$/)))
        return widthPx >= px(m[1]);
      if ((m = c.match(/^width\s*>=\s*([\d.]+(?:px|rem))$/)))
        return widthPx >= px(m[1]);
      if ((m = c.match(/^width\s*<\s*([\d.]+(?:px|rem))$/)))
        return widthPx < px(m[1]);
      if ((m = c.match(/^pointer:\s*(\w+)$/)))
        return m[1] === (coarse ? "coarse" : "fine");
      if ((m = c.match(/^hover:\s*(\w+)$/)))
        return m[1] === (coarse ? "none" : "hover");
      if (c.startsWith("prefers-reduced-motion")) return true;
      if (c.startsWith("prefers-color-scheme")) return c.includes("light");
      throw new Error(`неизвестное медиа-условие: ${c} (в ${at})`);
    });
  });
}

/** Специфичность селектора: [id, класс/атрибут/псевдокласс, элемент]. */
export function specificity(selector: string): [number, number, number] {
  // :not(X) / :is(X) сами не считаются, считается их аргумент
  const inner = selector.replace(/:(?:not|is|has)\(([^()]*)\)/g, " $1 ");
  const ids = (inner.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (inner.match(/(?<!\\)\.(?:\\.|[\w-])+/g) ?? []).length +
    (inner.match(/(?<!\\)\[[^\]]*\]/g) ?? []).length +
    (inner.match(/(?<!:):(?!:)[a-z-]+/g) ?? []).length;
  const elements = (
    inner
      .replace(/(?<!\\)\[[^\]]*\]/g, " ")
      .match(/(?:^|[\s>+~])([a-z][\w-]*)/g) ?? []
  ).length;
  return [ids, classes, elements];
}

/**
 * Порядок слоёв бандла. Чем позже слой — тем он сильнее; unlayered сильнее
 * ЛЮБОГО слоя.
 *
 * Объявлений НЕСКОЛЬКО и считать надо все по порядку: Tailwind печатает
 * `@layer properties;`, и только следующей строкой `@layer theme, base,
 * components, utilities;`. Первая версия брала первое объявление — в списке
 * оказывался один `properties`, и `base`/`utilities` получали одинаковый ранг
 * −1. Саботаж «перенести правила в @layer base» тогда оставался ЗЕЛЁНЫМ:
 * ничья по слою отдавала победу специфичности, а в браузере выиграла бы
 * утилита `.top-full`. Имена слоёв, объявленные только блоком `@layer X {`,
 * дописываем в порядке появления — так их и упорядочивает браузер.
 */
export function layerOrder(css: string): string[] {
  const order: string[] = [];
  const add = (name: string) => {
    const n = name.trim();
    if (n && !order.includes(n)) order.push(n);
  };
  const re = /@layer\s+([a-z0-9_,\s-]+)([;{])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) m[1].split(",").forEach(add);
  return order;
}

export function layerRank(css: string, layer: string): number {
  if (layer === "UNLAYERED") return Number.MAX_SAFE_INTEGER;
  const i = layerOrder(css).indexOf(layer);
  return i < 0 ? -1 : i;
}

/**
 * Победитель каскада для свойства на конкретном узле при ширине `widthPx`:
 * слой → специфичность → порядок в файле. Ровно этим порядком считает браузер.
 */
export function winnerIn(
  css: string,
  rules: Rule[],
  el: MatchableElement,
  prop: string,
  widthPx: number,
): Rule | null {
  const matched = rules.filter((r) => {
    if (!(prop in r.decls)) return false;
    if (!r.atRules.every((at) => atRuleApplies(at, widthPx))) return false;
    try {
      return el.matches(r.selector);
    } catch {
      return false;
    }
  });
  if (matched.length === 0) return null;
  const weight = (r: Rule): number[] => [
    layerRank(css, r.layer),
    ...specificity(r.selector),
    r.order,
  ];
  return matched.reduce((best, r) => {
    const a = weight(r);
    const b = weight(best);
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) return a[i] > b[i] ? r : best;
    return best;
  });
}
