import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Владелец 19.09: «в корзине до сих пор нет цены до скидки, везде есть — в
 * корзине нет».
 *
 * ПЯТЫЙ путь рендера той же цены. Кроме секций (`CartBody`, `CartSection`),
 * дровера (`lib/cart.ts`) и гидрации карточек, у bloom и satin есть СВОЯ
 * страница `src/pages/cart.astro` с собственной разметкой строки товара — и
 * старой цены там не было вовсе: ни `oldPrice`, ни `line-through`. У rose,
 * vanilla и flux эта страница — тонкая обёртка над `CartSection`, поэтому у
 * них всё работало, и жалоба выглядела как «только в корзине».
 *
 * Я сам чуть не закрыл этот случай ложным пруфом: замер нашёл зачёркнутую цену
 * на странице и я счёл её починенной, а узел на деле принадлежал ДРОВЕРУ,
 * открытому поверх. Поэтому гард проверяет исходники страниц, а живая проверка
 * обязана спрашивать `closest('[data-cart-page-items]')`.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "bloom", "satin", "vanilla", "flux"] as const;

/** Страницы со СВОЕЙ разметкой строки товара (не обёртка над секцией). */
const OWN_MARKUP = ["bloom", "satin"];

function page(theme: string): string | null {
  const p = resolve(SITES_ROOT, "themes", theme, "src", "pages", "cart.astro");
  return existsSync(p) ? readFileSync(p, "utf-8") : null;
}

describe("страница корзины показывает цену до скидки", () => {
  it.each(OWN_MARKUP)("%s: рисует зачёркнутую старую цену", (theme) => {
    const src = page(theme);
    expect(src).not.toBeNull();
    const lines = (src as string).split("\n").filter((l) => l.includes("line-through"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/--color-text/);
      expect(line).not.toMatch(/--color-muted|--color-heading/);
    }
  });

  it.each(OWN_MARKUP)("%s: показывает только когда старая цена больше текущей", (theme) => {
    const src = page(theme) as string;
    expect(src).toMatch(/line\.oldPrice > line\.price/);
  });

  it.each(OWN_MARKUP)("%s: считает от количества, а не за штуку", (theme) => {
    const src = page(theme) as string;
    expect(src).toMatch(/line\.oldPrice \* line\.quantity/);
  });

  it.each(THEMES.filter((t) => !OWN_MARKUP.includes(t)))(
    "%s: страница — обёртка над секцией, своей разметки нет",
    (theme) => {
      const src = page(theme);
      expect(src).not.toBeNull();
      // обёртка короткая и делегирует секции — чинить там нечего
      expect((src as string).split("\n").length).toBeLessThan(40);
      expect(src as string).toMatch(/CartSection/);
    },
  );
});

describe("саботаж: гард ловит потерю цены на странице", () => {
  it("страница без line-through — красный", () => {
    const src = '<span>${formatCartPrice(line.price * line.quantity)}</span>';
    expect(src.includes("line-through")).toBe(false);
  });

  it("показ без сравнения с текущей ценой — красный", () => {
    const src = "${line.oldPrice ? `<span class=\"line-through\">` : ''}";
    expect(/line\.oldPrice > line\.price/.test(src)).toBe(false);
  });
});
