/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — характеризационные тесты гейтов и обработчиков публичных
 * событий, не покрытых основным набором `checkout-submit-*`:
 *
 *  - canSubmit: гейт имени, когда ОБА источника (split-поле и fullName) пусты
 *    (surname/name режимы);
 *  - Gate B (клик-хендлер): реальный редирект на /login, когда токен пропал
 *    между тем, как кнопка стала активной, и самим кликом;
 *  - обработчики `checkout:delivery-changed` / `checkout:discount-applied` /
 *    `checkout:extension-discount-changed` без `detail` — не должны падать и
 *    не должны менять состояние;
 *  - periodMin/periodMax способа доставки долетают до /delivery/select;
 *  - getAuthToken: чтение токена бросает исключение → трактуется как гость,
 *    гейт не падает (defensive try/catch).
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
const TOKEN_KEY = "merfy_customer_token";

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

function mountSubmitDom(overrides: Fields = {}): HTMLElement {
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
    ...overrides,
  };
  document.body.innerHTML = `
    <section data-block="checkout-submit" data-puck-component-id="cs-1">
      <div data-checkout-submit-error role="alert" hidden></div>
      <button data-checkout-submit disabled>Оформить — —</button>
    </section>
    <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
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
    <div data-checkout-field="country"><input value="${v.country}" /></div>`;
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

