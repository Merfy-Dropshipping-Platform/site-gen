/**
 * @jest-environment jsdom
 *
 * Шрифт фильтров и сортировки каталога — из «Настроек темы».
 *
 * Владелец, 23.09, на вопрос «на макете Inter светлый, у нас в панели шрифт
 * темы — оставить?»: «надо нормально сделать как в настройках темы сделано».
 * То есть текст фильтров — шрифтом и жирностью ТЕКСТА из «Настроек темы»
 * (Типографика), как остальной текст магазина: по умолчанию шрифт темы
 * (rose Manrope, bloom Inter, satin Arsenal, flux Roboto Flex, vanilla
 * Arsenal), а выбрал мерчант другой — и фильтры следом.
 *
 * Было: у bloom, satin и flux строка, панели и шторка несли Manrope,
 * скопированный у rose, шторки — шрифт макета. В bloom текст темы — Inter, а
 * фильтры — Manrope; сменить их шрифт в настройках было нельзя.
 *
 * Проверка: секция темы с магазином, у которого есть коллекции и цвета (стенд
 * lib/catalog-dom.ts), скрипты отработали — в DOM и разметка порта, и пункты,
 * которые дорисовал скрипт. Для КАЖДОЙ надписи внутри фильтров (строка top,
 * боковая панель «Сбоку» и в шторке, блок коллекций, кнопка и шторка
 * «Фильтры и сортировка») считается, чем она будет написана в CSS ВИТРИНЫ
 * (dist/theme-css/<тема>.css): победитель каскада у неё или у ближайшего
 * предка, от которого она наследует. Надпись «из настроек», если:
 *   • ей прямо задан `var(--font-body)` / `var(--weight-body)` — переменные,
 *     которые пишет tokens-css.ts из «Настроек темы»; или
 *   • её шрифт по умолчанию совпадает со шрифтом текста темы, а выбор мерчанта
 *     доходит до неё правилом-перекрытием tokens-css (`main button[class]` и
 *     т. п.) — так устроены кнопки satin (`.satin-button`, общий класс кнопок
 *     магазина). Селектор перекрытия берётся из настоящего вывода tokens-css.
 *
 * Требует сборки: pnpm build:blocks && pnpm build:theme-sections:all
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildTokensCss } from "../tokens-css";
import { parseRules, winnerIn } from "./lib/css-cascade";
import {
  ТЕМЫ,
  type Магазин,
  показать,
  поставитьСтенд,
  снять,
} from "./lib/catalog-dom";

jest.setTimeout(60_000);
beforeAll(() => поставитьСтенд());
afterAll(() => снять());

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const МАГАЗИН: Магазин = {
  коллекции: [
    { id: "c1", title: "Новинки", slug: "novinki" },
    { id: "c2", title: "Лето", slug: "leto" },
  ],
  цвета: ["Черный", "Белый", "Серый"],
};

/** Где живут фильтры: строка top, панель, блок коллекций, кнопка и шторка. */
const ФИЛЬТРЫ = [
  '[data-nt="catalog-filters"]',
  '[data-nt="filter-sidebar"]',
  '[data-nt="catalog-collections-filter"]',
  "[data-filters-open]",
  "[data-filters-sheet]",
].join(", ");

/** Надписи фильтров: узлы со своим текстом и поля цены. */
function надписи(корень: HTMLElement): Element[] {
  const узлы = new Set<Element>();
  for (const f of корень.querySelectorAll(ФИЛЬТРЫ))
    for (const el of [f, ...f.querySelectorAll("*")]) узлы.add(el);
  return [...узлы].filter(
    (el) =>
      [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      ) || el.matches("input[data-price-input]"),
  );
}

/** Первое семейство шрифта из значения `font-family` («'Inter', sans-serif» → inter). */
const первое = (значение: string) =>
  значение.split(",")[0].replace(/["']/g, "").trim().toLowerCase();

describe.each(ТЕМЫ)("шрифт фильтров — из «Настроек темы» — %s", (тема) => {
  const css = readFileSync(
    resolve(SITES_ROOT, "dist", "theme-css", `${тема}.css`),
    "utf-8",
  );
  const правила = parseRules(css);

  // Шрифт и жирность текста темы по умолчанию — как их пишет tokens-css без
  // выбора мерчанта. Выбор мерчанта доходит до текста правилом-перекрытием:
  // оно пишется, только когда шрифт выбран, — берём его селекторы оттуда же.
  const поУмолчанию = buildTokensCss({} as never, тема);
  const поУмолчаниюШрифт = первое(
    /--font-body:\s*([^;]+);/.exec(поУмолчанию)?.[1] ?? "",
  );
  const поУмолчаниюЖирность =
    /--weight-body:\s*([^;]+);/.exec(поУмолчанию)?.[1].trim() ?? "";
  const перекрытие = parseRules(
    buildTokensCss({ bodyFont: "Courier New", bodyWeight: 700 } as never, тема),
  )
    .filter((r) =>
      /var\(--font-body\)\s*!important/.test(r.decls["font-family"] ?? ""),
    )
    .map((r) => r.selector)
    .join(", ");

  /** Чем написан узел и кто это задал: он сам или предок, от которого наследует. */
  function действующее(
    el: Element,
    свойство: "font-family" | "font-weight",
  ): { значение: string; откуда: Element | null } {
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
    x: { значение: string; откуда: Element | null },
    переменная: string,
    поУмолчаниюЗначение: string,
    привести: (v: string) => string,
  ): boolean {
    if (x.значение === `var(${переменная})`) return true;
    const доходит = !!x.откуда && !!перекрытие && x.откуда.matches(перекрытие);
    return доходит && привести(раскрыть(x.значение)) === поУмолчаниюЗначение;
  }

  it("каждая надпись фильтров — шрифтом и жирностью текста из настроек", async () => {
    expect(перекрытие).toContain("button");
    const корень = await показать(тема, {}, true, МАГАЗИН);
    const все = надписи(корень);
    const чужие = все
      .map((el) => ({
        надпись: (
          (el.textContent ?? "").trim() ||
          el.getAttribute("placeholder") ||
          el.tagName
        ).slice(0, 24),
        шрифт: действующее(el, "font-family"),
        жирность: действующее(el, "font-weight"),
      }))
      .filter(
        (x) =>
          !изНастроек(x.шрифт, "--font-body", поУмолчаниюШрифт, первое) ||
          !изНастроек(x.жирность, "--weight-body", поУмолчаниюЖирность, (v) =>
            v.trim(),
          ),
      )
      .map((x) => ({
        надпись: x.надпись,
        шрифт: x.шрифт.значение,
        жирность: x.жирность.значение,
      }));
    expect({ надписей: все.length > 30, чужие }).toEqual({
      надписей: true,
      чужие: [],
    });
  });
});
