/**
 * @jest-environment jsdom
 *
 * Баги тестировщика 24.10, Б1/Б2: у товара, который продаётся через форму
 * расширения, на карточке каталога была кнопка «В корзину» (у satin — при
 * наведении), и товар попадал в корзину и в оформление. Витрина узнаёт про
 * такой товар тем же путём, что страница товара: карта расширений
 * (`GET /store/extensions/storefront`) называет функцию формы точки `product`,
 * а она для такого товара отдаёт форму, для остальных — пусто. Здесь —
 * проверка карточек: кнопки таких товаров прячутся, ответ запоминается.
 */
import {
  createExtensionSale,
  extensionSaleOf,
  watchExtensionSaleButtons,
} from "../runtime/extension-sale";

const API = "https://gateway.test/api";
const STORE = "store-1";
const EXT = "ext-1";
const FORM_FN = "formFn";

type FormAnswer = "form" | "none" | "error" | "network";
let answers: Record<string, FormAnswer> = {};
let mapAnswer: "point" | "no-point" | "network" = "point";
let calls: { url: string; body?: string }[] = [];

function mockFetch() {
  calls = [];
  (window as unknown as { fetch: unknown }).fetch = jest.fn(
    (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body });
      const respond = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
      if (url.includes("/store/extensions/storefront")) {
        if (mapAnswer === "network") return Promise.reject(new TypeError("Failed to fetch"));
        return respond(
          200,
          mapAnswer === "point" ? { [EXT]: { product: { form: FORM_FN, submit: "sendFn" } } } : {},
        );
      }
      const productId = (JSON.parse(init?.body ?? "{}") as { productId?: string }).productId ?? "";
      const answer = answers[productId] ?? "none";
      if (answer === "network") return Promise.reject(new TypeError("Failed to fetch"));
      if (answer === "error") return respond(500, null);
      return respond(201, {
        success: true,
        data: answer === "form" ? { title: "Оставить заявку", form: { version: 2, items: [] } } : null,
      });
    },
  );
}

const formCalls = () => calls.filter(({ url }) => url.includes(`/fn/${FORM_FN}`));
const mapCalls = () => calls.filter(({ url }) => url.includes("/store/extensions/storefront"));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function card(productId: string, extra = ""): string {
  return (
    `<li data-card="${productId}"><a href="/product/${productId}">${productId}</a>` +
    extra +
    `<button type="button" data-add-to-cart data-product-id="${productId}" class="flex">В корзину</button></li>`
  );
}

const button = (productId: string): HTMLElement =>
  document.querySelector(`[data-add-to-cart][data-product-id="${productId}"]`) as HTMLElement;

const isHidden = (el: HTMLElement): boolean => el.hidden && el.style.display === "none";

function setConfig(): void {
  Object.assign(window, { __MERFY_CONFIG__: { apiUrl: API, shopId: STORE } });
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  delete (window as unknown as Record<string, unknown>).__merfyExtensionSale;
  answers = { "p-form": "form", "p-cart": "none" };
  mapAnswer = "point";
  setConfig();
  mockFetch();
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
  delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
});

