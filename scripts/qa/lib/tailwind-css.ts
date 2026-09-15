/**
 * Собранный CSS темы: как в нём искать класс и что за ним стоит.
 *
 * Зачем модуль. Три агента за один день независимо поймали одну и ту же
 * ловушку: искали класс в `dist/theme-css/<тема>.css` наивной подстрокой,
 * получали «0 вхождений» и писали в отчёт баг, которого нет. Tailwind печатает
 * селектор ЭКРАНИРОВАННЫМ — `.bg-\[rgb\(var\(--color-button-bg\,0_0_0\)\)\]`, —
 * и запятая, скобки и квадратные скобки в нём идут со слэшем.
 *
 * Разбор бандла делает ОБЩИЙ движок `src/themes/__tests__/lib/css-cascade.ts`
 * (слои → специфичность → порядок → инлайн). Здесь только то, чего в нём нет:
 * экранирование имени класса, список имён классов бандла и «какая переменная
 * стоит за утилитой».
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseRules,
  winnerIn,
  layerRank,
  type Rule,
  type MatchableElement,
} from "../../../src/themes/__tests__/lib/css-cascade";

export { parseRules, winnerIn, layerRank };
export type { Rule, MatchableElement };

export const SITES_ROOT = resolve(__dirname, "..", "..", "..");

/**
 * Имя класса → селектор РОВНО в том виде, в каком его печатает Tailwind.
 *
 * Две ловушки разом:
 *   1) спецсимволы экранируются слэшем — в файле лежит
 *      `.bg-\[rgb\(var\(--color-button-bg\,0_0_0\)\)\]`, и наивный
 *      `css.includes('.bg-[rgb(var(--color-button-bg,0 0 0))]')` даёт 0 вхождений;
 *   2) ИМЯ, НАЧИНАЮЩЕЕСЯ С ЦИФРЫ, печатается CSS-кодом символа с пробелом-
 *      терминатором: `2xl:px-[300px]` → `.\32 xl\:px-\[300px\]`. Без этого
 *      каждая утилита брейкпоинта `2xl:` читалась как «класса нет в бандле» —
 *      то есть зонд сам выдумывал классы-призраки (поймано саботажем 15.09).
 */
