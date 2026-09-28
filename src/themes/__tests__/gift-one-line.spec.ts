/**
 * @jest-environment jsdom
 */
/**
 * Подарок «1+1=3» — одной позицией: «×3, 1 в подарок», цена за две.
 *
 * Владелец 27.09 (вариант А). Сервер кладёт подарок отдельной строкой
 * (`isBonus`, 0 ₽, `bonusSourceLineId`) — так его резервирует склад и так он
 * идёт в чек, это не меняем. Раньше чекаут, страница «Спасибо за заказ» и
 * заказ в кабинете покупателя рисовали две строки: «×2 990 ₽» и «×1 Подарок
 * 0 ₽». Теперь подарок прибавляется к своей строке при показе.
 *
 * Проверяем настоящий код: помощник `runtime/gift-lines.ts` (и его строку для
 * встроенных скриптов), встроенные скрипты CheckoutOrderSummary и
 * OrderConfirmation, `orderItemView` страницы заказа пяти тем.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GIFT_LINES_SOURCE,
  mergeGiftLines,
} from "../../../packages/theme-base/runtime/gift-lines";
import { orderItemView } from "../../../packages/theme-base/runtime/order-item";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const firstInlineScript = (file: string): string => {
  const src = readFileSync(resolve(SITES_ROOT, file), "utf-8");
  const body = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src)?.[1];
  if (!body) throw new Error(`${file}: нет встроенного скрипта`);
  return body;
};
const SUMMARY_SCRIPT = firstInlineScript(
  "packages/theme-base/blocks/CheckoutOrderSummary/CheckoutOrderSummary.astro",
);
const CONFIRMATION_SCRIPT = firstInlineScript(
  "packages/theme-base/blocks/OrderConfirmation/OrderConfirmation.astro",
);

const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
const plain = (el: Element | null) =>
  (el?.textContent ?? "").replace(/\s+/g, "");

const MUG = {
  productId: "mug",
  variantCombinationId: null,
  name: "Кружка",
  imageUrl: "",
};
const PAID = {
  ...MUG,
  id: "line-1",
  quantity: 2,
  unitPriceCents: 99000,
  totalCents: 198000,
  isBonus: false,
};
const GIFT = {
  ...MUG,
  id: "line-gift",
  quantity: 1,
  unitPriceCents: 0,
  totalCents: 0,
  isBonus: true,
  bonusSourceLineId: "line-1",
};

/** Как на витрине: строка помощника исполняется рядом со скриптом блока. */
function installGiftRuntime(): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- та же строка, что уходит на витрину
  new Function(GIFT_LINES_SOURCE)();
}

afterEach(() => {
  const w = window as unknown as Record<string, unknown>;
  delete w.__merfyMergeGiftLines;
  delete w.cartStore;
});

describe("помощник склейки", () => {
  it("подарок прибавляется к своей строке: ×3, из них 1 в подарок", () => {
    expect(mergeGiftLines([PAID, GIFT])).toEqual([
      { ...PAID, quantity: 3, giftQuantity: 1 },
    ]);
  });

  it("без ссылки — по товару и варианту; чужой вариант не своя строка", () => {
    const red = { ...PAID, id: "line-2", variantCombinationId: "red" };
    const gift = { ...GIFT, bonusSourceLineId: null };
    expect(mergeGiftLines([gift, PAID])).toEqual([
      { ...PAID, quantity: 3, giftQuantity: 1 },
    ]);
    expect(mergeGiftLines([red, gift])).toEqual([
      { ...red, giftQuantity: 0 },
      { ...gift, giftQuantity: 1 },
    ]);
  });

  it("строка для встроенных скриптов работает так же", () => {
    installGiftRuntime();
    const merge = (
      window as unknown as { __merfyMergeGiftLines: typeof mergeGiftLines }
    ).__merfyMergeGiftLines;
    expect(merge([PAID, GIFT])).toEqual(mergeGiftLines([PAID, GIFT]));
  });
});