function setConfig(checkout?: Record<string, unknown>) {
  (window as any).__MERFY_CONFIG__ = {
    shopId: "shop1",
    apiUrl: "https://gateway.test/api",
    checkout,
  };
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

function chainFetchMock(): jest.Mock {
  return jest.fn((url: string) => {
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

const bodyOf = (mock: jest.Mock, re: RegExp) => {
  const call = mock.mock.calls.find((c) => re.test(String(c[0])));
  return call ? JSON.parse((call[1] as any).body) : null;
};

function cleanup() {
  delete (window as any).cartStore;
  delete (window as any).fetch;
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).__checkoutTokenizeCard;
}

const errorElOf = (section: HTMLElement) =>
  section.querySelector("[data-checkout-submit-error]") as HTMLElement;
const btnOf = (section: HTMLElement) =>
  section.querySelector("[data-checkout-submit]") as HTMLButtonElement;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  baseCart();
  (window as any).fetch = jest.fn();
  delete (window as any).location;
  (window as any).location = { origin: "https://shop.test", href: "" };
});
afterEach(cleanup);

describe("CheckoutSubmit — гейт имени: оба источника пусты (surname/name)", () => {
  it.each([
    [
      "surname",
      { customerNameMode: "surname" },
      { lastName: "", fullName: "" },
    ],
    ["name", { customerNameMode: "name" }, { firstName: "", fullName: "" }],
  ] as const)(
    "режим %s: и split-поле, и fullName пусты → кнопка недоступна",
    (_, checkout, fields) => {
      setConfig(checkout as Record<string, unknown>);
      const section = mountSubmitDom(fields as Fields);
      runScript(section);
      selectDelivery(SELF_PICKUP);
      expect(btnOf(section).disabled).toBe(true);
    },
  );
});

describe("CheckoutSubmit — Gate B: токен пропал между включением кнопки и кликом", () => {
  it("requireCustomerAuth: токен был при последнем refresh(), но удалён до клика → редирект на /login, fetch не идёт", async () => {
    localStorage.setItem(TOKEN_KEY, "tok_abc");
    setConfig({ requireCustomerAuth: true });
    const fetchMock = jest.fn();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    const button = btnOf(section);
    expect(button.disabled).toBe(false); // токен был на момент refresh() — гейт пройден

    // Токен «протухает» посреди сессии БЕЗ события, которое вызвало бы refresh() —
    // ровно сценарий из комментария CheckoutSubmit.astro:325-328.
    localStorage.removeItem(TOKEN_KEY);
    expect(button.disabled).toBe(false); // DOM ещё не знает — стейл-состояние

    button.click();
    await new Promise((r) => setTimeout(r, 10));

    expect((window as any).location.href).toBe("/login?redirect=%2Fcheckout");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("CheckoutSubmit — публичные события без detail: не падают, не меняют состояние", () => {
  it("checkout:delivery-changed без detail → игнорируется (способ доставки не выбран)", () => {
    const section = mountSubmitDom();
    runScript(section);
    expect(() =>
      document.dispatchEvent(new CustomEvent("checkout:delivery-changed")),
    ).not.toThrow();
    // addressRequired по умолчанию true, способ доставки так и не выбран → недоступна.
    expect(btnOf(section).disabled).toBe(true);
  });

  it("checkout:discount-applied без detail → скидка не применяется, сумма не меняется", () => {
    const section = mountSubmitDom();
    runScript(section);
    const before = btnOf(section).textContent;
    document.dispatchEvent(new CustomEvent("checkout:discount-applied"));
    expect(btnOf(section).textContent).toBe(before);
  });

  it("checkout:extension-discount-changed без detail → скидка не применяется, сумма не меняется", () => {
    const section = mountSubmitDom();
    runScript(section);
    const before = btnOf(section).textContent;
    document.dispatchEvent(
      new CustomEvent("checkout:extension-discount-changed"),
    );
    expect(btnOf(section).textContent).toBe(before);
  });

  it("checkout:payment-method-changed без detail (или без method) → способ оплаты не меняется", async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(() =>
      document.dispatchEvent(
        new CustomEvent("checkout:payment-method-changed"),
      ),
    ).not.toThrow();
    expect(() =>
      document.dispatchEvent(
        new CustomEvent("checkout:payment-method-changed", { detail: {} }),
      ),
    ).not.toThrow();
    // paymentMethod остался дефолтным 'bank_card' (единственное значение при инициализации) —
    // проверяем по факту, что checkout всё равно проходит с этим методом.
    await new Promise((r) => setTimeout(r, 0));
    (btnOf(section) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(bodyOf(fetchMock, /\/checkout$/).metadata.paymentMethod).toBe(
      "bank_card",
    );
  });
});

describe("CheckoutSubmit — periodMin/periodMax способа доставки долетают до /delivery/select", () => {
  it("cdek_pickup с periodMin/periodMax → значения передаются в теле /delivery/select как есть", async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_pickup",
      label: "До пункта выдачи",
      costCents: 51000,
      tariffCode: 138,
      pickupPointCode: "PVZ77",
      periodMin: 2,
      periodMax: 5,
    });
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 10));

    const select = bodyOf(fetchMock, /\/delivery\/select$/);
    expect(select.periodMin).toBe(2);
    expect(select.periodMax).toBe(5);
  });

  it("cdek_pickup БЕЗ costCents и БЕЗ tariffCode → deliveryCostCents=0, поле tariffCode в теле отсутствует", async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery({
      type: "cdek_pickup",
      label: "До пункта выдачи",
      pickupPointCode: "PVZ77",
      // costCents и tariffCode намеренно не переданы (undefined)
    });
    btnOf(section).click();
    await new Promise((r) => setTimeout(r, 10));

    const select = bodyOf(fetchMock, /\/delivery\/select$/);
    expect(select.deliveryCostCents).toBe(0);
    expect("tariffCode" in select).toBe(false);
  });

  describe("известные дефекты (ТЕКУЩЕЕ ПОВЕДЕНИЕ)", () => {
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (сомнительно): canSubmit() требует pickupPointCode для
    // cdek_pickup ОДИН РАЗ, синхронно, в начале клик-хендлера (строка 333). Но
    // сам pickupPointCode ЧИТАЕТСЯ ПОВТОРНО из state.deliveryMethod уже ПОСЛЕ
    // первого await (await window.cartStore.syncToServer(), строка 344) — между
    // этими двумя моментами есть окно, где новое событие checkout:delivery-changed
    // (например, пользователь снял выбор ПВЗ, пока шёл запрос) успевает заменить
    // state.deliveryMethod. Гейт это уже не перепроверяет: код молча уходит в
    // /delivery/select БЕЗ pickupPointCode (строка 455, false-ветка) вместо того
    // чтобы прервать оформление, как для случая «ПВЗ не выбран изначально».
    it("ПВЗ сброшен ПОСЛЕ клика, пока идёт await (гонка) → /delivery/select уходит без pickupPointCode", async () => {
      setConfig(undefined);
      const fetchMock = chainFetchMock();
      (window as any).fetch = fetchMock;
      const section = mountSubmitDom();
      runScript(section);
      selectDelivery({
        type: "cdek_pickup",
        label: "До пункта выдачи",
        costCents: 30000,
        tariffCode: 136,
        pickupPointCode: "PVZ1",
      });
      expect(btnOf(section).disabled).toBe(false); // canSubmit() прошёл — точка выбрана

      btnOf(section).click(); // async-хендлер стартует и приостанавливается на первом await
      // Синхронно (до первого тика микрозадач) заменяем способ доставки — тем же
      // типом, но БЕЗ pickupPointCode.
      selectDelivery({
        type: "cdek_pickup",
        label: "До пункта выдачи",
        costCents: 30000,
        tariffCode: 136,
      });

      await new Promise((r) => setTimeout(r, 10));

      const select = bodyOf(fetchMock, /\/delivery\/select$/);
      expect(select).not.toBeNull(); // запрос всё равно ушёл...
      expect("pickupPointCode" in select).toBe(false); // ...но без кода точки выдачи
    });
  });
});

