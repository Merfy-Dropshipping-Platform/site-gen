import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Разбор владельца 19.09, пункт 2: «в карточке под корзиной плавающей не
 * отображает» цену до скидки.
 *
 * Замер подтвердил: окно «Товар добавлен в корзину» показывало только текущую
 * цену («Test 10 ₽ · 1 шт.»), а поля старой цены у него не было ВООБЩЕ — ни в
 * разметке (`CartAddedModal.astro`), ни в типе payload, ни в рендере. То есть
 * это не потеря значения, как в корзине и сайдбаре, а отсутствующая функция.
 *
 * Правило то же, что и везде: показываем, только когда старая цена БОЛЬШЕ
 * текущей, цвет — от настройки «Текст».
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(SITES_ROOT, rel), "utf-8");

const MARKUP = read("packages/theme-base/primitives/CartAddedModal.astro");
const RUNTIME = read("packages/theme-base/runtime/cart-added-modal.ts");
const SENDER = read("packages/theme-base/runtime/nt-cart.ts");

describe("окно «товар добавлен» показывает цену до скидки", () => {
  it("в разметке есть узел старой цены", () => {
    expect(MARKUP).toMatch(/data-cart-modal-old-price/);
  });

  it("узел зачёркнут и красится от настройки «Текст»", () => {
    // Берём РОВНО класс этого узла: соседний «объём» красится приглушённым,
    // и широкий срез ловил бы его.
    const idx = MARKUP.indexOf("data-cart-modal-old-price");
    const classAttr = MARKUP.slice(idx).match(/class="([^"]+)"/);
    expect(classAttr).not.toBeNull();
    const cls = classAttr![1];
    expect(cls).toMatch(/line-through/);
    expect(cls).toMatch(/--color-text/);
    expect(cls).not.toMatch(/--color-muted|--color-heading/);
  });

  it("payload несёт итог до скидки", () => {
    expect(RUNTIME).toMatch(/oldLineTotal\?: number/);
  });

  it("рисуется только когда старая цена больше текущей", () => {
    expect(RUNTIME).toMatch(/payload\.oldLineTotal > payload\.lineTotal/);
  });

  it("пустое значение прячет строку, а не оставляет пустой абзац", () => {
    expect(RUNTIME).toMatch(/classList\.toggle\("hidden", !show\)/);
  });

  it("отправитель считает итог от количества, а не от цены за штуку", () => {
    expect(SENDER).toMatch(/oldLineTotal:[\s\S]{0,140}line\.oldPrice \* line\.quantity/);
  });
});

describe("саботаж: гард ловит откат", () => {
  it("разметка без узла — красный", () => {
    expect(/data-cart-modal-old-price/.test('<p data-cart-modal-price></p>')).toBe(false);
  });

  it("показ без сравнения с текущей ценой — красный", () => {
    const broken = "const show = typeof payload.oldLineTotal === 'number';";
    expect(/payload\.oldLineTotal > payload\.lineTotal/.test(broken)).toBe(false);
  });
});
