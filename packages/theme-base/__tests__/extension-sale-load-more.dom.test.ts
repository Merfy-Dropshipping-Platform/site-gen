/**
 * @jest-environment jsdom
 *
 * Б14 (спека 120): «Каталог» → «Смотреть ещё». У карточек блока «Каталог» кнопка
 * «В корзину» — `button[data-quick-add-id]` (flux, rose, bloom, vanilla; у satin —
 * `[data-add-to-cart]`), и проверка товаров расширения её не видела: ни на первой
 * странице, ни на подгруженных. Клик по такой кнопке шёл прямо в корзину, а
 * чекаут потом молча убирал строку. Здесь:
 *  - наблюдение за списком прячет кнопку и у карточек, которые добавила
 *    подгрузка;
 *  - клик по товару, о котором расширение ещё не ответило, ждёт ответа и только
 *    потом доходит до обработчика темы (обычный товар) или не доходит вовсе
 *    (товар расширения).
 */
import { extensionSaleOf, watchExtensionSaleButtons } from "../runtime/extension-sale";

const API = "https://gateway.test/api";
const STORE = "store-1";
const EXT = "ext-1";
const FORM_FN = "formFn";

let formProducts: string[] = [];
let hangForm = false;
let calls: string[] = [];

function mockFetch() {
  calls = [];
  (window as unknown as { fetch: unknown }).fetch = jest.fn(
    (url: string, init?: { body?: string }) => {
      calls.push(url);
      const respond = (status: number, body: unknown) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
      if (url.includes("/store/extensions/storefront")) {
        return respond(200, { [EXT]: { product: { form: FORM_FN, submit: "sendFn" } } });
      }
      if (hangForm) return new Promise(() => undefined);
      const productId = (JSON.parse(init?.body ?? "{}") as { productId?: string }).productId ?? "";
      return respond(201, {
        success: true,
        data: formProducts.includes(productId)
          ? { title: "Оставить заявку", form: { version: 2, items: [] } }
          : null,
      });
    },
  );
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** Карточка блока «Каталог» flux/rose/bloom/vanilla: кнопка снаружи ссылки, id — в data-quick-add-id. */
function quickCard(productId: string): string {
  return (
    `<li data-product-id="${productId}"><article><a href="/product/${productId}">${productId}</a>` +
    `<button type="button" class="mt-auto" data-quick-add-id="${productId}">В КОРЗИНУ</button></article></li>`
  );
}

function satinCard(productId: string): string {
  return `<li><button type="button" data-add-to-cart data-product-id="${productId}">В корзину</button></li>`;
}

const quickButton = (productId: string): HTMLElement =>
  document.querySelector(`[data-quick-add-id="${productId}"]`) as HTMLElement;

const isHidden = (el: HTMLElement): boolean => el.hidden && el.style.display === "none";

/** Обработчик темы: ловит клики на document в фазе всплытия, как инлайн-скрипт блока «Каталог». */
let themeClicks: string[] = [];
let themeListener: ((event: Event) => void) | null = null;

function installThemeHandler(): void {
  themeClicks = [];
  themeListener = (event: Event) => {
    const target = event.target as Element;
    const btn = target.closest("[data-quick-add-id], [data-add-to-cart]") as HTMLElement | null;
    if (btn === null) return;
    themeClicks.push(btn.dataset.quickAddId ?? btn.dataset.productId ?? "");
  };
  document.addEventListener("click", themeListener);
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("data-extension-sale-watched");
  sessionStorage.clear();
  delete (window as unknown as Record<string, unknown>).__merfyExtensionSale;
  formProducts = ["p-form"];
  hangForm = false;
  Object.assign(window, { __MERFY_CONFIG__: { apiUrl: API, shopId: STORE } });
  mockFetch();
  installThemeHandler();
});

afterEach(() => {
  jest.useRealTimers();
  if (themeListener !== null) document.removeEventListener("click", themeListener);
  delete (window as unknown as { fetch?: unknown }).fetch;
  delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
});

