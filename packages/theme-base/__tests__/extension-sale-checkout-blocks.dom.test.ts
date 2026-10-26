/**
 * @jest-environment jsdom
 *
 * Баг тестировщика Б16 (спека 120), блоки оформления:
 *  - «Сводка заказа»: корзина опустела из-за товара, проданного формой, — вместо
 *    «Ничего не выбрано» стоит сообщение, состав перерисовывается по событию;
 *  - «Кнопка оплаты»: пока идёт проверка товаров, не нажимается; в пустой
 *    корзине с таким товаром кнопки нет; отказ сервера (код
 *    PRODUCT_NOT_SOLD_BY_CART, прежний PRODUCT_REQUIRES_REQUEST или любая 4xx
 *    без кода) запускает свежую проверку и показывает сообщение вместо общей
 *    ошибки.
 * Состояние проверки блоки читают из `window.__merfyCheckoutLines`.
 */
import { join } from "path";
import { readFileSync } from "fs";
import { astroInlineRunners } from "./helpers/astro-inline-script";
import { renderRequestNotices, type CheckoutLinesState } from "../runtime/checkout-request-items";

const BLOCKS = join(__dirname, "..", "blocks");
const SUBMIT = join(BLOCKS, "CheckoutSubmit", "CheckoutSubmit.astro");
const SUMMARY = join(BLOCKS, "CheckoutOrderSummary", "CheckoutOrderSummary.astro");

const NOTICE = { productId: "p-form", name: "Сумка", href: "/products/p-form" };

function linesState(patch: Partial<CheckoutLinesState> = {}): CheckoutLinesState {
  const state: CheckoutLinesState = {
    notices: [],
    checking: false,
    recheck: async () => false,
    dispose: () => undefined,
    ...patch,
  };
  (window as unknown as Record<string, unknown>).__merfyCheckoutLines = state;
  return state;
}

function cleanup() {
  for (const key of ["cartStore", "fetch", "__merfyRoot", "__MERFY_CONFIG__", "__merfyCheckoutLines"]) {
    delete (window as unknown as Record<string, unknown>)[key];
  }
}

