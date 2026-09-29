/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — характеризационные тесты ошибочных и редких ответов
 * бэкенда на цепочке сабмита, не покрытых основным набором `checkout-submit-*`:
 *
 *  - `__checkoutTokenizeCard` (карта): результат токенизации уходит в
 *    create-payment как paymentToken;
 *  - `/delivery/select` для cdek_pickup вернул ошибку → сабмит прерывается
 *    своим сообщением, /checkout не вызывается;
 *  - `/checkout` вернул 404 → cartId сбрасывается, показывается «устарела»;
 *  - `/checkout` ok, но без orderId / не ok с разными формами тела ошибки;
 *  - `/create-payment` ok, но без confirmationUrl / не ok с разными формами
 *    тела ошибки;
 *  - промокод: `/promo` вернул ошибку в РАЗНЫХ формах (`message` строкой,
 *    `message` массивом, только `error`, пустое тело, сам `.json()` рвётся) —
 *    во всех случаях сабмит прерывается и показывает конкретный текст;
 *  - сетевой сбой без `.message` (пустой Error) → показывается дефолтный
 *    текст ошибки, а не "undefined"/пусто.
 *
 * Исполнение скрипта — через помощник покрытия `astroInlineRunners`.
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

function selectDelivery(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("checkout:delivery-changed", { detail }),
  );
}

const SELF_PICKUP = {
  type: "self_pickup",
  label: "Самовывоз",
  costCents: 0,
  tariffCode: null,
};

function baseCart() {
  (window as any).cartStore = {
    getItems: () => [
      { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
    ],
    syncToServer: jest.fn(async () => "cart_new"),
  };
}

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};
const urlsOf = (mock: jest.Mock) => mock.mock.calls.map((c) => String(c[0]));

const errorElOf = (section: HTMLElement) =>
  section.querySelector("[data-checkout-submit-error]") as HTMLElement;
const btnOf = (section: HTMLElement) =>
  section.querySelector("[data-checkout-submit]") as HTMLButtonElement;

async function submit(section: HTMLElement) {
  btnOf(section).click();
  await new Promise((r) => setTimeout(r, 10));
}

function cleanup() {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  baseCart();
  (window as any).__MERFY_CONFIG__ = {
    shopId: "shop1",
    apiUrl: "https://gateway.test/api",
  };
  delete (window as any).location;
  (window as any).location = { origin: "https://shop.test", href: "" };
});
afterEach(cleanup);

/** Успешная цепочка для /customer, /address, /checkout, /create-payment;
 * конкретный тест переопределяет нужный URL через doOverride. */
function successChain(
  overrides: Record<string, () => Promise<unknown>> = {},
): jest.Mock {
  return jest.fn((url: string) => {
    for (const [re, handler] of Object.entries(overrides)) {
      if (new RegExp(re).test(url)) return handler();
    }
    if (/\/customer$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/address$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/delivery\/select$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    if (/\/checkout$/.test(url))
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: { orderId: "o1" } }),
      });
    if (/\/create-payment$/.test(url))
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { confirmationUrl: "https://pay.test/x" } }),
      });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe("CheckoutSubmit — токенизация карты (__checkoutTokenizeCard)", () => {
  it("paymentMethod=bank_card и токенайзер задан → его результат уходит как paymentToken в create-payment", async () => {
    const tokenize = jest.fn(async () => "tok_visa_1");
    (window as any).__checkoutTokenizeCard = tokenize;
    const fetchMock = successChain();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    document.dispatchEvent(
      new CustomEvent("checkout:payment-method-changed", {
        detail: { method: "bank_card" },
      }),
    );
    await submit(section);

    expect(tokenize).toHaveBeenCalledTimes(1);
    const payment = bodyOf(fetchMock, /\/create-payment$/);
    expect(payment.paymentToken).toBe("tok_visa_1");
  });
});

describe("CheckoutSubmit — /delivery/select для cdek_pickup вернул ошибку", () => {
  it("ok:false → «Не удалось сохранить пункт выдачи. Выберите точку заново.», /checkout не вызывается", async () => {
    const fetchMock = successChain({
      "/delivery/select$": () =>
        Promise.resolve({ ok: false, json: async () => ({}) }),
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_pickup",
      label: "ПВЗ",
      costCents: 30000,
      tariffCode: 136,
      pickupPointCode: "PVZ1",
    });
    await submit(section);

    expect(errorElOf(section).textContent).toBe(
      "Не удалось сохранить пункт выдачи. Выберите точку заново.",
    );
    expect(urlsOf(fetchMock).some((u) => /\/checkout$/.test(u))).toBe(false);
  });
});

