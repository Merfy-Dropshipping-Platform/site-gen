/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — характеризационные тесты источников данных о корзине и
 * магазине, которые не задействует основной набор `checkout-submit-*`:
 *
 *  - разрешение корня секции: `window.__merfyRoot` отсутствует/не находит
 *    секцию → резервный `document.querySelector('[data-block="checkout-submit"]')`
 *    (Spec 102, merfy-root-allow: page-singleton);
 *  - `getApiBase`/`getShopId` — дефолты, когда в `__MERFY_CONFIG__` нет
 *    соответствующего поля;
 *  - `getCartId` — резервный источник cartId из `localStorage['merfy:cartId']`,
 *    когда у `cartStore` нет `syncToServer` (темы без rose lib/cart);
 *  - `getCartItems` — резервный разбор корзины из `localStorage['<тема>:cart:v1']`,
 *    когда `cartStore` отсутствует или его `getItems()` пуст;
 *  - `getSubtotalCents` — арифметика с частично отсутствующими полями строки
 *    корзины (`priceCents` без `unitPriceCents`, товар совсем без цены);
 *  - адресные хелперы, когда секции `CheckoutDeliveryForm`
 *    (`[data-checkout-delivery]`) нет в DOM вовсе (превью/фрагмент без формы).
 *
 * Исполнение скрипта — через помощник покрытия `astroInlineRunners`
 * (packages/theme-base/__tests__/helpers/astro-inline-script.ts).
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

type Fields = Partial<{
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  fullName: string;
  city: string;
  postalCode: string;
  street: string;
  building: string;
  apartment: string;
  country: string;
}>;

/** Полная разметка (как в остальных checkout-submit-*), с флагами на отсутствие
 * секции/кнопки/формы доставки/поля страны — под конкретный сценарий теста. */
function mountSubmitDom(
  opts: {
    fields?: Fields;
    withSection?: boolean;
    withButton?: boolean;
    withDeliveryDiv?: boolean;
    withFiasAttr?: boolean;
    withCountryField?: boolean;
  } = {},
): void {
  const {
    fields = {},
    withSection = true,
    withButton = true,
    withDeliveryDiv = true,
    withFiasAttr = true,
    withCountryField = true,
  } = opts;
  const v = {
    email: "a@b.ru",
    phone: "+79990000000",
    firstName: "Иван",
    lastName: "Петров",
    fullName: "",
    city: "Москва",
    postalCode: "101000",
    street: "Ленина",
    building: "1",
    apartment: "5",
    country: "Россия",
    ...fields,
  };
  const section = withSection
    ? `<section data-block="checkout-submit" data-puck-component-id="cs-1">
        ${withButton ? '<div data-checkout-submit-error role="alert" hidden></div><button data-checkout-submit disabled>Оформить — —</button>' : ""}
      </section>`
    : "";
  const deliveryDiv = withDeliveryDiv
    ? `<div data-checkout-delivery${withFiasAttr ? ' data-selected-city-fias-id="fias-1"' : ""}></div>`
    : "";
  const countryField = withCountryField
    ? `<div data-checkout-field="country"><input value="${v.country}" /></div>`
    : "";
  document.body.innerHTML = `
    ${section}
    ${deliveryDiv}
    <div data-checkout-field="email"><input value="${v.email}" /></div>
    <div data-checkout-field="phone"><input value="${v.phone}" /></div>
    <div data-checkout-field="firstName"><input value="${v.firstName}" /></div>
    <div data-checkout-field="lastName"><input value="${v.lastName}" /></div>
    <div data-checkout-field="fullName"><input value="${v.fullName}" /></div>
    <div data-checkout-field="city"><input value="${v.city}" /></div>
    <div data-checkout-field="postalCode"><input value="${v.postalCode}" /></div>
    <div data-checkout-field="street"><input value="${v.street}" /></div>
    <div data-checkout-field="building"><input value="${v.building}" /></div>
    <div data-checkout-field="apartment"><input value="${v.apartment}" /></div>
    ${countryField}`;
}