describe("Б14: карточки блока «Каталог» с data-quick-add-id", () => {
  it("кнопка товара расширения спрятана, у обычного осталась", async () => {
    document.body.innerHTML = `<ul>${quickCard("p-form")}${quickCard("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    expect(isHidden(quickButton("p-form"))).toBe(true);
    expect(isHidden(quickButton("p-cart"))).toBe(false);
  });

  it("карточки, которые подгрузило «Смотреть ещё», проверяются тоже", async () => {
    document.body.innerHTML = `<ul id="grid">${quickCard("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    (document.getElementById("grid") as HTMLElement).insertAdjacentHTML(
      "beforeend",
      quickCard("p-form") + quickCard("p-cart-2"),
    );
    // Новые узлы разбираются с задержкой в 50 мс: за раз приходит много правок страницы.
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flush();
    expect(isHidden(quickButton("p-form"))).toBe(true);
    expect(isHidden(quickButton("p-cart-2"))).toBe(false);
  });

  it("карточка, подгруженная после того как ответ уже известен, прячется без нового запроса", async () => {
    document.body.innerHTML = `<ul id="grid">${quickCard("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    const before = calls.length;
    (document.getElementById("grid") as HTMLElement).insertAdjacentHTML("beforeend", quickCard("p-form"));
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    await flush();
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('[data-quick-add-id="p-form"]'));
    expect(buttons).toHaveLength(2);
    expect(buttons.every(isHidden)).toBe(true);
    expect(calls).toHaveLength(before);
  });
});

describe("Б14: клик по товару, о котором расширение ещё не ответило", () => {
  it("обычный товар: обработчик темы получает клик только после ответа", async () => {
    document.body.innerHTML = `<ul>${quickCard("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    quickButton("p-cart").click();
    expect(themeClicks).toEqual([]);
    await flush();
    expect(themeClicks).toEqual(["p-cart"]);
  });

  it("товар расширения: обработчик темы не получает клика никогда, кнопка прячется", async () => {
    document.body.innerHTML = `<ul>${quickCard("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    quickButton("p-form").click();
    await flush();
    expect(themeClicks).toEqual([]);
    expect(isHidden(quickButton("p-form"))).toBe(true);
  });

  it("клик по [data-add-to-cart] (satin, PDP) ведёт себя так же", async () => {
    document.body.innerHTML = `<ul>${satinCard("p-form")}${satinCard("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    const form = document.querySelector('[data-product-id="p-form"]') as HTMLElement;
    const cart = document.querySelector('[data-product-id="p-cart"]') as HTMLElement;
    form.hidden = false;
    form.click();
    cart.click();
    expect(themeClicks).toEqual([]);
    await flush();
    expect(themeClicks).toEqual(["p-cart"]);
  });

  it("ответ уже известен: клик по обычному товару доходит сразу, без ожидания", async () => {
    document.body.innerHTML = `<ul>${quickCard("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    await flush();
    quickButton("p-cart").click();
    expect(themeClicks).toEqual(["p-cart"]);
  });

  it("конфига магазина нет: клик доходит сразу, запросов нет", async () => {
    delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
    document.body.innerHTML = `<ul>${quickCard("p-form")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    quickButton("p-form").click();
    expect(themeClicks).toEqual(["p-form"]);
    expect(calls).toHaveLength(0);
  });

  it("расширение не отвечает: через три секунды клик доходит, как будто фичи нет", async () => {
    hangForm = true;
    document.body.innerHTML = `<ul>${quickCard("p-cart")}</ul>`;
    jest.useFakeTimers();
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    quickButton("p-cart").click();
    await jest.advanceTimersByTimeAsync(2900);
    expect(themeClicks).toEqual([]);
    await jest.advanceTimersByTimeAsync(200);
    expect(themeClicks).toEqual(["p-cart"]);
  });

  it("кнопку убрали со страницы, пока шёл запрос: клик никуда не уходит", async () => {
    document.body.innerHTML = `<ul>${quickCard("p-cart")}</ul>`;
    watchExtensionSaleButtons(document, extensionSaleOf(window));
    quickButton("p-cart").click();
    document.body.innerHTML = "";
    await flush();
    expect(themeClicks).toEqual([]);
  });
});
