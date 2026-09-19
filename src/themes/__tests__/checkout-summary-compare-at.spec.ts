import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Жалоба тестировщика 19.09 (через владельца): цена до скидки «то была, то
 * нет», в том числе в чекауте.
 *
 * ЗАМЕР. На живом чекауте стенда rose позиции приходят из ДВУХ источников:
 *   - `window.cartStore.getItems()` — серверная корзина. Ответ
 *     `/api/orders/cart/<id>` несёт только `unitPriceCents: 99000`; поля
 *     `compareAtPriceCents`/`oldPrice` в нём НЕТ вовсе (проверено curl'ом).
 *   - `readNtCartItems()` — локальная `<тема>:cart:v1`, где `oldPrice` есть.
 *
 * Приоритет у cartStore, поэтому пока он не поднялся — цена видна, а как
 * только ответил — исчезает. Отсюда «то была, то нет»: это гонка, а не
 * случайность.
 *
 * Пока сервер не отдаёт старую цену, сводка добирает её из локальной корзины
 * (`withCompareAt`). Когда сервер начнёт присылать `compareAtPriceCents`,
 * функция станет пустой операцией: она уважает уже проставленное значение.
 */

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const SRC = readFileSync(
  resolve(SITES_ROOT, "packages/theme-base/blocks/CheckoutOrderSummary/CheckoutOrderSummary.astro"),
  "utf-8",
);

describe("сводка чекаута не теряет цену до скидки из серверной корзины", () => {
  it("серверные позиции пропускаются через withCompareAt", () => {
    expect(SRC).toMatch(/return withCompareAt\(items\)/);
  });

  it("добор идёт из локальной корзины, а не выдумывается", () => {
    const fn = SRC.slice(SRC.indexOf("function withCompareAt"));
    expect(fn).toMatch(/readNtCartItems\(\)/);
  });

  it("уже проставленная серверная цена уважается (добор — не перезапись)", () => {
    const fn = SRC.slice(SRC.indexOf("function withCompareAt"));
    expect(fn).toMatch(/if \(it\.compareAtPriceCents\) return it;/);
  });

  it("сопоставление идёт и по id позиции, и по productId", () => {
    const fn = SRC.slice(SRC.indexOf("function withCompareAt"));
    expect(fn).toMatch(/'id:'/);
    expect(fn).toMatch(/'p:'/);
  });

  it("зачёркнутая цена рисуется только при включённой настройке", () => {
    expect(SRC).toMatch(/showComparePrice && compareAt && !isBonus/);
  });
});

describe("саботаж: гард ловит возврат гонки", () => {
  it("прямой возврат items без добора — красный", () => {
    const broken = "      if (items && items.length) return items;";
    expect(/return withCompareAt\(items\)/.test(broken)).toBe(false);
  });

  it("перезапись вместо добора — красный", () => {
    const broken = "copy.compareAtPriceCents = m.compareAtPriceCents;";
    expect(/if \(it\.compareAtPriceCents\) return it;/.test(broken)).toBe(false);
  });
});