describe("Б1/Б2: кнопка «В корзину» на карточках", () => {
  it("у товара с формой кнопка спрятана, у остальных осталась", async () => {
    document.body.innerHTML = `<ul>${card("p-form")}${card("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(isHidden(button("p-form"))).toBe(true);
    expect(isHidden(button("p-cart"))).toBe(false);
    expect(button("p-cart").style.display).toBe("");
  });

  it("прячет с !important: у satin показ при наведении задаёт CSS", async () => {
    document.body.innerHTML = `<ul>${card("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(button("p-form").style.getPropertyPriority("display")).toBe("important");
  });

  it("счётчик количества рядом с кнопкой прячется вместе с ней", async () => {
    document.body.innerHTML = `<ul>${card("p-form", '<div data-qa-stepper>− 1 +</div>')}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    const stepper = document.querySelector("[data-qa-stepper]") as HTMLElement;
    expect(isHidden(stepper)).toBe(true);
  });

  it("карточки, которые дорисовала гидрация, проверяются тоже", async () => {
    document.body.innerHTML = `<ul id="grid"></ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    (document.getElementById("grid") as HTMLElement).innerHTML = card("p-form") + card("p-cart");
    // Новые узлы разбираются с задержкой в 50 мс: за раз приходит много правок страницы.
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flush();
    expect(isHidden(button("p-form"))).toBe(true);
    expect(isHidden(button("p-cart"))).toBe(false);
  });

  it("точки «товар» в карте нет: запросов по товарам нет, кнопки на месте", async () => {
    mapAnswer = "no-point";
    document.body.innerHTML = `<ul>${card("p-form")}${card("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(formCalls()).toHaveLength(0);
    expect(isHidden(button("p-form"))).toBe(false);
  });

  it("на странице без кнопок «В корзину» не делает ни одного запроса", async () => {
    document.body.innerHTML = `<p>Нет товаров</p>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(calls).toHaveLength(0);
  });

  it("конфига магазина нет (превью без него): запросов нет, кнопки на месте", async () => {
    delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
    document.body.innerHTML = `<ul>${card("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(calls).toHaveLength(0);
    expect(isHidden(button("p-form"))).toBe(false);
  });

  it("карта одна на страницу, функция формы — по разу на товар, даже при двух кнопках", async () => {
    document.body.innerHTML = `<ul>${card("p-form")}${card("p-form")}${card("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(mapCalls()).toHaveLength(1);
    expect(formCalls()).toHaveLength(2);
    document.querySelectorAll('[data-product-id="p-form"]').forEach((el) => {
      if (el.tagName === "BUTTON") expect(isHidden(el as HTMLElement)).toBe(true);
    });
  });

  it("запросы идут не больше чем по четыре сразу", async () => {
    let active = 0;
    let peak = 0;
    const original = (window as unknown as { fetch: (...a: unknown[]) => Promise<unknown> }).fetch;
    (window as unknown as { fetch: unknown }).fetch = (url: string, init: unknown) => {
      if (!url.includes(`/fn/${FORM_FN}`)) return original(url, init);
      active += 1;
      peak = Math.max(peak, active);
      return new Promise((resolve) =>
        setTimeout(() => {
          active -= 1;
          resolve(original(url, init));
        }, 5),
      );
    };
    document.body.innerHTML = `<ul>${Array.from({ length: 10 }, (_, i) => card(`p-${i}`)).join("")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });
});

describe("ответ запоминается и ошибки молчат", () => {
  it("известный товар прячется сразу и без запроса: ответ лежит в сессии", async () => {
    document.body.innerHTML = `<ul>${card("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    calls = [];
    delete (window as unknown as Record<string, unknown>).__merfyExtensionSale;
    document.body.innerHTML = `<ul>${card("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    expect(isHidden(button("p-form"))).toBe(true);
    await flush();
    expect(calls).toHaveLength(0);
  });

  it("сбой функции формы: кнопка остаётся, ответ не запоминается", async () => {
    answers = { "p-form": "error" };
    const sale = createExtensionSale(window);
    expect(await sale.check("p-form")).toBe(false);
    expect(sale.known("p-form")).toBeUndefined();
    answers = { "p-form": "form" };
    expect(await sale.check("p-form")).toBe(true);
    expect(sale.known("p-form")).toBe(true);
  });

  it("сеть недоступна: кнопка остаётся", async () => {
    answers = { "p-form": "network" };
    document.body.innerHTML = `<ul>${card("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(isHidden(button("p-form"))).toBe(false);
  });

  it("карта недоступна: кнопки остаются", async () => {
    mapAnswer = "network";
    document.body.innerHTML = `<ul>${card("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(isHidden(button("p-form"))).toBe(false);
  });

  it("запись сессии другого магазина не используется", async () => {
    sessionStorage.setItem(
      "merfy:extension-sale:v1",
      JSON.stringify({ storeId: "other", at: Date.now(), ids: { "p-form": true } }),
    );
    expect(createExtensionSale(window).known("p-form")).toBeUndefined();
  });

  it("старая запись сессии (больше пяти минут) не используется", async () => {
    sessionStorage.setItem(
      "merfy:extension-sale:v1",
      JSON.stringify({ storeId: STORE, at: Date.now() - 6 * 60 * 1000, ids: { "p-form": true } }),
    );
    expect(createExtensionSale(window).known("p-form")).toBeUndefined();
  });
});