export const classSelector = (cls: string): string => {
  const escaped = cls.replace(/[.[\]()#/%,:!*+~='"^$&{}|<>?\\]/g, (ch) => `\\${ch}`);
  return /^[0-9]/.test(escaped)
    ? `.\\3${escaped[0]} ${escaped.slice(1)}`
    : `.${escaped}`;
};

/**
 * Обратная операция: селектор → имя класса.
 *
 * Разбирает и обычное экранирование (`\:` → `:`), и CSS-код символа
 * (`\32 ` → `2`). Без второго `.\32 xl\:px-\[300px\]` превращался в
 * «32xl:px-[300px]», и настоящий класс не находился.
 */
export const unescapeIdent = (s: string): string =>
  s
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/\\(.)/g, "$1");

/** Строка → безопасная для RegExp. */
export const forRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Собранный CSS темы. Нет файла — падаем громко, а не меряем пустоту. */
export function themeCss(theme: string, root = SITES_ROOT): string {
  const path = resolve(root, "dist", "theme-css", `${theme}.css`);
  if (!existsSync(path)) {
    throw new Error(`нет ${path} — нужен pnpm build:theme-sections:all`);
  }
  return readFileSync(path, "utf8");
}

/** CSS превью-конструктора (им подменяются недостающие утилиты темы). */
export function previewCss(root = SITES_ROOT): string {
  const path = resolve(root, "dist", "preview-tailwind.css");
  if (!existsSync(path)) {
    throw new Error(`нет ${path} — нужен pnpm build:preview-tailwind`);
  }
  return readFileSync(path, "utf8");
}

/**
 * Имя класса внутри селектора. Код символа (`\32 `) разбирается ПЕРВЫМ
 * вариантом — иначе `\\.` откусил бы от него только `\3`.
 */
export const CLASS_IN_SELECTOR = /\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[^.\s:[>+~(),#])+)/g;

const namesCache = new WeakMap<object, Set<string>>();
const rulesCache = new Map<string, Rule[]>();

/** Разбор бандла с памятью: один и тот же текст не парсится дважды. */
export function rulesOf(css: string, key?: string): Rule[] {
  const k = key ?? `len:${css.length}:${css.slice(0, 64)}`;
  const ready = rulesCache.get(k);
  if (ready) return ready;
  const rules = parseRules(css);
  rulesCache.set(k, rules);
  return rules;
}

/**
 * Все имена классов, которые бандл РЕАЛЬНО объявляет (экранирование снято).
 *
 * Считаем по селекторам разобранных правил, а не по сырому тексту: в сыром
 * тексте `.5` из `0.5rem` сходит за класс, и «призрак» перестаёт находиться.
 */
export function bundleClassNames(css: string, key?: string): Set<string> {
  const rules = rulesOf(css, key);
  const cached = namesCache.get(rules as unknown as object);
  if (cached) return cached;
  const names = new Set<string>();
  for (const r of rules) {
    for (const m of r.selector.match(CLASS_IN_SELECTOR) ?? []) {
      names.add(unescapeIdent(m.slice(1)));
    }
  }
  namesCache.set(rules as unknown as object, names);
  return names;
}

/** Есть ли класс в бандле (с учётом экранирования Tailwind). */
export const classInBundle = (css: string, cls: string): boolean =>
  bundleClassNames(css).has(cls);

/**
 * Имена-маркеры: не утилиты, а якоря разметки. Их отсутствие в CSS — норма.
 */
export const MARKER_CLASSES =
  /^(group|peer|sr-only|color-scheme-[0-9]+|[a-z]+-(pad|page)|swiper[a-z-]*)$/;

/**
 * Классы-призраки: стоят в разметке, а правила в СОБСТВЕННОМ бандле темы нет.
 *
 * Это тихий ноль: на витрине другого CSS нет, а в превью недостающий класс
 * подменяется соседним из preview-tailwind.css — конструктор показывает не то,
 * что увидит покупатель.
 */
export function phantomClasses(
  css: string,
  classes: readonly string[],
  opts: { ignore?: RegExp } = {},
): string[] {
  const known = bundleClassNames(css);
  const ignore = opts.ignore ?? MARKER_CLASSES;
  return [
    ...new Set(classes.filter((c) => !ignore.test(c) && !known.has(c))),
  ];
}

/**
 * Переменная, из которой браузер возьмёт цвет узла с такими классами.
 *
 * Классы перебираются с конца: последний объявленный в файле выигрывает каскад.
 * Варианты (`hover:`, `md:`, `2xl:`) пропускаются — это не базовое состояние
 * (без фильтра `hover:bg-[…]` выигрывал у обычного `bg-[…]`, и «фон кнопки»
 * читался как цвет НАВЕДЕНИЯ).
 *
 * Литерал без `var()` возвращает `token: null` — это и есть «краска намертво».
 */
export function declaredVar(
  css: string,
  classes: readonly string[],
  prop: "background-color" | "color" | "border-color" | string,
): { cls: string; token: string | null } {
  for (const cls of [...classes].reverse()) {
    if (cls.includes(":")) continue;
    const rule = new RegExp(
      `${forRegExp(classSelector(cls))}\\s*\\{([^}]*)\\}`,
    ).exec(css);
    if (!rule) continue;
    // Граница объявления обязательна: без неё `border-color:` сходит за `color:`.
    const decl = new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, "i").exec(rule[1]);
    if (!decl) continue;
    const v = /var\((--[a-z0-9-]+)/i.exec(decl[1]);
    return { cls, token: v ? v[1] : null };
  }
  throw new Error(
    `ни один класс не объявляет ${prop} в CSS темы: ${classes.join(" ")}`,
  );
}

/**
 * Значения CSS-переменных бандла (`@theme`, `:root`, любое правило).
 * Нужны, чтобы развернуть `var(--spacing)` в число при замере геометрии.
 */
export function cssVars(css: string, key?: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const r of rulesOf(css, key)) {
    for (const [k, v] of Object.entries(r.decls)) {
      if (k.startsWith("--")) vars[k] = v;
    }
  }
  return vars;
}
