/**
 * @jest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Скрипт шторки корзины трогает только СВОИ узлы, не секции страницы корзины.
 *
 * Тестер 24.09: «при пустой корзине цветовая схема к секции „Промежуточный
 * итог“ не применяется». Секция несёт `data-cart-summary`, как и сводка шторки,
 * и стоит в DOM раньше шторки: `document.querySelector("[data-cart-summary]")`
 * находил секцию, и при пустой корзине шторка ставила ей `hidden` — в
 * конструкторе секция пропадала, смена схемы была не видна. Так во всех пяти
 * темах (замер витрин 24.09). Узлы шторки берутся вне [data-puck-component-id].
 */
const SITES = resolve(__dirname, "..", "..", "..");
const SCRIPTS = [
  "packages/theme-base/runtime/nt-cart.ts",
  "themes/bloom/src/lib/nt-cart-bloom.ts",
  "themes/satin/src/lib/nt-cart-satin.ts",
  "themes/vanilla/src/lib/nt-cart-vanilla.ts",
];

describe("шторка корзины не трогает секции страницы корзины", () => {
  it.each(SCRIPTS)("%s: узлы шторки — вне секций страницы", (f) => {
    const src = readFileSync(resolve(SITES, f), "utf-8");
    expect(src).not.toMatch(/document\.querySelector(?:<HTMLElement>)?\("\[data-cart-(?:empty|items|summary|total)\]"\)/);
    expect(src).toContain('!el.closest("[data-puck-component-id]")');
  });

  it("правило выбора: узел секции пропускается, узел шторки находится", () => {
    document.body.innerHTML =
      '<section data-puck-component-id="CartSummary-1"><div data-cart-summary id="page"></div></section>' +
      '<div id="drawer-root"><div data-cart-summary id="drawer"></div></div>';
    const drawerNode = (sel: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(sel)).find((el) => !el.closest("[data-puck-component-id]")) ?? null;
    expect(drawerNode("[data-cart-summary]")?.id).toBe("drawer");
  });
});