function runScript(
  vars: Partial<{
    buttonText: string;
    loadingText: string;
    successRedirectUrl: string;
    blockId: string;
  }> = {},
) {
  astroInlineRunners(ASTRO)[0].run({
    buttonText: "Оформить — {total}",
    loadingText: "Оформляем…",
    successRedirectUrl: "/checkout/result",
    blockId: "cs-1",
    ...vars,
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

const btn = () =>
  document.querySelector("[data-checkout-submit]") as HTMLButtonElement;
const errorEl = () =>
  document.querySelector("[data-checkout-submit-error]") as HTMLElement;

/** Fetch mock, покрывающий всю цепочку checkout; записывает вызовы для проверок. */
function chainFetchMock(): jest.Mock {
  return jest.fn((url: string) => {
    if (/\/customer$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({}) });
    if (/\/address$/.test(url))
      return Promise.resolve({ ok: true, json: async () => ({}) });
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

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};
const urlsOf = (mock: jest.Mock) => mock.mock.calls.map((c) => String(c[0]));

async function submit() {
  btn().click();
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
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).location;
  (window as any).location = { origin: "https://shop.test", href: "" };
});
afterEach(cleanup);

describe("CheckoutSubmit — разрешение корня секции (Spec 102)", () => {
  // ТЕКУЩЕЕ ПОВЕДЕНИЕ (сомнительно): первый инлайн-скрипт (строка 50) вызывает
  // `window.__merfyRoot(blockId)` БЕЗ проверки `typeof ... === 'function'` —
  // в отличие от второго скрипта (строка 584: `typeof window.__merfyRoot ===
  // 'function' ? window.__merfyRoot(blockId) : null`). Если хелпер не
  // инжектирован вовсе (не функция), первый скрипт падает с TypeError, а не
  // тихо переходит на резервный document.querySelector — это разное
  // поведение двух скриптов одного блока. CLAUDE.md заявляет хелпер
  // инжектированным всегда (live+preview), поэтому на практике это не
  // проявляется, но резерв `|| document.querySelector(...)` реально спасает
  // только случай «хелпер есть, но вернул null» (не нашёл секцию по id),
  // а не случай «хелпера нет вовсе».
  it("window.__merfyRoot есть, но не находит секцию (вернул null) → резерв document.querySelector", () => {
    (window as any).__merfyRoot = () => null;
    mountSubmitDom();
    runScript();
    // refresh() отработал через резервный поиск: плейсхолдер «—» заменился суммой.
    expect(btn().textContent).toContain("0₽");
  });

  it('секции [data-block="checkout-submit"] нет вообще в DOM (резерв тоже не находит) → скрипт тихо завершается', () => {
    (window as any).__merfyRoot = () => null;
    document.body.innerHTML = "<div>пустая страница без блока</div>";
    expect(() => runScript()).not.toThrow();
  });

  it("секция есть, но кнопки [data-checkout-submit] нет → скрипт тихо завершается", () => {
    mountSubmitDom({ withButton: false });
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    expect(() => runScript()).not.toThrow();
  });
});

describe("CheckoutSubmit — getApiBase/getShopId: дефолты при неполном __MERFY_CONFIG__", () => {
  beforeEach(() => {
    (window as any).cartStore = {
      getItems: () => [
        { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
      ],
      syncToServer: jest.fn(async () => "cart_new"),
    };
    (window as any).fetch = jest.fn();
  });

  it("apiUrl отсутствует (shopId есть) → запросы уходят на дефолтный https://gateway.merfy.ru/api", async () => {
    (window as any).__MERFY_CONFIG__ = { shopId: "shop1" }; // без apiUrl
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    expect(btn().disabled).toBe(false); // shopId есть — гейт проходит
    await submit();
    expect(
      urlsOf(fetchMock).every((u) =>
        u.startsWith("https://gateway.merfy.ru/api"),
      ),
    ).toBe(true);
  });

  it("shopId отсутствует (apiUrl есть) → кнопка недоступна (нет id магазина)", () => {
    (window as any).__MERFY_CONFIG__ = { apiUrl: "https://gateway.test/api" }; // без shopId
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    expect(btn().disabled).toBe(true);
  });
});

describe("CheckoutSubmit — getCartId: резерв из localStorage, когда cartStore без syncToServer", () => {
  beforeEach(() => {
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    (window as any).fetch = jest.fn();
  });

  it("cartStore без syncToServer, но merfy:cartId в localStorage → чекаут идёт по этому cartId", async () => {
    (window as any).cartStore = {
      getItems: () => [
        { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
      ],
      // syncToServer намеренно отсутствует
    };
    localStorage.setItem("merfy:cartId", "cart_legacy");
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    await submit();
    expect(
      urlsOf(fetchMock).some((u) => /\/cart\/cart_legacy\/checkout$/.test(u)),
    ).toBe(true);
  });

  it("ни syncToServer, ни merfy:cartId в localStorage → «Корзина пуста. Добавьте товары.»", async () => {
    (window as any).cartStore = {
      getItems: () => [
        { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
      ],
    };
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    await submit();
    expect(errorEl().textContent).toBe("Корзина пуста. Добавьте товары.");
    expect(urlsOf(fetchMock).some((u) => /\/checkout$/.test(u))).toBe(false);
  });
});

describe("CheckoutSubmit — getCartItems: резервный разбор localStorage[<тема>:cart:v1]", () => {
  beforeEach(() => {
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    (window as any).fetch = jest.fn();
    delete (window as any).cartStore; // ни одна тема-обёртка cartStore не установлена
  });

  it("нет cartStore и ни один префикс темы не хранит корзину → корзина пуста, кнопка недоступна", () => {
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    expect(btn().disabled).toBe(true);
  });

  it("flux:cart:v1 битый JSON пропускается, rose:cart:v1 валидный — используется он", async () => {
    localStorage.setItem("flux:cart:v1", "{ битый json");
    localStorage.setItem(
      "rose:cart:v1",
      JSON.stringify([
        {
          id: "l1",
          productId: "p1",
          quantity: 2,
          price: "199.99",
          variant: { variantCombinationId: "vc1" },
        },
        { id: "l2", productId: "p2", price: "50" }, // без quantity → по умолчанию 1, без variant
        { id: "l3", productId: "p3", quantity: 3 }, // без price → 0
        { id: "l4", productId: "p4", quantity: 1, price: "10", variant: {} }, // variant есть, id внутри нет
      ]),
    );
    localStorage.setItem("merfy:cartId", "cart_legacy2");
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    expect(btn().disabled).toBe(false);
    // 199.99₽×2=399.98 + 50₽×1=50 + 0×3=0 + 10₽×1=10 → 459.98 → округление 460₽.
    expect(btn().textContent).toContain("460₽");
    await submit();
    expect(
      urlsOf(fetchMock).some((u) => /\/cart\/cart_legacy2\/checkout$/.test(u)),
    ).toBe(true);
  });
});

describe("CheckoutSubmit — getSubtotalCents: частично отсутствующие поля цены/количества", () => {
  beforeEach(() => {
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    (window as any).fetch = jest.fn();
  });

  it("товар без unitPriceCents (только priceCents) и товар совсем без цены/quantity — сумма считается без падения", () => {
    (window as any).cartStore = {
      getItems: () => [
        { id: "a", productId: "pa", unitPriceCents: 20000, quantity: 1 },
        { id: "b", productId: "pb", priceCents: 30000, quantity: 2 }, // unitPriceCents отсутствует
        { id: "c", productId: "pc" }, // ни цены, ни quantity
      ],
    };
    mountSubmitDom();
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    // 200₽×1 + 300₽×2 + 0×1 = 800₽
    expect(btn().textContent).toContain("800₽");
  });
});

describe("CheckoutSubmit — адресные хелперы без секции CheckoutDeliveryForm в DOM", () => {
  beforeEach(() => {
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    (window as any).cartStore = {
      getItems: () => [
        { id: "i1", productId: "p1", quantity: 1, unitPriceCents: 100000 },
      ],
      syncToServer: jest.fn(async () => "cart_new"),
    };
    (window as any).fetch = jest.fn();
  });

  it('нет [data-checkout-delivery] и поля country — самовывоз всё равно оформляется с пустым fiasId и country="Россия"', async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    mountSubmitDom({
      withDeliveryDiv: false,
      withCountryField: false,
      fields: { city: "", street: "", building: "", apartment: "" },
    });
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP); // адрес-независимый способ — гейт не требует city/street
    expect(btn().disabled).toBe(false);
    await submit();

    const address = bodyOf(fetchMock, /\/address$/);
    expect(address).toMatchObject({
      country: "Россия",
      street: "",
      building: "",
      apartment: "",
    });
    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect(checkout.metadata.deliveryAddress.fiasId).toBe("");
    expect(checkout.metadata.deliveryAddress.country).toBe("Россия");
    expect(checkout.metadata.deliveryAddress.fullAddress).toBe("");
  });

  it("[data-checkout-delivery] есть, но без data-selected-city-fias-id → fiasId пустой (getAttribute вернул null)", async () => {
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    mountSubmitDom({ withFiasAttr: false });
    (window as any).__merfyRoot = () =>
      document.querySelector('[data-block="checkout-submit"]');
    runScript();
    selectDelivery(SELF_PICKUP);
    await submit();

    const checkout = bodyOf(fetchMock, /\/checkout$/);
    expect(checkout.metadata.deliveryAddress.fiasId).toBe("");
  });
});
