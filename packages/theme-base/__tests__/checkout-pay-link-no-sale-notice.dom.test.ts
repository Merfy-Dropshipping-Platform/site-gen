/**
 * @jest-environment jsdom
 *
 * Баг тестировщика Б20: чекаут по ссылке на оплату из письма с предложением
 * (`?offer=<токен>`) показывал плашку «товар нельзя купить через корзину».
 * Позиции такого заказа расширение уже согласовало, корзины в нём нет, поэтому
 * проверка строк (runtime/checkout-request-items.ts) в этом режиме не включается.
 * Признак режима — `window.__merfyOffer`, имени расширения проверка не знает.
 */
import { createExtensionSale } from "../runtime/extension-sale";
import {
  CHECKOUT_LINES_WINDOW_KEY,
  installCheckoutRequestItems,
} from "../runtime/checkout-request-items";

const API = "https://gateway.test/api";
const STORE = "store-1";
const EXT = "ext-1";
const FORM_FN = "formFn";

let formCalls: string[] = [];

function mockFetch() {
  formCalls = [];
  (window as unknown as { fetch: unknown }).fetch = jest.fn(
    (url: string, init?: { body?: string }) => {
      const respond = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
      if (url.includes("/store/extensions/storefront")) {
        return respond(200, { [EXT]: { product: { form: FORM_FN, submit: "sendFn" } } });
      }
      if (url.includes(`/fn/${FORM_FN}`)) {
        formCalls.push((JSON.parse(init?.body ?? "{}") as { productId?: string }).productId ?? "");
        return respond(201, { success: true, data: { title: "Форма", form: { version: 2, items: [] } } });
      }
      return respond(404, null);
    },
  );
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const deps = () => ({
  sale: createExtensionSale(window),
  themeKey: "test",
  productPathPrefix: "/products",
  getLines: () => [{ id: "l1", productId: "p-offer", name: "Тест" }],
  removeProducts: jest.fn(),
});

const win = window as unknown as Record<string, unknown>;

beforeEach(() => {
  document.body.replaceWith(document.createElement("body"));
  document.body.innerHTML = `<div data-checkout-request-notice hidden></div><div data-checkout-summary></div>`;
  sessionStorage.clear();
  delete win.__merfyExtensionSale;
  delete win.__merfyOffer;
  delete win[CHECKOUT_LINES_WINDOW_KEY];
  Object.assign(window, { __MERFY_CONFIG__: { apiUrl: API, shopId: STORE } });
  mockFetch();
});

afterEach(() => {
  (win[CHECKOUT_LINES_WINDOW_KEY] as { dispose?: () => void } | undefined)?.dispose?.();
  delete win.fetch;
  delete win.__MERFY_CONFIG__;
  delete win.__merfyOffer;
});

describe("Б20: чекаут по ссылке на оплату", () => {
  it("в режиме предложения проверка не включается: расширение не спрашивают, плашки нет", async () => {
    win.__merfyOffer = { token: "A".repeat(43), loaded: false };

    const state = installCheckoutRequestItems(window, document, deps());
    await flush();

    expect(state).toBeNull();
    expect(win[CHECKOUT_LINES_WINDOW_KEY]).toBeUndefined();
    expect(formCalls).toEqual([]);
    const container = document.querySelector("[data-checkout-request-notice]") as HTMLElement;
    expect(container.hidden).toBe(true);
    expect(container.textContent).toBe("");
  });

  it("обычный чекаут: проверка включается и находит товар, проданный формой", async () => {
    const state = installCheckoutRequestItems(window, document, deps());
    await flush();

    expect(state).not.toBeNull();
    expect(formCalls).toEqual(["p-offer"]);
    expect(state?.notices.map((n) => n.productId)).toEqual(["p-offer"]);
  });
});