describe("CheckoutSubmit — errorEl отсутствует в разметке: showError/clearError не падают", () => {
  it("секция без [data-checkout-submit-error] → ошибка сабмита не показывается, но скрипт не падает", async () => {
    setConfig(undefined);
    document.body.innerHTML = `
      <section data-block="checkout-submit" data-puck-component-id="cs-1">
        <button data-checkout-submit disabled>Оформить — —</button>
      </section>
      <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
      <div data-checkout-field="email"><input value="a@b.ru" /></div>
      <div data-checkout-field="firstName"><input value="Иван" /></div>
      <div data-checkout-field="lastName"><input value="Петров" /></div>
      <div data-checkout-field="phone"><input value="+79990000000" /></div>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    expect(section.querySelector("[data-checkout-submit-error]")).toBeNull();

    (window as any).fetch = jest.fn(() =>
      Promise.reject(new Error("сеть недоступна")),
    );
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(() => btnOf(section).click()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    // Кнопка вернулась в исходное состояние (submitting сброшен) — доказывает,
    // что catch отработал до конца, несмотря на отсутствующий errorEl.
    expect(btnOf(section).disabled).toBe(false);
  });
});

describe("CheckoutSubmit — sessionStorage недоступен во время сабмита", () => {
  it('typeof sessionStorage === "undefined" → чекаут проходит без переприменения промокода и без падения на очистке', async () => {
    setConfig(undefined);
    const fetchMock = chainFetchMock();
    (window as any).fetch = fetchMock;
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);

    const realSessionStorage = window.sessionStorage;
    // @ts-expect-error — временно убираем sessionStorage целиком (typeof-гейт в скрипте)
    delete window.sessionStorage;
    try {
      await expect(
        (async () => {
          btnOf(section).click();
          await new Promise((r) => setTimeout(r, 10));
        })(),
      ).resolves.toBeUndefined();
      expect(bodyOf(fetchMock, /\/checkout$/)).not.toBeNull(); // чекаут всё равно прошёл
      expect((window as any).location.href).toBe("https://pay.test/x");
    } finally {
      Object.defineProperty(window, "sessionStorage", {
        value: realSessionStorage,
        configurable: true,
      });
    }
  });
});

describe("CheckoutSubmit — getAuthToken: чтение токена бросает исключение → трактуется как гость", () => {
  it("localStorage.getItem бросает → канSubmit не падает, кнопка недоступна, подсказка про вход показана", () => {
    setConfig({ requireCustomerAuth: true });
    const section = mountSubmitDom();
    runScript(section);
    selectDelivery(SELF_PICKUP);
    expect(btnOf(section).disabled).toBe(true); // без токена — уже недоступна

    const realLocalStorage = window.localStorage;
    const throwing: Partial<Storage> = {
      getItem: () => {
        throw new Error("QuotaExceededError-подобная ошибка чтения");
      },
    };
    Object.defineProperty(window, "localStorage", {
      value: throwing,
      configurable: true,
    });
    try {
      expect(() =>
        document.dispatchEvent(new CustomEvent("checkout:config-ready")),
      ).not.toThrow();
      expect(btnOf(section).disabled).toBe(true);
      expect(errorElOf(section).textContent).toMatch(/Войдите/);
    } finally {
      Object.defineProperty(window, "localStorage", {
        value: realLocalStorage,
        configurable: true,
      });
    }
  });
});
