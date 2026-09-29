/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryMethod — контракт денег и данных СДЭК, который уходит в
 * `checkout:delivery-changed` (ревью): деньги (costCents) и поля СДЭК
 * (tariffCode, pickupPointCode/Address) раньше проверялись частично
 * (toMatchObject / отдельные поля). Здесь — `toEqual` детали ЦЕЛИКОМ для
 * курьера СДЭК (cdek_door), ПВЗ СДЭК до и после выбора точки (cdek_pickup),
 * своего тарифа (custom) и самовывоза (self_pickup); плюс точный URL+тело
 * запроса расчёта (включая случай с индексом, резолвленным по ФИАС) и точный
 * URL запроса пунктов выдачи.
 *
 * Скрипт исполняется через astroInlineRunners (один <script> в файле, индекс
 * [0]), покрытие пишется под путём CheckoutDeliveryMethod.astro. Выбор способа
 * — кликом по карточке, как это делает покупатель (без ручной подачи
 * checkout:delivery-changed).
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutDeliveryMethod",
  "CheckoutDeliveryMethod.astro",
);

function mountDom(pickupEnabled = true): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true"
             data-cdek-door-label="Курьер СДЭК до двери"
             data-cdek-pvz-label="Пункт выдачи СДЭК"
             data-cdek-postamat-label="Постамат СДЭК"
             data-pickup-enabled="${pickupEnabled ? "true" : "false"}"
             data-pickup-label="Самовывоз"
             data-free-shipping-threshold="">
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>`;
  return document.querySelector(
    "[data-checkout-delivery-method]",
  ) as HTMLElement;
}

// document переживает все it() файла — снимаем listener'ы скрипта между тестами
// (тот же приём, что в checkout-delivery-method.coverage.dom.test.ts), иначе к
// N-му тесту накапливается N экземпляров скрипта и счётчики fetch/событий врут.
let capturedDocListeners: Array<[string, EventListenerOrEventListenerObject]> =
  [];

function runInstrumented(runIt: () => void) {
  const originalAdd = document.addEventListener.bind(document);
  (document as any).addEventListener = (
    type: string,
    listener: any,
    opts2?: any,
  ) => {
    capturedDocListeners.push([type, listener]);
    return originalAdd(type, listener, opts2);
  };
  try {
    runIt();
  } finally {
    document.addEventListener = originalAdd;
  }
  jest.clearAllTimers(); // гасим safety-net таймер (~1500мс) — сценарии здесь его не проверяют
}

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  runInstrumented(() => astroInlineRunners(ASTRO)[0].run({ blockId: "cdm-1" }));
}

function dispatchAddress(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("checkout:address-changed", { detail }),
  );
}

async function tick(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Захватывает ПОСЛЕДНИЙ detail события checkout:delivery-changed. */
function captureLastDelivery(): { last: () => any } {
  let last: any = null;
  const onChanged = (e: any) => {
    last = e.detail;
  };
  document.addEventListener("checkout:delivery-changed", onChanged);
  capturedDocListeners.push(["checkout:delivery-changed", onChanged]);
  return { last: () => last };
}

describe("CheckoutDeliveryMethod — деньги и данные СДЭК в checkout:delivery-changed (toEqual целиком)", () => {
  let fetchMock: jest.Mock;

  // Один расчёт с четырьмя типами карточек одновременно: своя доставка (OWN →
  // custom), курьер СДЭК (PARTNER door → cdek_door), ПВЗ СДЭК (PARTNER pickup
  // → cdek_pickup) и самовывоз магазина (pickupPoints → self_pickup).
  const CALC = {
    success: true,
    data: {
      deliveryOptions: [
        {
          id: "own1",
          name: "Своя доставка",
          type: "OWN",
          price: 250,
          minDays: 2,
          maxDays: 4,
          description: "Наш курьер",
        },
        {
          id: "door1",
          name: "неважно (label берётся из data-cdek-door-label)",
          type: "PARTNER",
          price: 450,
          minDays: 1,
          maxDays: 2,
          description: "",
          cdekTariffCode: 137,
          deliveryMode: "door",
        },
        {
          id: "pvz1",
          name: "неважно",
          type: "PARTNER",
          price: 300,
          minDays: 2,
          maxDays: 5,
          description: "",
          cdekTariffCode: 138,
          deliveryMode: "pickup",
          pickupPointKind: "PVZ",
        },
      ],
      pickupPoints: [{ id: "shop-pp-1", address: "Шоурум, ул. Тестовая, 10" }],
    },
  };

  const POINTS = {
    success: true,
    data: [{ code: "PVZ-777", address: "ул. Складская, 9", type: "PVZ" }],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("merfy:cartId", "cart1");
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    (window as any).cartStore = { getTotal: () => 100000 };
    fetchMock = jest.fn((url: string) => {
      if (/\/delivery\/pickup-points/.test(url))
        return Promise.resolve({ ok: true, json: async () => POINTS });
      if (/\/delivery\/calculate/.test(url))
        return Promise.resolve({ ok: true, json: async () => CALC });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
  });

  afterEach(() => {
    capturedDocListeners.forEach(([type, listener]) =>
      document.removeEventListener(type, listener),
    );
    capturedDocListeners = [];
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
    document.body.innerHTML = "";
  });

  it("cdek_door — курьер СДЭК: detail целиком (тариф, цена, срок, label из настройки, без точки ПВЗ)", async () => {
    const section = mountDom();
    const cap = captureLastDelivery();
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    (
      section.querySelector('[data-delivery-type="cdek_door"]') as HTMLElement
    ).click();

    expect(cap.last()).toEqual({
      type: "cdek_door",
      tariffCode: 137,
      customTariffId: null,
      pickupPointId: null,
      costCents: 45000, // 450₽ → копейки
      periodMin: 1,
      periodMax: 2,
      label: "Курьер СДЭК до двери", // из data-cdek-door-label, не из name тарифа
      pickupPointCode: null,
      pickupPointAddress: null,
    });
  });

  it("cdek_pickup ДО выбора точки — detail целиком (тариф, цена, срок; код/адрес точки пусты)", async () => {
    const section = mountDom();
    const cap = captureLastDelivery();
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    (
      section.querySelector('[data-delivery-type="cdek_pickup"]') as HTMLElement
    ).click();
    await tick(); // клик открывает пикер (fetch pickup-points) — детали события это не меняют

    expect(cap.last()).toEqual({
      type: "cdek_pickup",
      tariffCode: 138,
      customTariffId: null,
      pickupPointId: null,
      costCents: 30000, // 300₽
      periodMin: 2,
      periodMax: 5,
      label: "Пункт выдачи СДЭК",
      pickupPointCode: null,
      pickupPointAddress: null,
    });
  });

  it("cdek_pickup ПОСЛЕ выбора точки — detail целиком (появляются код и адрес выбранного ПВЗ, остальные поля те же)", async () => {
    const section = mountDom();
    const cap = captureLastDelivery();
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    (
      section.querySelector('[data-delivery-type="cdek_pickup"]') as HTMLElement
    ).click();
    await tick(); // пикер раскрылся и загрузил точки

    const row = section.querySelector("[data-pvz-row]") as HTMLElement;
    expect(row.getAttribute("data-pvz-code")).toBe("PVZ-777"); // подстраховка: точка та, что ожидаем
    row.click();

    expect(cap.last()).toEqual({
      type: "cdek_pickup",
      tariffCode: 138,
      customTariffId: null,
      pickupPointId: null,
      costCents: 30000,
      periodMin: 2,
      periodMax: 5,
      label: "Пункт выдачи СДЭК",
      pickupPointCode: "PVZ-777",
      pickupPointAddress: "ул. Складская, 9",
    });
  });

  it("custom (свой тариф магазина) — detail целиком (customTariffId строкой, periodMin/Max ВСЕГДА null — buildOptions их не кладёт)", async () => {
    const section = mountDom();
    const cap = captureLastDelivery();
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    (
      section.querySelector('[data-delivery-type="custom"]') as HTMLElement
    ).click();

    expect(cap.last()).toEqual({
      type: "custom",
      tariffCode: null,
      customTariffId: "own1", // строка — id тарифа как есть, не парсится в число
      pickupPointId: null,
      costCents: 25000, // 250₽
      periodMin: null, // buildOptions не переносит minDays/maxDays в OWN-опцию
      periodMax: null,
      label: "Своя доставка",
      pickupPointCode: null,
      pickupPointAddress: null,
    });
  });

  it("self_pickup (самовывоз магазина) — detail целиком (id точки, нулевая цена, periodMin/Max null)", async () => {
    const section = mountDom(true);
    const cap = captureLastDelivery();
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    (
      section.querySelector('[data-delivery-type="self_pickup"]') as HTMLElement
    ).click();

    expect(cap.last()).toEqual({
      type: "self_pickup",
      tariffCode: null,
      customTariffId: null,
      pickupPointId: "shop-pp-1",
      costCents: 0,
      periodMin: null,
      periodMax: null,
      label: "Самовывоз", // единственная точка магазина — без уточнения городом/адресом
      pickupPointCode: null,
      pickupPointAddress: null,
    });
  });
});

describe("CheckoutDeliveryMethod — полный URL и тело запроса расчёта/пунктов выдачи", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("merfy:cartId", "cart1");
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    (window as any).cartStore = { getTotal: () => 100000 };
    fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            deliveryOptions: [
              {
                id: "own1",
                name: "Своя доставка",
                type: "OWN",
                price: 100,
                minDays: 1,
                maxDays: 1,
              },
            ],
            pickupPoints: [],
          },
        }),
      }),
    );
    (window as any).fetch = fetchMock;
  });

  afterEach(() => {
    capturedDocListeners.forEach(([type, listener]) =>
      document.removeEventListener(type, listener),
    );
    capturedDocListeners = [];
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
    delete (window as any).__DADATA_TOKEN__;
    document.body.innerHTML = "";
  });

  it("cityFiasId+postalCode переданы формой явно — URL и тело запроса /delivery/calculate целиком", async () => {
    const section = mountDom(false);
    runScript(section);
    dispatchAddress({ cityFiasId: "77000000000", postalCode: "190000" });
    await tick();

    const call = fetchMock.mock.calls.find((c) =>
      /\/delivery\/calculate/.test(String(c[0])),
    )!;
    expect(String(call[0])).toBe(
      "https://gateway.test/api/store/carts/cart1/delivery/calculate?store_id=shop1",
    );
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      cityFiasId: "77000000000",
      postalCode: "190000",
    });
  });

  it("postalCode НЕ пришёл от формы (только cityFiasId) — индекс резолвится по ФИАС и уходит в теле /delivery/calculate", async () => {
    (window as any).__DADATA_TOKEN__ = "tok";
    fetchMock.mockImplementation((url: string) => {
      if (/findById\/address/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            suggestions: [{ data: { postal_code: "101000" } }],
          }),
        });
      if (/\/delivery\/calculate/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "own1",
                  name: "Своя доставка",
                  type: "OWN",
                  price: 100,
                  minDays: 1,
                  maxDays: 1,
                },
              ],
              pickupPoints: [],
            },
          }),
        });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const section = mountDom(false);
    runScript(section);
    dispatchAddress({ cityFiasId: "77000000000" }); // без postalCode
    await tick();

    const call = fetchMock.mock.calls.find((c) =>
      /\/delivery\/calculate/.test(String(c[0])),
    )!;
    expect(String(call[0])).toBe(
      "https://gateway.test/api/store/carts/cart1/delivery/calculate?store_id=shop1",
    );
    expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
      cityFiasId: "77000000000",
      postalCode: "101000", // подставлен резолвом по fiasId, а не пришёл от формы
    });
  });

  it("URL запроса пунктов выдачи (/delivery/pickup-points) целиком", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (/\/delivery\/calculate/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "pvz1",
                  name: "ПВЗ",
                  type: "PARTNER",
                  price: 300,
                  minDays: 1,
                  maxDays: 3,
                  cdekTariffCode: 138,
                  deliveryMode: "pickup",
                  pickupPointKind: "PVZ",
                },
              ],
              pickupPoints: [],
            },
          }),
        });
      if (/\/delivery\/pickup-points/.test(url))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [{ code: "P1", address: "ул А", type: "PVZ" }],
          }),
        });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const section = mountDom(false);
    runScript(section);
    dispatchAddress({ cityFiasId: "77000000000", postalCode: "190000" });
    await tick();

    (
      section.querySelector('[data-delivery-type="cdek_pickup"]') as HTMLElement
    ).click();
    await tick();

    const call = fetchMock.mock.calls.find((c) =>
      /\/delivery\/pickup-points/.test(String(c[0])),
    )!;
    expect(String(call[0])).toBe(
      "https://gateway.test/api/store/carts/cart1/delivery/pickup-points?store_id=shop1&cityFiasId=77000000000",
    );
  });
});
