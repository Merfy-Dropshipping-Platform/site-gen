/**
 * «Шрифт из настроек темы» по каскаду CSS витрины — общая мерка гардов шрифта.
 *
 * Владелец 23.09: «надо нормально сделать как в настройках темы сделано»,
 * «надо из настроек темы». Надпись пишется шрифтом из «Настроек темы»
 * (Типографика), если:
 *   • победитель каскада у неё или у предка, от которого она наследует, —
 *     `var(--font-body…)` / `var(--font-heading…)`: эти переменные пишет
 *     tokens-css.ts из настроек (класс роли темы тоже годится: у flux
 *     `.font-manrope` = `var(--font-body, "Manrope", …)`); или
 *   • её шрифт по умолчанию совпадает со шрифтом темы для этой роли, а выбор
 *     мерчанта доходит до неё правилом-перекрытием tokens-css (`main
 *     button[class]`, `main h1[class]` и т. п.). Так устроены кнопки satin
 *     (`.satin-button`) и заголовок vanilla. Селекторы перекрытия берутся из
 *     настоящего вывода tokens-css, а не копией.
 *
 * CSS витрины = dist/theme-css/<тема>.css плюс `<style>`, которые принёс
 * рендер блока (у bloom в нём, например, правило подзаголовка каталога).
 *
 * Вынесено из catalog-font.spec.ts, когда та же мерка понадобилась гарду
 * шапки, корзины и подвала.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../../tokens-css";
import { parseRules, winnerIn, type Rule } from "./css-cascade";

/** Чем написан узел и кто это задал: он сам или предок, от которого наследует. */
export type Действующее = { значение: string; откуда: Element | null };

export type Роль = {
  переменная: string;
  поУмолчанию: string;
  перекрытие: string;
};

/** Первое семейство шрифта из значения `font-family` («'Inter', sans-serif» → inter). */
export const первое = (значение: string) =>
  значение.split(",")[0].replace(/["']/g, "").trim().toLowerCase();

const SITES_ROOT = resolve(__dirname, "..", "..", "..", "..");

export function мерка(тема: string) {
  const cssТемы = readFileSync(
    resolve(SITES_ROOT, "dist", "theme-css", `${тема}.css`),
    "utf-8",
  );
  let css = cssТемы;
  let правила: Rule[] = parseRules(css);

  // Шрифты и жирность темы по умолчанию — как их пишет tokens-css без выбора
  // мерчанта. Перекрытия пишутся, только когда шрифт выбран, — берём их
  // селекторы из вывода с выбором.
  const поУмолчанию = buildTokensCss({} as never, тема);
  const поУмолчаниюИз = (переменная: string) =>
    new RegExp(`${переменная}:\\s*([^;]+);`).exec(поУмолчанию)?.[1].trim() ??
    "";
  const перекрытия = parseRules(
    buildTokensCss(
      {
        bodyFont: "Courier New",
        headingFont: "Georgia",
        bodyWeight: 700,
      } as never,
      тема,
    ),
  );
  const перекрытие = (свойство: string, переменная: string) =>
    перекрытия
      .filter((r) =>
        new RegExp(`var\\(${переменная}\\)\\s*!important`).test(
          r.decls[свойство] ?? "",
        ),
      )
      .map((r) => r.selector)
      .join(", ");

  const РОЛИ = {
    текст: {
      переменная: "--font-body",
      поУмолчанию: первое(поУмолчаниюИз("--font-body")),
      перекрытие: перекрытие("font-family", "--font-body"),
    },
    заголовок: {
      переменная: "--font-heading",
      поУмолчанию: первое(поУмолчаниюИз("--font-heading")),
      перекрытие: перекрытие("font-family", "--font-heading"),
    },
    жирность: {
      переменная: "--weight-body",
      поУмолчанию: поУмолчаниюИз("--weight-body"),
      перекрытие: перекрытие("font-weight", "--weight-body"),
    },
  } satisfies Record<string, Роль>;

  /** Добавить к CSS темы `<style>`, которые рендер положил в страницу. */
  function взятьCssСтраницы(): void {
    const свои = [...document.querySelectorAll("body style")]
      .map((st) => st.textContent ?? "")
      .join("\n");
    css = `${cssТемы}\n${свои}`;
    правила = parseRules(css);
  }

  function действующее(el: Element, свойство: string): Действующее {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const значение = winnerIn(css, правила, e, свойство, 1280)
        ?.decls[свойство]?.replace(/\s*!important\s*$/i, "")
        .trim();
      if (значение && значение !== "inherit") return { значение, откуда: e };
    }
    return { значение: "не задано", откуда: null };
  }

  /** Значение переменной темы на :root (`var(--font-nt-ui)` → «"Arsenal", …»). */
  function раскрыть(значение: string): string {
    const имя = /^var\((--[\w-]+)/.exec(значение)?.[1];
    if (!имя) return значение;
    return (
      winnerIn(css, правила, document.documentElement, имя, 1280)?.decls[имя] ??
      значение
    );
  }

  function изНастроек(
    x: Действующее,
    роль: Роль,
    привести: (v: string) => string = первое,
  ): boolean {
    if (new RegExp(`^var\\(${роль.переменная}\\s*[,)]`).test(x.значение))
      return true;
    const доходит =
      !!x.откуда && !!роль.перекрытие && x.откуда.matches(роль.перекрытие);
    return доходит && привести(раскрыть(x.значение)) === роль.поУмолчанию;
  }

  /**
   * Дойдёт ли выбор мерчанта до узла: правило-перекрытие tokens-css (оно с
   * `!important`) совпадает с самим узлом, или узел наследует от предка, до
   * которого перекрытие дошло. Своё обычное правило узла (жирность макета и
   * т. п.) наследование останавливает — такой узел выбор мерчанта не видит,
   * если только само правило не берёт значение из той же переменной настроек.
   */
  function доходитВыбор(el: Element, свойство: string, роль: Роль): boolean {
    const изПеременной = new RegExp(`^var\\(${роль.переменная}\\s*[,)]`);
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (роль.перекрытие && e.matches(роль.перекрытие)) return true;
      const своё = winnerIn(css, правила, e, свойство, 1280)
        ?.decls[свойство]?.replace(/\s*!important\s*$/i, "")
        .trim();
      if (своё === undefined || своё === "inherit") continue;
      return изПеременной.test(своё);
    }
    return false;
  }

  return { РОЛИ, взятьCssСтраницы, действующее, изНастроек, доходитВыбор };
}

/** Надписи: узлы со своим текстом и поля цены. */
export function надписи(корни: Iterable<Element>): Element[] {
  const узлы = new Set<Element>();
  for (const f of корни)
    for (const el of [f, ...f.querySelectorAll("*")]) узлы.add(el);
  return [...узлы].filter(
    (el) =>
      [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      ) || el.matches("input[data-price-input]"),
  );
}

/** Короткая подпись узла для отчёта гарда. */
export const подписьУзла = (el: Element) =>
  (
    (el.textContent ?? "").trim() ||
    el.getAttribute("placeholder") ||
    el.tagName
  ).slice(0, 24);
