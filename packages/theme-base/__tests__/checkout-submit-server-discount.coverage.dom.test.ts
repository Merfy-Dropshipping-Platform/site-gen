/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — serverDiscountCents()/signatureOf() (CheckoutSubmit.astro
 * строки ~148-161). Скидку в кнопке считает ТОЛЬКО сервер (orders): промокод
 * ИЛИ автоматическая скидка магазина — одна сумма discountCents серверной
 * корзины (window.cartStore.getServerCart()), пока состав корзины (подпись из
 * productId/variantCombinationId/quantity, БЕЗ бонусных строк, порядок не
 * важен — сортируется) совпадает с текущей локальной. Если подписи разошлись —
 * берётся локальная state.discountCents (событие checkout:discount-applied).
 * Владелец 27.09: кнопка знала только скидку из события промокода и с
 * автоматической скидкой магазина обещала «Оплатить» полную сумму без скидки.
 *
 * Единственный наблюдаемый эффект в этом блоке — итог в тексте кнопки
 * (getTotalCents() → refresh(), вызывается синхронно при инициализации и на
 * каждое relevant-событие): discountCents НЕ попадает в тело /checkout или
 * /create-payment (сервер сам знает скидку корзины) — payload здесь не
 * проверяется, это делают checkout-submit-money-cdek-contract.coverage.dom.test.ts
 * и checkout-submit-config.dom.test.ts.
 *
 * Скрипт исполняется через astroInlineRunners (единственный <script> файла,
 * индекс [0]), покрытие пишется под путём CheckoutSubmit.astro.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutSubmit",
  "CheckoutSubmit.astro",
);

function mountSubmitDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
    <div data-checkout-field="email"><input value="a@b.ru" /></div>
    <div data-checkout-field="phone"><input value="+79990000000" /></div>
    <div data-checkout-field="firstName"><input value="Иван" /></div>
    <div data-checkout-field="lastName"><input value="Петров" /></div>
    <div data-checkout-field="fullName"><input value="" /></div>
    <div data-checkout-field="city"><input value="Москва" /></div>
    <div data-checkout-field="postalCode"><input value="101000" /></div>
    <div data-checkout-field="street"><input value="Ленина" /></div>
    <div data-checkout-field="building"><input value="1" /></div>
    <div data-checkout-field="apartment"><input value="5" /></div>
    <div data-checkout-field="country"><input value="Россия" /></div>`;
  return document.querySelector(
    '[data-block="checkout-submit"]',
  ) as HTMLElement;
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  astroInlineRunners(ASTRO)[0].run({
    buttonText: "Оформить — {total}",
    loadingText: "Оформляем…",
    successRedirectUrl: "/checkout/result",
    blockId: "cs-1",
  });
}

function applyDiscountEvent(discountCents: number) {
  document.dispatchEvent(
    new CustomEvent("checkout:discount-applied", { detail: { discountCents } }),
  );
}

const btnOf = (section: HTMLElement) =>
  section.querySelector("[data-checkout-submit]") as HTMLButtonElement;

/** Зеркало fmtRub() из CheckoutSubmit.astro — держать идентично. */
function fmtRub(cents: number): string {
  const rub = Math.round(cents / 100);
  return rub.toLocaleString("ru-RU") + "₽";
}
function expectedButtonText(totalCents: number): string {
  return `Оформить — ${fmtRub(Math.max(0, totalCents))}`;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).location;
  (window as any).location = { origin: "https://shop.test", href: "" };
});
afterEach(() => {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
});

// Один товар, 2 шт. по 1000₽ — subtotal 200000 копеек.
const ONE_ITEM = {
  id: "i1",
  productId: "p1",
  quantity: 2,
  unitPriceCents: 100000,
};

describe("CheckoutSubmit — signatureOf(): что считается «той же корзиной»", () => {
  const CASES: Array<{
    name: string;
    localItems: Array<Record<string, unknown>>;
    serverItems: Array<Record<string, unknown>>;
    expectServerWins: boolean;
  }> = [
    {
      name: "точное совпадение, один товар — сервер побеждает",
      localItems: [ONE_ITEM],
      serverItems: [{ productId: "p1", quantity: 2 }],
      expectServerWins: true,
    },
    {
      name: "два товара в другом порядке — подпись сортируется, всё равно совпадает",
      localItems: [
        ONE_ITEM,
        { id: "i2", productId: "p2", quantity: 1, unitPriceCents: 50000 },
      ],
      serverItems: [
        { productId: "p2", quantity: 1 },
        { productId: "p1", quantity: 2 },
      ],
      expectServerWins: true,
    },
    {
      name: "мисматч по quantity — подписи разные",
      localItems: [ONE_ITEM],
      serverItems: [{ productId: "p1", quantity: 1 }],
      expectServerWins: false,
    },
    {
      name: "мисматч по variantCombinationId — подписи разные",
      localItems: [{ ...ONE_ITEM, variantCombinationId: "v1" }],
      serverItems: [
        { productId: "p1", quantity: 2, variantCombinationId: "v2" },
      ],
      expectServerWins: false,
    },
    {
      name: "бонусная строка в ЛОКАЛЬНОЙ корзине не мешает — signatureOf её игнорирует по обе стороны",
      localItems: [
        ONE_ITEM,
        {
          id: "gift1",
          productId: "p1",
          quantity: 1,
          isBonus: true,
          unitPriceCents: 0,
        },
      ],
      serverItems: [{ productId: "p1", quantity: 2 }],
      expectServerWins: true,
    },
  ];

  it.each(CASES)(
    "$name",
    async ({ localItems, serverItems, expectServerWins }) => {
      const SERVER_DISCOUNT = 30000;
      (window as any).cartStore = {
        getItems: () => localItems,
        getServerCart: () => ({
          items: serverItems,
          discountCents: SERVER_DISCOUNT,
        }),
        syncToServer: jest.fn(async () => "cart_new"),
      };
      const section = mountSubmitDom();
      runScript(section);

      const subtotal = localItems.reduce(
        (sum, it) =>
          sum +
          ((it.unitPriceCents as number) || 0) *
            ((it.quantity as number) || 1),
        0,
      );
      // Без checkout:discount-applied локальная скидка по умолчанию 0.
      const discount = expectServerWins ? SERVER_DISCOUNT : 0;
      expect(btnOf(section).textContent).toBe(
        expectedButtonText(subtotal - discount),
      );
    },
  );
});

describe("CheckoutSubmit — серверная скидка побеждает локальную (владелец 27.09)", () => {
  it("server.discountCents=0 (подпись совпадает) побеждает над РАНЕЕ применённым локальным промокодом", async () => {
    (window as any).cartStore = {
      getItems: () => [ONE_ITEM],
      getServerCart: () => ({
        items: [{ productId: "p1", quantity: 2 }],
        discountCents: 0,
      }),
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    applyDiscountEvent(50000); // локальный промокод — но сервер сильнее и говорит "0"
    expect(btnOf(section).textContent).toBe(expectedButtonText(200000));
  });

  it("server.discountCents > 0 БЕЗ единого checkout:discount-applied — автоматическая скидка магазина видна сразу", async () => {
    (window as any).cartStore = {
      getItems: () => [ONE_ITEM],
      getServerCart: () => ({
        items: [{ productId: "p1", quantity: 2 }],
        discountCents: 25000,
      }),
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    expect(btnOf(section).textContent).toBe(expectedButtonText(175000));
  });

  it("подпись совпадает, но у серверного объекта нет поля discountCents — считается 0, локальный промокод не пробивается", async () => {
    (window as any).cartStore = {
      getItems: () => [ONE_ITEM],
      getServerCart: () => ({ items: [{ productId: "p1", quantity: 2 }] }), // discountCents отсутствует
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    applyDiscountEvent(999900);
    expect(btnOf(section).textContent).toBe(expectedButtonText(200000));
  });
});

describe("CheckoutSubmit — getServerCart отсутствует/не функция/вернул falsy — локальная скидка как раньше", () => {
  it("window.cartStore.getServerCart отсутствует — берётся state.discountCents (обратная совместимость)", async () => {
    (window as any).cartStore = {
      getItems: () => [ONE_ITEM],
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    applyDiscountEvent(30000);
    expect(btnOf(section).textContent).toBe(expectedButtonText(170000));
  });

  it("getServerCart — функция, но вернула null — тоже локальная скидка", async () => {
    (window as any).cartStore = {
      getItems: () => [ONE_ITEM],
      getServerCart: () => null,
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    applyDiscountEvent(30000);
    expect(btnOf(section).textContent).toBe(expectedButtonText(170000));
  });

  it("нет window.cartStore вовсе — корзина пуста (0₽), скидка локальная по умолчанию (0)", async () => {
    const section = mountSubmitDom();
    runScript(section);
    expect(btnOf(section).textContent).toBe(expectedButtonText(0));
  });
});

describe("CheckoutSubmit — signatureOf(): фолбэки отдельных полей строки", () => {
  const SERVER_DISCOUNT = 12000;

  it("оба товара без productId — совпадают по id (фолбэк productId||id||'')", async () => {
    (window as any).cartStore = {
      getItems: () => [{ id: "line-1", quantity: 1, unitPriceCents: 80000 }], // нет productId
      getServerCart: () => ({
        items: [{ id: "line-1", quantity: 1 }], // тоже только id
        discountCents: SERVER_DISCOUNT,
      }),
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    expect(btnOf(section).textContent).toBe(
      expectedButtonText(80000 - SERVER_DISCOUNT),
    );
  });

  it("оба товара без productId И без id — совпадают по финальному фолбэку ''", async () => {
    (window as any).cartStore = {
      getItems: () => [{ quantity: 1, unitPriceCents: 60000 }], // ни productId, ни id
      getServerCart: () => ({
        items: [{ quantity: 1 }],
        discountCents: SERVER_DISCOUNT,
      }),
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    expect(btnOf(section).textContent).toBe(
      expectedButtonText(60000 - SERVER_DISCOUNT),
    );
  });

  it("quantity не задан ни локально, ни на сервере — оба фолбэчатся на 1, подписи совпадают", async () => {
    (window as any).cartStore = {
      getItems: () => [{ productId: "p1", unitPriceCents: 100000 }], // нет quantity
      getServerCart: () => ({
        items: [{ productId: "p1" }], // тоже нет quantity
        discountCents: SERVER_DISCOUNT,
      }),
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    // getSubtotalCents() тоже берёт it.quantity||1 → 100000*1.
    expect(btnOf(section).textContent).toBe(
      expectedButtonText(100000 - SERVER_DISCOUNT),
    );
  });

  it("getServerCart() вернул объект БЕЗ поля items вовсе — signatureOf(undefined) не падает (items||[]), считается пустой корзиной → подписи не совпадают, локальная скидка", async () => {
    (window as any).cartStore = {
      getItems: () => [ONE_ITEM], // непустая локальная корзина
      getServerCart: () => ({ discountCents: SERVER_DISCOUNT }), // items отсутствует
      syncToServer: jest.fn(async () => "cart_new"),
    };
    const section = mountSubmitDom();
    runScript(section);
    applyDiscountEvent(15000); // локальная скидка побеждает — подписи не совпали
    expect(btnOf(section).textContent).toBe(expectedButtonText(200000 - 15000));
  });
});