describe("Сводка заказа: сообщение вместо «Ничего не выбрано»", () => {
  const src = readFileSync(SUMMARY, "utf8");

  function mount(): HTMLElement {
    document.body.innerHTML = `
      <section data-checkout-summary data-puck-component-id="cos-1"
               data-show-variant-labels="false" data-show-compare-price="true"
               data-bogo-badge="false" data-image-size="80">
        <div data-checkout-request-notice hidden></div>
        <div data-checkout-loading></div>
        <div data-checkout-empty hidden>Ничего не выбрано</div>
        <div data-checkout-items hidden></div>
      </section>`;
    return document.querySelector("[data-checkout-summary]") as HTMLElement;
  }

  function run(section: HTMLElement) {
    (window as unknown as Record<string, unknown>).__merfyRoot = () => section;
    astroInlineRunners(SUMMARY)[0].run({ blockId: "cos-1" });
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("в разметке блока над составом заказа есть место под сообщение", () => {
    expect(src).toContain("data-checkout-request-notice");
    expect(src.indexOf("data-checkout-request-notice")).toBeLessThan(src.indexOf("data-checkout-items"));
  });

  it("корзина пуста и есть сообщение: «Ничего не выбрано» скрыто, ссылка на товар на месте", () => {
    const section = mount();
    (window as unknown as Record<string, unknown>).cartStore = { getItems: () => [] };
    linesState({ notices: [NOTICE] });
    renderRequestNotices(document, [NOTICE]);
    run(section);
    document.dispatchEvent(new CustomEvent("checkout:lines-changed"));
    expect((section.querySelector("[data-checkout-empty]") as HTMLElement).hidden).toBe(true);
    const link = section.querySelector("[data-checkout-request-notice] a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/products/p-form");
    expect(link.textContent).toBe("Открыть товар");
  });

  it("корзина пуста и сообщений нет: «Ничего не выбрано» как прежде", () => {
    const section = mount();
    (window as unknown as Record<string, unknown>).cartStore = { getItems: () => [] };
    linesState();
    run(section);
    document.dispatchEvent(new CustomEvent("cart:updated"));
    expect((section.querySelector("[data-checkout-empty]") as HTMLElement).hidden).toBe(false);
  });

  it("состав перерисовывается по checkout:lines-changed: убранная строка пропадает", () => {
    const section = mount();
    let items = [
      { id: "s1", productId: "p-form", name: "Сумка", unitPriceCents: 10000, quantity: 1 },
      { id: "s2", productId: "p-cart", name: "Шарф", unitPriceCents: 5000, quantity: 1 },
    ];
    (window as unknown as Record<string, unknown>).cartStore = { getItems: () => items };
    linesState();
    run(section);
    document.dispatchEvent(new CustomEvent("cart:updated"));
    expect(section.querySelector("[data-checkout-items]")?.textContent).toContain("Сумка");

    items = items.filter((i) => i.productId !== "p-form");
    linesState({ notices: [NOTICE] });
    document.dispatchEvent(new CustomEvent("checkout:lines-changed"));
    const listed = section.querySelector("[data-checkout-items]")?.textContent ?? "";
    expect(listed).not.toContain("Сумка");
    expect(listed).toContain("Шарф");
  });
});

describe("Кнопка оплаты: товары, проданные формой", () => {
  const src = readFileSync(SUBMIT, "utf8");

  function mount(): HTMLElement {
    document.body.innerHTML = `
      <section data-block="checkout-submit" data-puck-component-id="cs-1">
        <div data-checkout-submit-error role="alert" hidden></div>
        <button data-checkout-submit disabled>Оплатить —</button>
      </section>
      <div data-checkout-delivery data-selected-city-fias-id="fias-1"></div>
      <div data-checkout-field="email"><input value="a@b.ru" /></div>
      <div data-checkout-field="phone"><input value="+79990000000" /></div>
      <div data-checkout-field="firstName"><input value="Иван" /></div>
      <div data-checkout-field="lastName"><input value="Петров" /></div>
      <div data-checkout-field="city"><input value="Москва" /></div>
      <div data-checkout-field="street"><input value="Ленина" /></div>
      <div data-checkout-field="building"><input value="1" /></div>`;
    return document.querySelector('[data-block="checkout-submit"]') as HTMLElement;
  }

  function run(section: HTMLElement) {
    (window as unknown as Record<string, unknown>).__merfyRoot = () => section;
    astroInlineRunners(SUBMIT)[0].run({
      buttonText: "Оплатить {total}",
      loadingText: "Обработка…",
      successRedirectUrl: "/checkout-result",
      blockId: "cs-1",
    });
    document.dispatchEvent(
      new CustomEvent("checkout:delivery-changed", {
        detail: { type: "self_pickup", label: "Самовывоз", costCents: 0, tariffCode: null },
      }),
    );
  }

  const button = (section: HTMLElement) => section.querySelector("[data-checkout-submit]") as HTMLButtonElement;
  const errorText = (section: HTMLElement) =>
    (section.querySelector("[data-checkout-submit-error]") as HTMLElement).textContent;

  function cart(items: Record<string, unknown>[]) {
    (window as unknown as Record<string, unknown>).cartStore = {
      getItems: () => items,
      syncToServer: jest.fn(async () => "cart_1"),
    };
  }

  /** Ответ шлюза на /checkout; остальные запросы цепочки — успешные. */
  function gateway(checkout: { status: number; body: unknown }): jest.Mock {
    const fetchMock = jest.fn((url: string) => {
      if (/\/orders\/cart\/[^/]+\/checkout$/.test(url)) {
        return Promise.resolve({
          ok: checkout.status < 400,
          status: checkout.status,
          json: async () => checkout.body,
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: {} }) });
    });
    (window as unknown as Record<string, unknown>).fetch = fetchMock;
    return fetchMock;
  }

  const paymentCalls = (fetchMock: jest.Mock) =>
    fetchMock.mock.calls.filter((c) => /\/create-payment$/.test(String(c[0]))).length;

  async function submit(section: HTMLElement) {
    button(section).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const item = { id: "s2", productId: "p-cart", quantity: 1, unitPriceCents: 5000 };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("merfy:cartId", "cart_1");
    Object.assign(window, { __MERFY_CONFIG__: { shopId: "shop1", apiUrl: "https://gateway.test/api" } });
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = { origin: "https://shop.test", href: "" };
  });
  afterEach(cleanup);

  it("пока идёт проверка товаров, кнопка не нажимается; проверка кончилась — нажимается", () => {
    const section = mount();
    cart([item]);
    const state = linesState({ checking: true });
    run(section);
    expect(button(section).disabled).toBe(true);
    state.checking = false;
    document.dispatchEvent(new CustomEvent("checkout:lines-changed"));
    expect(button(section).disabled).toBe(false);
  });

  it("клик во время проверки ничего не отправляет", async () => {
    const section = mount();
    cart([item]);
    const state = linesState();
    const fetchMock = gateway({ status: 200, body: { data: { orderId: "o1" } } });
    run(section);
    state.checking = true;
    await submit(section);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("в корзине остались только товары, проданные формой: кнопки с прочерком нет", () => {
    const section = mount();
    cart([]);
    linesState({ notices: [NOTICE] });
    run(section);
    expect(button(section).style.display).toBe("none");
  });

  it("корзина пуста без сообщений: кнопка на месте, как прежде", () => {
    const section = mount();
    cart([]);
    linesState();
    run(section);
    expect(button(section).style.display).toBe("");
    expect(button(section).textContent?.trim()).toBe("Оплатить —");
  });

  it.each(["PRODUCT_NOT_SOLD_BY_CART", "PRODUCT_REQUIRES_REQUEST"])(
    "сервер ответил %s: свежая проверка, сообщение вместо общей ошибки, оплата не создаётся",
    async (code) => {
      const section = mount();
      cart([item]);
      const recheck = jest.fn(async () => true);
      linesState({ recheck });
      const fetchMock = gateway({
        status: 400,
        body: { statusCode: 400, message: "Этот товар нельзя купить через корзину", code },
      });
      run(section);
      await submit(section);
      expect(recheck).toHaveBeenCalledTimes(1);
      expect(errorText(section)).toBe("");
      expect(paymentCalls(fetchMock)).toBe(0);
      expect(button(section).textContent).not.toBe("Обработка…");
    },
  );

  it("шлюз потерял code и отдал 400: тоже свежая проверка", async () => {
    const section = mount();
    cart([item]);
    const recheck = jest.fn(async () => true);
    linesState({ recheck });
    gateway({ status: 400, body: { statusCode: 400, message: "Этот товар нельзя купить через корзину" } });
    run(section);
    await submit(section);
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(errorText(section)).toBe("");
  });

  it("4xx, а товаров, проданных формой, не нашлось: общая ошибка, как прежде", async () => {
    const section = mount();
    cart([item]);
    const recheck = jest.fn(async () => false);
    linesState({ recheck });
    gateway({ status: 400, body: { statusCode: 400, message: "Нет в наличии" } });
    run(section);
    await submit(section);
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(errorText(section)).toBe("Нет в наличии");
  });

  it("5xx свежую проверку не запускает", async () => {
    const section = mount();
    cart([item]);
    const recheck = jest.fn(async () => true);
    linesState({ recheck });
    gateway({ status: 500, body: { message: "Сбой" } });
    run(section);
    await submit(section);
    expect(recheck).not.toHaveBeenCalled();
    expect(errorText(section)).toBe("Сбой");
  });

  it("403 (вход покупателя) идёт на страницу входа без свежей проверки", async () => {
    const section = mount();
    cart([item]);
    const recheck = jest.fn(async () => true);
    linesState({ recheck });
    gateway({ status: 403, body: { code: "customer_auth_required" } });
    run(section);
    await submit(section);
    expect(recheck).not.toHaveBeenCalled();
    expect((window as unknown as { location: { href: string } }).location.href).toContain("/login");
  });

  it("без проверки на странице (превью): отказ показывается как раньше", async () => {
    const section = mount();
    cart([item]);
    gateway({
      status: 400,
      body: { message: "Этот товар нельзя купить через корзину", code: "PRODUCT_NOT_SOLD_BY_CART" },
    });
    run(section);
    await submit(section);
    expect(errorText(section)).toBe("Этот товар нельзя купить через корзину");
  });

  it("исходник блока: кнопка зависит от события проверки, коды отказа — новый и прежний", () => {
    expect(src).toContain("checkout:lines-changed");
    expect(src).toContain("PRODUCT_NOT_SOLD_BY_CART");
    expect(src).toContain("PRODUCT_REQUIRES_REQUEST");
  });
});
