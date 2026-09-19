import { reconcileNtLines } from "../../../packages/theme-base/runtime/nt-cart";

/**
 * Разбор владельца 19.09: цена до скидки не показывается «в сайдбаре», «в
 * карточке под корзиной плавающей» и «в корзине», а в чекауте показывается.
 *
 * ПРИЧИНА. После добавления корзина примиряется с каталогом витрины
 * (`reconcileCart` → `reconcileNtLines`), и старая цена бралась ТОЛЬКО с
 * выбранной комбинации: `combo ? combo.compareAtPrice : p.compareAtPrice`.
 * Каталог отдаёт у комбинации `compareAtPrice: null`, а у товара — 999
 * (замер /data/products.json, товар «Test»). Значит для ЛЮБОГО вариантного
 * товара примирение затирало цену, пришедшую с кнопки: она жила ровно до
 * первого примирения.
 *
 * Отсюда и «то была, то нет», и разница между товарами: «bhbjhbbj» без
 * вариантов работал, «Test» с вариантами — нет. Чекаут при этом показывал
 * цену, потому что берёт позиции с сервера, а не из локальной корзины.
 *
 * Правило: цена комбинации имеет приоритет, но её ОТСУТСТВИЕ откатывает на
 * товарную, а не обнуляет.
 */

type Line = Parameters<typeof reconcileNtLines>[0][number];
type Product = Parameters<typeof reconcileNtLines>[1][number];

const line = (over: Partial<Line> = {}): Line =>
  ({
    id: "p1::XS",
    productId: "p1",
    name: "Test",
    price: 10,
    oldPrice: 999,
    image: "",
    quantity: 1,
    variant: { size: "XS", variantCombinationId: "c1" },
    ...over,
  }) as Line;

const product = (comboCompareAt: unknown, productCompareAt: unknown = 999): Product =>
  ({
    id: "p1",
    name: "Test",
    price: 10,
    compareAtPrice: productCompareAt,
    images: [],
    variantCombinations: [
      { id: "c1", price: 10, compareAtPrice: comboCompareAt, options: { Размер: "XS" } },
    ],
  }) as unknown as Product;

describe("примирение корзины не теряет цену до скидки", () => {
  it("у комбинации цены нет → берётся товарная (баг владельца)", () => {
    const res = reconcileNtLines([line()], [product(null)]);
    expect(res.lines[0].oldPrice).toBe(999);
  });

  it("у комбинации цена есть → она и побеждает", () => {
    const res = reconcileNtLines([line()], [product(1500)]);
    expect(res.lines[0].oldPrice).toBe(1500);
  });

  it("нет ни там, ни там → поля нет, зачёркивать нечего", () => {
    const res = reconcileNtLines([line({ oldPrice: undefined })], [product(null, null)]);
    expect(res.lines[0].oldPrice).toBeUndefined();
  });

  it("товар без вариантов работал и раньше — не сломали", () => {
    // «bhbjhbbj» со скриншота: комбинаций нет вовсе, цена только на товаре.
    const simple = line({ id: "p2", productId: "p2", name: "bhbjhbbj", price: 990, oldPrice: 8800, variant: undefined });
    const plain = {
      id: "p2",
      name: "bhbjhbbj",
      price: 990,
      compareAtPrice: 8800,
      images: [],
    } as unknown as Product;
    const res = reconcileNtLines([simple], [plain]);
    expect(res.lines[0].oldPrice).toBe(8800);
  });
});
