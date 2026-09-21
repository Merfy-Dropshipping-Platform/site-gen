import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Жалоба владельца 20.09: «при положении логотипа „По центру" ломается — все
 * иконки». Замер геометрии в браузере по матрице 5 тем × 4 положения логотипа ×
 * 3 типа меню (окно 1280) нашёл ровно две дырки, обе в «По центру» + «Боковое»:
 *
 *   flux     блок действий стоял в 498px от правого края вместо 80
 *   vanilla  968px вместо 80
 *   bloom, rose, satin — ровно во всех 12 сочетаниях
 *
 * Механизмы разные, симптом один. «Боковое» прячет навигацию через
 * `display:none`. У flux «По центру» — сетка `grid-cols-[1fr_auto_1fr]`, и
 * скрытый элемент ВЫПАДАЕТ ИЗ СЕТКИ: логотип с иконками съезжали на колонку
 * влево, третья оставалась пустой. У vanilla логотип абсолютный, в потоке
 * остаются меню и иконки, ряд раздаёт их `justify-between` — спрятали меню, и
 * единственный оставшийся блок прижимался к ЛЕВОМУ краю.
 *
 * Здесь проверяется РЕЗУЛЬТАТ РЕНДЕРА настоящего скомпилированного модуля, а не
 * исходник: пропы проходят полную живую цепочку, поэтому гард ловит и потерю
 * класса, и потерю самого пропа. Геометрию браузером тут не меряем сознательно —
 * ни один гард репозитория не поднимает браузер, и CI не ставит для него
 * движки; замер выше делался вручную и воспроизводится тем же способом.
 */
const RENDERER = resolve(__dirname, "render-theme-sections.mjs");
const MENUS = ["dropdown", "mega-menu", "sidebar"] as const;

const LINKS = [
  { text: "Главная", href: "/" },
  { text: "Наушники", href: "/catalog" },
];

function renderHeader(
  theme: string,
  menuType: string,
  logoPosition = "center-absolute",
): string {
  const props = {
    id: "Header-1",
    colorScheme: "1",
    logoPosition,
    menuType,
    navigationLinks: LINKS,
    links: LINKS,
  };
  const out = execFileSync(
    "node",
    [RENDERER, theme, JSON.stringify([{ block: "Header", props, live: true }])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const [res] = JSON.parse(out) as Array<{ html?: string; error?: string }>;
  if (res.error)
    throw new Error(`${theme}/${logoPosition}/${menuType}: ${res.error}`);
  return res.html ?? "";
}

describe("flux «По центру»: колонки сетки закреплены явно", () => {
  /**
   * Самораскладка сетки расставляет элементы по порядку, поэтому скрытая
   * навигация сдвигала соседей. Явные col-start держат каждого в своей колонке
   * независимо от того, сколько элементов реально видимы.
   */
  it.each(MENUS)("%s: в разметке есть все три колонки", (menu) => {
    const html = renderHeader("flux", menu);
    for (const col of ["md:col-start-1", "md:col-start-2", "md:col-start-3"]) {
      expect({ menu, col, есть: html.includes(col) }).toEqual({
        menu,
        col,
        есть: true,
      });
    }
  });

  it("в других положениях логотипа сетки нет — колонки не навязываются", () => {
    const html = renderHeader("flux", "dropdown", "top-left");
    expect(html).not.toContain("md:col-start-");
  });
});

describe("vanilla «По центру»: блок действий прижат вправо сам по себе", () => {
  /**
   * Ряд раздаёт детей через justify-between, поэтому исчезновение соседа
   * уводило иконки влево. `ml-auto` держит блок у правого края независимо от
   * того, остался ли сосед.
   */
  it.each(MENUS)("%s: у блока действий есть ml-auto", (menu) => {
    const html = renderHeader("vanilla", menu);
    expect({ menu, есть: html.includes("ml-auto") }).toEqual({
      menu,
      есть: true,
    });
  });

  it("при логотипе слева прижатие не навязывается — там своё flex-1 justify-end", () => {
    const html = renderHeader("vanilla", "dropdown", "center-left");
    expect(html).toContain("justify-end");
  });
});
