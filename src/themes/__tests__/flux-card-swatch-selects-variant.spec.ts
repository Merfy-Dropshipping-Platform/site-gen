/**
 * @jest-environment jsdom
 */
/**
 * Квадратики цвета на карточке flux в «Коллекции товаров» выбирают вариант.
 *
 * Владелец 28.09: «флоу в магазине, не выбирается вариант товара, моканые цвета
 * без нажатия». Замер на витрине MrMerfy (flux, главная, «Бесшовный топ»):
 * у товара три цвета — Cherry Purple, Haze Pink, Performance Pink, у каждого
 * своё фото. Карточка рисовала два статичных `<span>` (фиолетовый и розовый):
 * два розовых сливались в один по одинаковому цвету, нажатие ничего не
 * делало, а «В корзину» всегда клала Cherry Purple / XXS.
 *
 * Теперь один квадратик = один настоящий цвет товара, с его названием;
 * нажатие ставит фото этого цвета и переключает кнопку «В корзину» на
 * вариант этого цвета (первый размер в порядке показа).
 *
 * Разметка — та же `renderCardHtml`, что гидрация секции на витрине
 * (themes/flux/src/components/sections/Popular.astro → hydratePopular).
 */
import {
  bindCardSwatches,
  renderCardHtml,
} from "../../../themes/flux/src/lib/storefront-hydrate";

const IMG = {
  main: "https://img.test/main.jpg",
  cherry: "https://img.test/cherry.jpg",
  haze: "https://img.test/haze.jpg",
  perf: "https://img.test/perf.jpg",
};

const combo = (id: string, color: string, size: string, price: number) => ({
  id,
  title: `${size} / ${color}`,
  price,
  available: true,
  options: { Размер: size, Цвет: color },
});

// Порядок как в /data/products.json магазина: группа «Размер» идёт первой,
// комбинации — вперемешку.
const PRODUCT = {
  id: "p-top",
  name: "Бесшовный топ",
  price: 4499,
  images: [IMG.main, IMG.cherry, IMG.haze, IMG.perf],
  hasVariants: true,
  variantSwatches: [
    { value: "Cherry Purple", color: null, available: true },
    { value: "Haze Pink", color: null, available: true },
    { value: "Performance Pink", color: null, available: true },
  ],
  variantGroups: [
    { name: "Размер", options: [{ value: "XXS", images: [] }, { value: "XS", images: [] }, { value: "S", images: [] }] },
    {
      name: "Цвет",
      options: [
        { value: "Cherry Purple", images: [IMG.cherry], swatchHex: null },
        { value: "Haze Pink", images: [IMG.haze], swatchHex: null },
        { value: "Performance Pink", images: [IMG.perf], swatchHex: null },
      ],
    },
  ],
  variantCombinations: [
    combo("haze-xs", "Haze Pink", "XS", 4499),
    combo("haze-xxs", "Haze Pink", "XXS", 4499),
    combo("perf-s", "Performance Pink", "S", 4499),
    combo("perf-xxs", "Performance Pink", "XXS", 4299),
    combo("cherry-xs", "Cherry Purple", "XS", 4400),
    combo("cherry-xxs", "Cherry Purple", "XXS", 4490),
  ],
};

function mountCard(): HTMLElement {
  document.body.innerHTML = `<ul data-nt="popular-grid"><li data-product-id="p-top">${renderCardHtml(
    PRODUCT as never,
    "В КОРЗИНУ",
  )}</li></ul>`;
  bindCardSwatches();
  return document.querySelector('[data-nt="flux-product-card"]') as HTMLElement;
}

const swatches = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>("[data-card-swatch]"));
const cartButton = (card: HTMLElement) => card.querySelector("[data-add-to-cart]") as HTMLElement;
const photo = (card: HTMLElement) => card.querySelector('[data-nt="flux-card-media"] img') as HTMLImageElement;

describe("flux · карточка «Коллекции товаров» · квадратик цвета выбирает вариант", () => {
  it("один квадратик на каждый настоящий цвет товара, с его названием", () => {
    const card = mountCard();
    expect(swatches(card).map((s) => s.getAttribute("aria-label"))).toEqual([
      "Цвет: Cherry Purple",
      "Цвет: Haze Pink",
      "Цвет: Performance Pink",
    ]);
    expect(swatches(card).every((s) => s.tagName === "BUTTON")).toBe(true);
  });

  it("выбранным сразу отмечен цвет, который кладёт «В корзину»", () => {
    const card = mountCard();
    expect(cartButton(card).getAttribute("data-variant-color")).toBe("Cherry Purple");
    expect(swatches(card).map((s) => s.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
  });

  it("нажатие: фото этого цвета, «В корзину» кладёт вариант этого цвета", () => {
    const card = mountCard();
    swatches(card)[2].click();

    expect(photo(card).getAttribute("src")).toBe(IMG.perf);
    const btn = cartButton(card);
    expect(btn.getAttribute("data-variant-color")).toBe("Performance Pink");
    expect(btn.getAttribute("data-variant-size")).toBe("XXS");
    expect(btn.getAttribute("data-variant-combination-id")).toBe("perf-xxs");
    expect(btn.getAttribute("data-price")).toBe("4299");
    expect(btn.getAttribute("data-image")).toBe(IMG.perf);
    expect(swatches(card).map((s) => s.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
  });

  it("нажатие не уходит на страницу товара и не трогает соседнюю карточку", () => {
    document.body.innerHTML = `<ul data-nt="popular-grid">${["a", "b"]
      .map((id) => `<li data-product-id="${id}">${renderCardHtml({ ...PRODUCT, id } as never)}</li>`)
      .join("")}</ul>`;
    bindCardSwatches();
    const [first, second] = Array.from(document.querySelectorAll<HTMLElement>('[data-nt="flux-product-card"]'));
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    swatches(first)[1].dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(cartButton(first).getAttribute("data-variant-color")).toBe("Haze Pink");
    expect(cartButton(second).getAttribute("data-variant-color")).toBe("Cherry Purple");
    expect(photo(second).getAttribute("src")).toBe(IMG.main);
  });
});
