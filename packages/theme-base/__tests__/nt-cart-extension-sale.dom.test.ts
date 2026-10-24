/**
 * @jest-environment jsdom
 *
 * Баги тестировщика 24.10, Б1/Б2: корзина принимала товар, который продаётся
 * через форму расширения, и такой товар доходил до оформления с «Оплатить».
 * Корзина темы (createNtCart): initCartUI прячет кнопки таких товаров на
 * карточках; addToCart такой товар не принимает (известный — сразу, неизвестный —
 * строка убирается, как только расширение ответит); строки таких товаров,
 * оставшиеся в корзине с прошлых заходов, убираются при загрузке страницы.
 */
import { createNtCart } from "../runtime/nt-cart";

const API = "https://gateway.test/api";
const STORE = "store-1";
const EXT = "ext-1";
const FORM_FN = "formFn";
const STORAGE_KEY = "test:cart:v1";

let formProducts: string[] = [];

function mockFetch() {
  (window as unknown as { fetch: unknown }).fetch = jest.fn(
    (url: string, init?: { body?: string }) => {
      const respond = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
      if (url.includes("/store/extensions/storefront")) {
        return respond(200, { [EXT]: { product: { form: FORM_FN, submit: "sendFn" } } });
      }
      if (url.includes(`/fn/${FORM_FN}`)) {
        const productId = (JSON.parse(init?.body ?? "{}") as { productId?: string }).productId ?? "";
        const isForm = formProducts.includes(productId);
        return respond(201, {
          success: true,
          data: isForm ? { title: "Форма", form: { version: 2, items: [] } } : null,
        });
      }
      // Каталог для само-лечения корзины и прочее: пусто.
      return respond(404, null);
    },
  );
}

function createCart() {
  return createNtCart({
    storageKey: STORAGE_KEY,
    eventPrefix: "test:cart",
    renderDrawerItem: (line) => `<li data-line-id="${line.id}"></li>`,
  });
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const item = (productId: string) => ({ productId, name: productId, price: 100, image: "", quantity: 1 });
const ids = (cart: ReturnType<typeof createCart>): string[] => cart.getCart().map((l) => l.productId);

function card(productId: string): string {
  return `<button type="button" data-add-to-cart data-product-id="${productId}" data-name="${productId}" data-price="100">В корзину</button>`;
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
  delete (window as unknown as Record<string, unknown>).__merfyExtensionSale;
  formProducts = ["p-form"];
  Object.assign(window, { __MERFY_CONFIG__: { apiUrl: API, shopId: STORE } });
  mockFetch();
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
  delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
});

describe("Б1/Б2: корзина и товары, которые продаются формой", () => {
  it("initCartUI прячет «В корзину» у такого товара на карточке", async () => {
    document.body.innerHTML = card("p-form") + card("p-cart");
    createCart().initCartUI();
    await flush();
    const form = document.querySelector('[data-product-id="p-form"]') as HTMLElement;
    const cart = document.querySelector('[data-product-id="p-cart"]') as HTMLElement;
    expect(form.hidden).toBe(true);
    expect(cart.hidden).toBe(false);
  });

  it("клик по кнопке известного товара не кладёт его в корзину", async () => {
    document.body.innerHTML = card("p-form");
    const cart = createCart();
    cart.initCartUI();
    await flush();
    const button = document.querySelector("[data-add-to-cart]") as HTMLElement;
    button.hidden = false;
    button.click();
    await flush();
    expect(ids(cart)).toEqual([]);
  });

  it("клик по кнопке товара, о котором расширение ещё не ответило: строка не появляется до ответа", async () => {
    document.body.innerHTML = card("p-cart") + card("p-form");
    const cart = createCart();
    const seen: string[][] = [];
    window.addEventListener("test:cart:updated", () => seen.push(ids(cart)));
    cart.initCartUI();
    (document.querySelector('[data-product-id="p-form"]') as HTMLElement).hidden = false;
    (document.querySelector('[data-product-id="p-cart"]') as HTMLElement).click();
    (document.querySelector('[data-product-id="p-form"]') as HTMLElement).click();
    expect(ids(cart)).toEqual([]);
    await flush();
    // обычный товар лёг после ответа; товар расширения не появлялся в корзине ни на миг
    expect(ids(cart)).toEqual(["p-cart"]);
    expect(seen.flat()).not.toContain("p-form");
  });

  it("addToCart известного товара — отказ, обычного — принимает", async () => {
    document.body.innerHTML = card("p-form");
    const cart = createCart();
    cart.initCartUI();
    await flush();
    cart.addToCart(item("p-form"));
    cart.addToCart(item("p-cart"));
    await flush();
    expect(ids(cart)).toEqual(["p-cart"]);
  });

  it("товар, о котором ещё не спрашивали: принят, но как только расширение ответит — убран", async () => {
    const cart = createCart();
    cart.addToCart(item("p-form"));
    await flush();
    expect(ids(cart)).toEqual([]);
  });

  it("обычный товар остаётся в корзине после проверки", async () => {
    const cart = createCart();
    cart.addToCart(item("p-cart"));
    await flush();
    expect(ids(cart)).toEqual(["p-cart"]);
  });

  it("строка такого товара, оставшаяся с прошлого захода, убирается при загрузке страницы", async () => {
    const cart = createCart();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "p-form", productId: "p-form", name: "A", price: 100, image: "", quantity: 1 },
        { id: "p-cart", productId: "p-cart", name: "B", price: 100, image: "", quantity: 1 },
      ]),
    );
    cart.initCartUI();
    await flush();
    expect(ids(cart)).toEqual(["p-cart"]);
  });

  it("без конфига магазина корзина работает как прежде", async () => {
    delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
    const cart = createCart();
    cart.addToCart(item("p-form"));
    await flush();
    expect(ids(cart)).toEqual(["p-form"]);
  });

  it("сеть недоступна: корзина принимает товар", async () => {
    (window as unknown as { fetch: unknown }).fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const cart = createCart();
    cart.addToCart(item("p-form"));
    await flush();
    expect(ids(cart)).toEqual(["p-form"]);
  });
});