describe("CheckoutSubmit — /checkout вернул 404 (корзина устарела)", () => {
  it("cartId сбрасывается из localStorage, показывается «Корзина устарела…»", async () => {
    localStorage.setItem("merfy:cartId", "cart_stale");
    const fetchMock = successChain({
      "/checkout$": () =>
        Promise.resolve({ ok: false, status: 404, json: async () => ({}) }),
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await submit(section);

    expect(localStorage.getItem("merfy:cartId")).toBeNull();
    expect(errorElOf(section).textContent).toBe(
      "Корзина устарела. Вернитесь в каталог и добавьте товары заново.",
    );
    expect(urlsOf(fetchMock).some((u) => /\/create-payment$/.test(u))).toBe(
      false,
    );
  });
});

type FakeJsonResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};
type FailureCase = [
  label: string,
  response: FakeJsonResponse,
  expectedMessage: string,
];

describe("CheckoutSubmit — /checkout: ok без orderId / не ok с разными телами ошибки", () => {
  const cases: FailureCase[] = [
    [
      "ok но data пуст → дефолтный текст",
      { ok: true, status: 200, json: async () => ({ data: {} }) },
      "Не удалось оформить заказ",
    ],
    [
      "не ok, есть error → текст error",
      { ok: false, status: 500, json: async () => ({ error: "server_error" }) },
      "server_error",
    ],
    [
      "не ok, есть message (без error) → текст message",
      {
        ok: false,
        status: 500,
        json: async () => ({ message: "Заказ уже оплачен" }),
      },
      "Заказ уже оплачен",
    ],
    [
      "не ok, json() резолвится в null → дефолтный текст",
      { ok: false, status: 500, json: async () => null },
      "Не удалось оформить заказ",
    ],
  ];
  it.each(cases)("%s", async (_label, response, expectedMessage) => {
    const fetchMock = successChain({
      "/checkout$": () => Promise.resolve(response),
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await submit(section);

    expect(errorElOf(section).textContent).toBe(expectedMessage);
    expect(urlsOf(fetchMock).some((u) => /\/create-payment$/.test(u))).toBe(
      false,
    );
  });
});

describe("CheckoutSubmit — /create-payment: ok без confirmationUrl / не ok с разными телами ошибки", () => {
  const cases: FailureCase[] = [
    [
      "ok но data пуст → дефолтный текст",
      { ok: true, json: async () => ({ data: {} }) },
      "Ошибка платежа",
    ],
    [
      "не ok, есть error → текст error",
      { ok: false, json: async () => ({ error: "payment_declined" }) },
      "payment_declined",
    ],
    [
      "не ok, есть message (без error) → текст message",
      { ok: false, json: async () => ({ message: "Недостаточно средств" }) },
      "Недостаточно средств",
    ],
    [
      "не ok, json() резолвится в null → дефолтный текст",
      { ok: false, json: async () => null },
      "Ошибка платежа",
    ],
  ];
  it.each(cases)("%s", async (_label, response, expectedMessage) => {
    const fetchMock = successChain({
      "/create-payment$": () => Promise.resolve(response),
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await submit(section);

    expect(errorElOf(section).textContent).toBe(expectedMessage);
    expect((window as any).location.href).toBe(""); // навигации не было
  });
});

describe("CheckoutSubmit — переприменение промокода: разные формы ошибки от /promo", () => {
  it.each([
    [
      "message массивом → берётся первый элемент",
      { ok: false, json: async () => ({ message: ["Ошибка 1", "Ошибка 2"] }) },
      "Ошибка 1",
    ],
    [
      "только error (без message) → текст error",
      { ok: false, json: async () => ({ error: "cart_not_found" }) },
      "cart_not_found",
    ],
    [
      "пустое тело (ни message, ни error) → дефолтный текст",
      { ok: false, json: async () => ({}) },
      "Промокод больше недействителен — обновите заказ",
    ],
  ] as const)("%s", async (_label, response, expectedMessage) => {
    sessionStorage.setItem("merfy:promoCode", "SALE10");
    const fetchMock = successChain({
      "/promo$": () => Promise.resolve(response),
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await submit(section);

    expect(errorElOf(section).textContent).toBe(expectedMessage);
    expect(urlsOf(fetchMock).some((u) => /\/checkout$/.test(u))).toBe(false);
  });

  it("сам promoRes.json() рвётся (реджект) → catch отдаёт null → дефолтный текст", async () => {
    sessionStorage.setItem("merfy:promoCode", "SALE10");
    const fetchMock = successChain({
      "/promo$": () =>
        Promise.resolve({
          ok: false,
          json: () => Promise.reject(new Error("bad json")),
        }),
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await submit(section);

    expect(errorElOf(section).textContent).toBe(
      "Промокод больше недействителен — обновите заказ",
    );
  });
});

describe("CheckoutSubmit — сетевой сбой без message (пустой Error)", () => {
  it("fetch отклоняется Error() без текста → показывается дефолтная фраза, а не пусто", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (/\/customer$/.test(url)) return Promise.reject(new Error());
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    await submit(section);

    expect(errorElOf(section).textContent).toBe("Не удалось оформить заказ");
  });
});
