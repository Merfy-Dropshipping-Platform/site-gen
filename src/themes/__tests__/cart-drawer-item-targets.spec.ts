import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Баг тестера №20 (владелец, 18.09, дословно, ТРЕТИЙ заход): «цена до скидки
 * не отображается + цв схема не применяется к заголовку, цене, количества
 * кнопка и цифры».
 *
 * Два соседних гарда КОРЗИНЫ не ловили ровно эти две дырки:
 *   - `cart-page-scheme.spec.ts` / `cart-drawer-scheme.spec.ts` меряют ХРОМ
 *     (панель/фон/шапку), не СТРОКУ товара;
 *   - `cart-drawer-items-scheme.spec.ts` (соседний файл) ловит только
 *     ПОСТОЯННУЮ КРАСКУ ЛИТЕРАЛОМ (`bg-[#hex]`, `text-black`…). У flux и
 *     satin кнопки `data-cart-dec`/`data-cart-inc` и счётчик количества в
 *     ДРОВЕРЕ (мини-корзина из шапки) не несли НИКАКОГО класса цвета вообще —
 *     не литерал (тот гард такое ловит), а ПУСТОТА (наследуемый чёрный).
 *     Тот гард такое пропускает: отсутствие класса — не литерал.
 *
 * Замер «до» (18.09, до этой правки):
 *   rose    OK (--color-text на dec/inc/qty)
 *   bloom   OK (--color-accent на dec/inc, --color-text на qty)
 *   flux    ГОЛО — ни одного цветового класса на dec/inc/qty
 *   satin   ГОЛО — ни одного цветового класса на dec/inc/qty
 *   vanilla OK (--color-text на dec/inc/qty)
 * Живой замер владельца (флюкс, u9fpo33bkmsd.merfy.ru): дровер, заголовок
 * «Корзина» — rgb(0,0,0) в обеих схемах (см. отдельный гард
 * cart-drawer-scheme.spec.ts / resolveCartDrawerSchemeId).
 *
 * Старая цена: НИ ОДНА из пяти тем не рендерила `line.oldPrice` в
 * `renderDrawerItem` вовсе — попытка bd31b20b (17.09) чинила ТОЛЬКО
 * страницу `/cart` (`CartBody.astro`), дровер — отдельная разметка
 * (`themes/<t>/src/lib/cart.ts`), её никто не трогал.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

function drawerSource(theme: string): string {
  return readFileSync(resolve(SITES_ROOT, "themes", theme, "src/lib/cart.ts"), "utf-8");
}

/** Вырезает именно тело `renderDrawerItem` (до закрывающего `},\n});`). */
function renderDrawerItemBody(src: string): string {
  const start = src.indexOf("renderDrawerItem:");
  if (start < 0) throw new Error("renderDrawerItem не найден");
  const end = src.indexOf("\n});", start);
  return src.slice(start, end < 0 ? undefined : end);
}

describe("строка товара в дровере корзины — старая цена (баг №20)", () => {
  it.each(THEMES)("%s: renderDrawerItem считает line.oldPrice и рисует line-through", (theme) => {
    const body = renderDrawerItemBody(drawerSource(theme));
    expect(body).toMatch(/line\.oldPrice/);
    expect(body).toMatch(/oldPrice\s*>\s*line\.price/);
    expect(body).toMatch(/line-through/);
  });
});

describe("строка товара в дровере корзины — счётчик количества едет за схемой (баг №20)", () => {
  it.each(THEMES)("%s: кнопка «минус» несёт токен --color-", (theme) => {
    const body = renderDrawerItemBody(drawerSource(theme));
    const line = body.split("\n").find((l) => l.includes("data-cart-dec"));
    expect(line).toBeDefined();
    expect(line).toMatch(/--color-[a-z-]+/);
  });

  it.each(THEMES)("%s: счётчик количества (цифра) несёт токен --color-", (theme) => {
    const body = renderDrawerItemBody(drawerSource(theme));
    const line = body.split("\n").find((l) => l.includes("min-w-[28px]"));
    expect(line).toBeDefined();
    expect(line).toMatch(/--color-[a-z-]+/);
  });

  it.each(THEMES)("%s: кнопка «плюс» несёт токен --color-", (theme) => {
    const body = renderDrawerItemBody(drawerSource(theme));
    const line = body.split("\n").find((l) => l.includes("data-cart-inc"));
    expect(line).toBeDefined();
    expect(line).toMatch(/--color-[a-z-]+/);
  });
});

describe("саботаж: гард обязан покраснеть на возврате обеих дырок", () => {
  it("отсутствие line.oldPrice в теле — красный", () => {
    const body = "renderDrawerItem: (line) => `<li>${formatPrice(line.price)}</li>`,";
    expect(body).not.toMatch(/line\.oldPrice/);
  });

  it("кнопка без --color- токена — красный", () => {
    const body =
      'renderDrawerItem: (line) => `<button type="button" data-cart-dec class="flex h-9 w-9 items-center justify-center">−</button>`,';
    const line = body.split("\n").find((l) => l.includes("data-cart-dec"));
    expect(line).toBeDefined();
    expect(line).not.toMatch(/--color-[a-z-]+/);
  });
});
