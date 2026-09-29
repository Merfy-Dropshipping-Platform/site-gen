/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryMethod — товары вне профиля доставки магазина: логистика
 * отдаёт их в `unavailableProducts` поля ответа /delivery/calculate
 * (undeliverableIds/cartLines/productName/undeliverableMessage,
 * CheckoutDeliveryMethod.astro строки ~199-228; вызов в render() — строка 605;
 * остановка ретраев — строка 848). Ответ финальный: повтор запроса его не
 * изменит, поэтому покупателю сразу называют товар(ы), а не показывают
 * «Считаем варианты…» до исчерпания всей лестницы ретраев (владелец 26.09).
 *
 * Скрипт исполняется через astroInlineRunners (единственный <script> файла,
 * индекс [0]), покрытие пишется под путём CheckoutDeliveryMethod.astro.
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

function mountDom(): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true" data-pickup-enabled="false"
             data-cdek-door-label="Курьер СДЭК до двери" data-cdek-pvz-label="Пункт выдачи СДЭК"
             data-cdek-postamat-label="Постамат СДЭК" data-pickup-label="Самовывоз"
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

// document переживает все it() одного файла — скрипт на каждый runScript()
// вешает НОВЫЕ document-level listener'ы (checkout:address-changed и др.).
// Без снятия их между тестами старые экземпляры отвечают на дальнейшие
// dispatchAddress() тоже и портят fetchMock-счётчики (тот же приём, что в
// checkout-delivery-method.coverage.dom.test.ts).
let capturedDocListeners: Array<[string, EventListenerOrEventListenerObject]> =
  [];

function runScript(section: HTMLElement) {
  (window as any).__merfyRoot = () => section;
  const originalAdd = document.addEventListener.bind(document);
  (document as any).addEventListener = (
    type: string,
    listener: any,
    opts?: any,
  ) => {
    capturedDocListeners.push([type, listener]);
    return originalAdd(type, listener, opts);
  };
  try {
    astroInlineRunners(ASTRO)[0].run({ blockId: "cdm-1" });
  } finally {
    document.addEventListener = originalAdd;
  }
  // Safety-net (~1500мс) не относится ни к одному сценарию файла — гасим сразу.
  jest.clearAllTimers();
}

function dispatchAddress(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("checkout:address-changed", { detail }),
  );
}
async function tick(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  await tick();
}

function mockCalculate(data: Record<string, unknown>) {
  return jest.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ success: true, data }) }),
  );
}

const errorTextOf = (section: HTMLElement) =>
  (section.querySelector("[data-checkout-delivery-error]") as HTMLElement)
    .textContent;
const errorHiddenOf = (section: HTMLElement) =>
  (section.querySelector("[data-checkout-delivery-error]") as HTMLElement)
    .hidden;