describe("чекаут: сводка заказа", () => {
  it("одна строка «×3», «1 в подарок», 1 980 ₽ и зачёркнутые 2 970 ₽", async () => {
    document.body.innerHTML = `
      <section data-checkout-summary data-show-variant-labels="true" data-show-compare-price="true" data-bogo-badge="true" data-image-size="80">
        <div data-checkout-loading></div><div data-checkout-empty hidden></div>
        <div data-checkout-items hidden></div>
      </section>`;
    const w = window as unknown as Record<string, unknown>;
    w.__merfyRoot = () => document.querySelector("[data-checkout-summary]");
    w.cartStore = { getItems: () => [PAID, GIFT] };
    installGiftRuntime();
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- настоящий скрипт блока
    new Function("blockId", SUMMARY_SCRIPT)("sum-1");
    document.dispatchEvent(new CustomEvent("cart:updated"));
    await flush();

    const rows = document.querySelectorAll("[data-checkout-items] > div");
    expect(rows).toHaveLength(1);
    const row = plain(rows[0]);
    expect(row).toContain("1вподарок");
    expect(row).toMatch(/^3/);
    expect(row).toContain("1980₽");
    expect(row).toContain("2970₽");
    expect(row).not.toContain("0₽Подарок");
  });
});

describe("«Спасибо за заказ»", () => {
  it("одна позиция: «2 × 990 ₽ · 1 в подарок», сумма 1 980 ₽, зачёркнутая 2 970 ₽", async () => {
    document.body.innerHTML = `
      <section data-block="order-confirmation">
        <div data-oc-content hidden><div data-oc-items></div></div>
        <div data-oc-state hidden></div>
      </section>`;
    const w = window as unknown as Record<string, unknown>;
    w.__merfyRoot = () =>
      document.querySelector('[data-block="order-confirmation"]');
    w.__MERFY_CONFIG__ = { apiUrl: "https://gateway.test/api" };
    delete w.location;
    w.location = {
      origin: "https://shop.test",
      href: "",
      search: "?orderId=order-1",
    };
    const summary = {
      success: true,
      data: {
        orderNumber: "100",
        paymentStatus: "succeeded",
        totalCents: 198000,
        subtotalCents: 198000,
        items: [PAID, GIFT],
      },
    };
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => summary,
    }));
    installGiftRuntime();
    const itemCls = new Proxy({}, { get: (_t, key) => `oc-${String(key)}` });
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- настоящий скрипт блока
    new Function(
      "blockId",
      "apiBase",
      "greetingTpl",
      "confTitle",
      "confNote",
      "itemCls",
      CONFIRMATION_SCRIPT,
    )(
      "oc-1",
      "https://gateway.test/api",
      "Спасибо, {name}!",
      "Заказ подтверждён",
      "",
      itemCls,
    );
    await flush();

    const items = document.querySelectorAll("[data-oc-items] > .oc-item");
    expect(items).toHaveLength(1);
    expect(plain(items[0].querySelector(".oc-qty"))).toBe("3");
    expect(plain(items[0])).toContain("2×990₽·1вподарок");
    expect(plain(items[0].querySelector(".oc-now"))).toBe("1980₽");
    expect(plain(items[0].querySelector(".oc-old"))).toBe("2970₽");
  });
});

describe("кабинет покупателя: заказ", () => {
  it("позиция с подарком: 1 980 ₽, зачёркнутая 2 970 ₽, «3 шт. · 1 в подарок»", () => {
    const [line] = mergeGiftLines([PAID, GIFT]);
    expect(orderItemView(line)).toEqual({
      name: "Кружка",
      quantity: 3,
      priceCents: 198000,
      oldPriceCents: 297000,
      quantityLabel: "3 шт. · 1 в подарок",
    });
  });

  it.each(THEMES)(
    "%s: страница заказа склеивает подарок и пишет подпись количества",
    (theme) => {
      const src = readFileSync(
        resolve(SITES_ROOT, "themes", theme, "src/pages/account/order.astro"),
        "utf-8",
      );
      expect(src).toMatch(/mergeGiftLines\(order\.items\)/);
      expect(src).toMatch(/lines\.forEach\(/);
      expect(src).toContain("view.quantityLabel");
    },
  );
});
