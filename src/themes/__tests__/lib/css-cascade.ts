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
 *
 * Дополнено при переезде третьего гарда (строки фильтров, 2026-09-15) — три
 * способности пришли из его собственной копии движка и теперь общие:
 *   1. `splitSelectorList` — запятые внутри `:is(…)`/`:not(…)` НЕ разделители.
 *      Наивный `split(",")` рвал `:is(p, li, …)` на куски вроде `li)`, узел на
 *      них не матчится, правило молча исчезало из конкурентов — проверка
 *      зеленела там, где в браузере победил бы кто-то другой;
 *   2. специфичность `:is()/:not()/:has()` считается по САМОМУ СИЛЬНОМУ
 *      аргументу (как в спецификации), а не суммой всех;
 *   3. атрибут `style` узла участвует в каскаде. Инлайн сильнее любого правила
 *      без `!important` — без этого саботаж `style="top:100%"` на пяти панелях
 *      flux оставлял гард фильтров 52/52 зелёными (дыра F2, найденная его же
 *      автором). Победивший инлайн возвращается правилом с селектором
 *      `INLINE_SELECTOR`: проверки «победил ли общий файл» его не спутают с
 *      правилом.
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
  /** Атрибут узла. Нужен для `style`; node-html-parser отдаёт `string | undefined`. */
  getAttribute?(name: string): string | undefined | null;
}

/** Селектор синтетического правила, которым возвращается победивший инлайн-стиль. */
export const INLINE_SELECTOR = "style=";

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
    // Экранированный символ — как есть, вместе со слэшем. Иначе `\'` внутри
    // СЕЛЕКТОРА (tailwind пишет `.after\:content-\[\'\'\]`) читается как
    // открывающая кавычка, и разбор глотает весь остаток файла до следующей
    // кавычки. Ровно так терялись все адаптивные утилиты после этого места.
    if (ch === "\\") {
      out += css.slice(i, i + 2);
      i += 2;
      continue;
    }
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

/**
 * Разбить список селекторов по запятым ВЕРХНЕГО уровня.
 *
 * Наивный `split(",")` рвал бы `:is(p, li, …)` на куски вроде `li)` — правило
 * получило бы бессмысленный селектор, узел на нём не сматчился бы, и конкурент
 * молча исчез бы из каскада. Молчаливая потеря конкурента красит проверку
 * зелёным ровно там, где она должна была бы упасть.
 */
export function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  let escaped = false;
  for (const ch of prelude) {
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      cur += ch;
      escaped = true;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Тело блока → свои объявления и вложенные блоки (без рекурсии).
 *
 * Делит по верхнему уровню вложенности, уважая строки и скобки: `content: "{"`
 * и `grid-template-columns: repeat(var(--cols), minmax(0, 1fr))` не должны
 * считаться началом блока.
 */
function splitBody(body: string): {
  decls: string[];
  blocks: { prelude: string; body: string }[];
} {
  const decls: string[] = [];
  const blocks: { prelude: string; body: string }[] = [];
  let cur = "";
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    // Экранированный символ проходит насквозь: `\'`, `\(`, `\[` в селекторах
    // tailwind не открывают ни строку, ни скобочную группу.
    if (ch === "\\") {
      cur += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      cur += ch;
      i++;
      while (i < body.length && body[i] !== q) {
        if (body[i] === "\\") {
          cur += body[i];
          i++;
        }
        cur += body[i];
        i++;
      }
      cur += body[i] ?? "";
      i++;
      continue;
    }
    if (ch === "(") {
      let depth = 1;
      cur += ch;
      i++;
      while (i < body.length && depth > 0) {
        if (body[i] === "(") depth++;
        else if (body[i] === ")") depth--;
        cur += body[i];
        i++;
      }
      continue;
    }
    if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
        j++;
      }
      blocks.push({ prelude: cur.trim(), body: body.slice(i + 1, j - 1) });
      cur = "";
      i = j;
      continue;
    }
    if (ch === ";") {
      if (cur.trim()) decls.push(cur.trim());
      cur = "";
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) decls.push(cur.trim());
  return { decls, blocks };
}

/**
 * Вложенный селектор → абсолютный: `&` заменяется родителем, а селектор без
 * `&` читается как потомок (так же, как это делает браузер в CSS Nesting).
 */
function resolveNested(parent: string | null, child: string): string {
  if (!parent) return child.replace(/&/g, "").trim() || child;
  if (child.includes("&")) return child.replace(/&/g, parent);
  return `${parent} ${child}`;
}

/**
 * Разбор бандла в плоский список правил с их слоем и at-обёртками.
 *
 * Вложенность (CSS Nesting) разворачивается наравне с обёртками снаружи.
 * Это не украшение: Tailwind v4 пишет ВЕСЬ адаптив вложенно —
 *   `.md\:px-20 { @media (width >= 48rem) { padding-inline: … } }`
 * — и прежняя версия, разбиравшая только `@media { .sel { … } }`, теряла их
 * все до одного (в dist/theme-css/flux.css таких блоков 423). Правило
 * записывалось с ПУСТЫМ набором объявлений, из конкурентов молча исчезало, и
 * `winnerIn` отдавал победу неадаптивной утилите: замер бокового поля на окне
 * 768 показывал 16 px вместо 80 — то есть движок отвечал за браузер неверно и
 * тем самым зеленил саботаж «сдвинуть отступ адаптивным классом».
 */