describe("CheckoutDeliveryMethod — товары вне профиля доставки (unavailableProducts)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("merfy:cartId", "cart1");
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
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

  describe("сообщение по товарам корзины — таблица сценариев", () => {
    const CASES: Array<{
      name: string;
      cart: Array<Record<string, unknown>>;
      unavailableProducts: Array<Record<string, unknown>>;
      expectedMessage: string;
    }> = [
      {
        name: "один товар, есть в корзине — назван по имени, единственное число",
        cart: [{ productId: "p1", name: "Сумка Guess" }],
        unavailableProducts: [{ productId: "p1" }],
        expectedMessage:
          "«Сумка Guess» пока нельзя доставить. Уберите его из корзины, чтобы оформить заказ.",
      },
      {
        name: "два товара, оба есть в корзине — оба названы, множественное число",
        cart: [
          { productId: "p1", name: "Сумка Guess" },
          { productId: "p2", name: "Шарф" },
        ],
        unavailableProducts: [{ productId: "p1" }, { productId: "p2" }],
        expectedMessage:
          "Эти товары пока нельзя доставить: «Сумка Guess», «Шарф». Уберите их из корзины, чтобы оформить заказ.",
      },
      {
        name: "один товар, имени в корзине нет (productId не найден) — общая фраза, единственное число",
        cart: [],
        unavailableProducts: [{ productId: "px" }],
        expectedMessage:
          "Один из товаров в корзине пока нельзя доставить. Уберите его, чтобы оформить заказ.",
      },
      {
        name: "два товара, ни одно имя не найдено — общая фраза, множественное число",
        cart: [],
        unavailableProducts: [{ productId: "px" }, { productId: "py" }],
        expectedMessage:
          "Некоторые товары в корзине пока нельзя доставить. Уберите их, чтобы оформить заказ.",
      },
      {
        name: "частичное совпадение (имя найдено только у одного из двух) — общая фраза, а не смешанный список",
        cart: [{ productId: "p1", name: "Сумка Guess" }],
        unavailableProducts: [{ productId: "p1" }, { productId: "px" }],
        expectedMessage:
          "Некоторые товары в корзине пока нельзя доставить. Уберите их, чтобы оформить заказ.",
      },
      {
        name: "запись без productId в unavailableProducts отфильтрована (Boolean) — остаётся один валидный id",
        cart: [{ productId: "p1", name: "Товар" }],
        unavailableProducts: [{ productId: "p1" }, {}],
        expectedMessage:
          "«Товар» пока нельзя доставить. Уберите его из корзины, чтобы оформить заказ.",
      },
      {
        name: "товар найден по productId, но без name/productName — пустое имя не проходит quoted-фильтр, общая фраза",
        cart: [{ productId: "p1" }],
        unavailableProducts: [{ productId: "p1" }],
        expectedMessage:
          "Один из товаров в корзине пока нельзя доставить. Уберите его, чтобы оформить заказ.",
      },
      {
        name: "productName-поле используется, если name отсутствует",
        cart: [{ productId: "p1", productName: "Через productName" }],
        unavailableProducts: [{ productId: "p1" }],
        expectedMessage:
          "«Через productName» пока нельзя доставить. Уберите его из корзины, чтобы оформить заказ.",
      },
    ];

    it.each(CASES)(
      "$name",
      async ({ cart, unavailableProducts, expectedMessage }) => {
        (window as any).cartStore = { getItems: () => cart };
        (window as any).fetch = mockCalculate({
          deliveryOptions: [],
          pickupPoints: [],
          unavailableProducts,
        });
        const section = mountDom();
        runScript(section);
        dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
        await tick();

        // Ответ финален — ни одного ретрая (не 4 попытки "Считаем варианты…").
        expect((window as any).fetch).toHaveBeenCalledTimes(1);
        expect(errorHiddenOf(section)).toBe(false);
        expect(errorTextOf(section)).toBe(expectedMessage);
      },
    );
  });

  it("сообщение показывается сразу и БЕЗ адреса (addressKnown=false) — опережает «Заполните адрес доставки»", async () => {
    (window as any).cartStore = {
      getItems: () => [{ productId: "p1", name: "Товар А" }],
    };
    (window as any).fetch = mockCalculate({
      deliveryOptions: [],
      pickupPoints: [],
      unavailableProducts: [{ productId: "p1" }],
    });
    const section = mountDom();
    runScript(section);
    dispatchAddress({}); // без cityFiasId → addressKnown=false
    await tick();

    expect((window as any).fetch).toHaveBeenCalledTimes(1);
    expect(errorHiddenOf(section)).toBe(false);
    expect(errorTextOf(section)).toContain("Товар А");
  });

  describe("отсутствие/пустота поля — обычный ретрай-цикл, а НЕ недоставляемые товары", () => {
    const ABSENT_CASES: Array<{
      name: string;
      data: Record<string, unknown>;
    }> = [
      {
        name: "unavailableProducts: [] (пустой массив)",
        data: { deliveryOptions: [], pickupPoints: [], unavailableProducts: [] },
      },
      {
        name: "поля unavailableProducts нет вообще в ответе",
        data: { deliveryOptions: [], pickupPoints: [] },
      },
      {
        name: "unavailableProducts не массив (мусор с бэка) — Array.isArray защищает",
        data: {
          deliveryOptions: [],
          pickupPoints: [],
          unavailableProducts: "oops",
        },
      },
    ];

    it.each(ABSENT_CASES)("$name", async ({ data }) => {
      (window as any).fetch = mockCalculate(data);
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      await advance(2000);
      await advance(5000);
      await advance(10000);

      expect((window as any).fetch).toHaveBeenCalledTimes(4); // полный ретрай-цикл
      expect(errorHiddenOf(section)).toBe(false);
      expect(errorTextOf(section)).toBe(
        "Нет доступных вариантов доставки для этого адреса",
      );
    });
  });

  describe("cartLines() — источник товаров корзины, приоритет", () => {
    it("window.cartStore.getItems() приоритетнее localStorage, даже если там тоже есть корзина", async () => {
      (window as any).cartStore = {
        getItems: () => [{ productId: "p1", name: "Из cartStore" }],
      };
      localStorage.setItem(
        "rose:cart:v1",
        JSON.stringify([{ productId: "p1", name: "Из localStorage" }]),
      );
      (window as any).fetch = mockCalculate({
        deliveryOptions: [],
        pickupPoints: [],
        unavailableProducts: [{ productId: "p1" }],
      });
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      expect(errorTextOf(section)).toContain("Из cartStore");
    });

    it("нет window.cartStore — падает на localStorage по CART_KEYS (flux раньше rose)", async () => {
      localStorage.setItem(
        "rose:cart:v1",
        JSON.stringify([{ productId: "p1", name: "Из rose" }]),
      );
      localStorage.setItem(
        "flux:cart:v1",
        JSON.stringify([{ productId: "p1", name: "Из flux" }]),
      );
      (window as any).fetch = mockCalculate({
        deliveryOptions: [],
        pickupPoints: [],
        unavailableProducts: [{ productId: "p1" }],
      });
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      expect(errorTextOf(section)).toContain("Из flux");
    });

    it("битый JSON под одним ключом молча пропускается (try/catch), идёт к следующему ключу", async () => {
      localStorage.setItem("flux:cart:v1", "{не json");
      localStorage.setItem(
        "rose:cart:v1",
        JSON.stringify([{ productId: "p1", name: "Из rose" }]),
      );
      (window as any).fetch = mockCalculate({
        deliveryOptions: [],
        pickupPoints: [],
        unavailableProducts: [{ productId: "p1" }],
      });
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      expect(errorTextOf(section)).toContain("Из rose");
    });

    it("ни cartStore, ни один localStorage-ключ не непусты — имя не находится, общая фраза", async () => {
      (window as any).fetch = mockCalculate({
        deliveryOptions: [],
        pickupPoints: [],
        unavailableProducts: [{ productId: "p1" }],
      });
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      expect(errorTextOf(section)).toBe(
        "Один из товаров в корзине пока нельзя доставить. Уберите его, чтобы оформить заказ.",
      );
    });
  });
});