export function parseRules(cssRaw: string): Rule[] {
  const css = stripComments(cssRaw);
  const rules: Rule[] = [];
  let order = 0;

  const emit = (
    body: string,
    layer: string,
    ats: string[],
    sel: string | null,
  ): void => {
    const { decls: rawDecls, blocks } = splitBody(body);
    if (sel && rawDecls.length > 0) {
      const decls: Record<string, string> = {};
      for (const part of rawDecls) {
        const k = part.indexOf(":");
        if (k < 0) continue;
        const prop = part.slice(0, k).trim();
        if (!prop || prop.startsWith("@")) continue;
        decls[prop] = part.slice(k + 1).trim();
      }
      if (Object.keys(decls).length > 0) {
        for (const one of splitSelectorList(sel))
          rules.push({
            selector: one,
            decls,
            layer,
            atRules: ats,
            order: order++,
          });
      }
    }
    for (const b of blocks) {
      if (!b.prelude) continue;
      if (b.prelude.startsWith("@layer")) {
        emit(b.body, b.prelude.slice(6).trim(), ats, sel);
      } else if (b.prelude.startsWith("@")) {
        emit(b.body, layer, [...ats, b.prelude], sel);
      } else {
        for (const one of splitSelectorList(b.prelude))
          emit(b.body, layer, ats, resolveNested(sel, one));
      }
    }
  };

  emit(css, "UNLAYERED", [], null);
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
  // Style-запрос контейнера (`@container style(--card-style: standard)`)
  // вычислить нельзя: он зависит от значения кастомного свойства на предке, а
  // движок меряет каскад без реального дерева стилей. Считаем НЕприменимым —
  // то есть меряем базовое значение, без контейнерного override.
  //
  // Почему это не «молча пропустить конкурента»: такие правила у нас адресуют
  // СВОИ узлы (у flux — `[data-nt="flux-product-card"]`), и до сравнения
  // селекторов дело даже не доходило — обёртка роняла весь замер исключением.
  // Если однажды контейнерный запрос начнёт править измеряемый узел, это
  // придётся считать честно, а не расширять исключение.
  if (at.startsWith("@container")) return false;
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

/**
 * Специфичность селектора: [id, класс/атрибут/псевдокласс, элемент].
 *
 * У `:is()/:not()/:has()` сам псевдокласс не считается, а считается САМЫЙ
 * СИЛЬНЫЙ аргумент (так в спецификации). Прежняя версия подставляла весь список
 * аргументов и складывала их: `:is(p, li, label, button, a, [data-nt=…] > div)`
 * получал шесть элементов вместо одного атрибута с элементом — вес правила
 * оказывался завышен, и оно «побеждало» в тесте того, кого в браузере
 * проигрывает.
 */
export function specificity(selector: string): [number, number, number] {
  const inner = selector.replace(
    /:(?:not|is|has)\(([^()]*)\)/g,
    (_all, arg: string) => {
      const best = splitSelectorList(arg)
        .map((sel) => specificity(sel))
        .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] ?? [
        0, 0, 0,
      ];
      return ` ${"#i".repeat(best[0])}${".c".repeat(best[1])}${" e".repeat(best[2])} `;
    },
  );
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
 * Объявление свойства из атрибута `style`.
 *
 * Возвращает значение как есть (с `!important`, если он там был) или `null`.
 */
export function inlineDecl(style: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(style);
  return m ? m[1].trim() : null;
}

const isImportant = (value: string | undefined): boolean =>
  value !== undefined && /!\s*important\s*$/i.test(value);

/**
 * Победитель каскада для свойства на конкретном узле при ширине `widthPx`:
 * инлайн → слой → специфичность → порядок в файле. Ровно этим порядком считает
 * браузер.
 *
 * Инлайн проигрывает только правилу с `!important` (и своему `!important`
 * уступает тоже). Победивший инлайн отдаётся синтетическим правилом с
 * селектором `INLINE_SELECTOR` — вызывающий увидит, что победил не файл.
 */
export function winnerIn(
  css: string,
  rules: Rule[],
  el: MatchableElement,
  prop: string,
  widthPx: number,
): Rule | null {
  const inline = inlineDecl(el.getAttribute?.("style") ?? "", prop);
  const matched = rules.filter((r) => {
    if (!(prop in r.decls)) return false;
    if (!r.atRules.every((at) => atRuleApplies(at, widthPx))) return false;
    try {
      return el.matches(r.selector);
    } catch {
      return false;
    }
  });
  const asInline = (): Rule | null =>
    inline === null
      ? null
      : {
          selector: INLINE_SELECTOR,
          decls: { [prop]: inline },
          layer: "INLINE",
          atRules: [],
          order: -1,
        };
  if (matched.length === 0) return asInline();
  const weight = (r: Rule): number[] => [
    layerRank(css, r.layer),
    ...specificity(r.selector),
    r.order,
  ];
  const best = matched.reduce((acc, r) => {
    const a = weight(r);
    const b = weight(acc);
    for (let i = 0; i < a.length; i++)
      if (a[i] !== b[i]) return a[i] > b[i] ? r : acc;
    return acc;
  });
  // Инлайн сильнее правила без `!important`; правило с `!important` сильнее
  // обычного инлайна, но инлайн с `!important` сильнее и его.
  if (inline === null) return best;
  if (isImportant(inline) || !isImportant(best.decls[prop])) return asInline();
  return best;
}
