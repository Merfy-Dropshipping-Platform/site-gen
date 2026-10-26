/**
 * @jest-environment jsdom
 *
 * Баг тестировщика Б16 (спека 120): товар уже лежит в корзине, магазин перевёл
 * его на форму расширения, а оформление до пяти минут показывало его по цене
 * каталога с активной «Оплатить» (ответ «товар продаётся формой» хранится в
 * сессии пять минут). Здесь — рантайм оформления (runtime/checkout-request-items.ts):
 * свежая проверка мимо кэша, удаление строки и сообщение, запомненные корзиной
 * строки, повторная проверка после отказа сервера.
 *
 * Подпись сообщения — данные расширения (`saleNotice` в ответе функции формы);
 * без неё ядро показывает нейтральный текст без слов предметной области.
 */
import { SALE_NOTICE_LIMITS, createExtensionSale, extensionSaleOf } from "../runtime/extension-sale";
import {
  CHECKOUT_LINES_WINDOW_KEY,
  NEUTRAL_NOTICE_ACTION,
  REQUEST_ITEMS_KEY,
  createCheckoutGuard,
  installCheckoutRequestItems,
  rememberRequestItem,
  renderRequestNotices,
  type CheckoutLinesState,
} from "../runtime/checkout-request-items";
import { createNtCart } from "../runtime/nt-cart";

const API = "https://gateway.test/api";
const STORE = "store-1";
const EXT = "ext-1";
const FORM_FN = "formFn";
const STORAGE_KEY = "test:cart:v1";
const CACHE_KEY = "merfy:extension-sale:v1";

/** Подпись, которую «расширение» кладёт в ответ формы; `undefined` — подписи нет. */
const EXTENSION_NOTICE = { text: "Товар «{name}» оформляется через форму.", actionLabel: "Открыть форму" };

let formProducts: string[] = [];
let hung: string[] = [];
let formCalls: string[] = [];
let saleNotice: unknown;

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
        const productId = (JSON.parse(init?.body ?? "{}") as { productId?: string }).productId ?? "";
        formCalls.push(productId);
        if (hung.includes(productId)) return new Promise(() => undefined);
        return respond(201, {
          success: true,
          data: formProducts.includes(productId)
            ? { title: "Форма", form: { version: 2, items: [] }, ...(saleNotice === undefined ? {} : { saleNotice }) }
            : null,
        });
      }
      return respond(404, null);
    },
  );
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

const line = (productId: string, name = productId) => ({
  id: `line-${productId}`,
  productId,
  name,
  price: 100,
  image: "",
  quantity: 1,
});

const NOTICE_HTML = `<div data-checkout-request-notice hidden></div>`;
const noticeText = (): string =>
  (document.querySelector("[data-checkout-request-notice]") as HTMLElement).textContent ?? "";

/** Фальшивая корзина темы: локальные строки + removeProducts, как у nt-cart. */
function localCart(initial: ReturnType<typeof line>[]) {
  let lines = initial;
  return {
    getLines: () => lines,
    removeProducts: jest.fn((ids: ReadonlySet<string>) => {
      lines = lines.filter((l) => !ids.has(l.productId));
    }),
    current: () => lines.map((l) => l.productId),
  };
}

/** Созданные в тесте проверки: подписки снимаются в afterEach, чтобы не мешать соседним тестам. */
let guards: CheckoutLinesState[] = [];

function guardOf(cart: ReturnType<typeof localCart>, waitMs?: number): CheckoutLinesState {
  const guard = createCheckoutGuard(window, document, {
    sale: createExtensionSale(window),
    themeKey: "test",
    productPathPrefix: "/products",
    getLines: cart.getLines,
    removeProducts: cart.removeProducts,
    waitMs,
  });
  guards.push(guard);
  return guard;
}

function cartStoreMock(items: Record<string, unknown>[], withSetLocal = true) {
  const state = { items };
  const store: Record<string, unknown> = {
    getItems: () => state.items,
    removeItem: jest.fn(async (id: string) => {
      state.items = state.items.filter((i) => i.id !== id);
    }),
  };
  if (withSetLocal) {
    store.setLocalItems = jest.fn((next: Record<string, unknown>[]) => {
      state.items = next;
    });
  }
  (window as unknown as Record<string, unknown>).cartStore = store;
  return { store, state };
}

beforeEach(() => {
  // Новая страница = новый body, как после перехода между страницами витрины.
  document.body.replaceWith(document.createElement("body"));
  document.body.innerHTML = NOTICE_HTML;
  guards = [];
  localStorage.clear();
  sessionStorage.clear();
  delete (window as unknown as Record<string, unknown>).__merfyExtensionSale;
  delete (window as unknown as Record<string, unknown>).cartStore;
  delete (window as unknown as Record<string, unknown>)[CHECKOUT_LINES_WINDOW_KEY];
  formProducts = [];
  hung = [];
  saleNotice = undefined;
  Object.assign(window, { __MERFY_CONFIG__: { apiUrl: API, shopId: STORE } });
  mockFetch();
});

afterEach(() => {
  guards.forEach((guard) => guard.dispose());
  (window as unknown as Record<string, CheckoutLinesState | undefined>)[CHECKOUT_LINES_WINDOW_KEY]?.dispose();
  delete (window as unknown as { fetch?: unknown }).fetch;
  delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
  delete (window as unknown as Record<string, unknown>).cartStore;
});

describe("Б16: свежая проверка мимо кэша (extension-sale)", () => {
  const cacheWith = (ids: Record<string, boolean>) =>
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ storeId: STORE, at: Date.now(), ids }));

  it("check без fresh верит кэшу сессии и в сеть не ходит", async () => {
    cacheWith({ "p-form": false });
    formProducts = ["p-form"];
    const sale = createExtensionSale(window);
    expect(await sale.check("p-form")).toBe(false);
    expect(formCalls).toEqual([]);
  });

  it("check с fresh спрашивает расширение, кэш не мешает", async () => {
    cacheWith({ "p-form": false });
    formProducts = ["p-form"];
    const sale = createExtensionSale(window);
    expect(await sale.check("p-form", { fresh: true })).toBe(true);
    expect(formCalls).toEqual(["p-form"]);
  });

  it("свежий ответ пишется в кэш: следующий check без fresh видит его без запроса", async () => {
    cacheWith({ "p-form": false });
    formProducts = ["p-form"];
    const sale = createExtensionSale(window);
    await sale.check("p-form", { fresh: true });
    expect(sale.known("p-form")).toBe(true);
    expect(await createExtensionSale(window).check("p-form")).toBe(true);
    expect(formCalls).toEqual(["p-form"]);
  });

  it("товар вернули на корзину: свежее «нет» перезаписывает кэшированное «да»", async () => {
    cacheWith({ "p-cart": true });
    const sale = createExtensionSale(window);
    expect(await sale.check("p-cart", { fresh: true })).toBe(false);
    expect(sale.known("p-cart")).toBe(false);
  });

  it("сбой сети при fresh: товар обычный, кэш не меняется", async () => {
    cacheWith({ "p-form": true });
    (window as unknown as { fetch: unknown }).fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    const sale = createExtensionSale(window);
    expect(await sale.check("p-form", { fresh: true })).toBe(false);
    expect(createExtensionSale(window).known("p-form")).toBe(true);
  });
});

describe("Б16: оформление убирает товары, проданные формой, и пишет об этом", () => {
  it("кэш говорит «обычный», расширение — «форма»: строка убрана, нейтральное сообщение со ссылкой на товар", async () => {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ storeId: STORE, at: Date.now(), ids: { "p-form": false, "p-cart": false } }),
    );
    formProducts = ["p-form"];
    const cart = localCart([line("p-form", "Сумка"), line("p-cart", "Шарф")]);
    const guard = guardOf(cart);
    await flush();
    expect(cart.current()).toEqual(["p-cart"]);
    expect(guard.notices).toEqual([{ productId: "p-form", name: "Сумка", href: "/products/p-form" }]);
    expect(noticeText()).toBe("Товар «Сумка» нельзя купить через корзину.Открыть товар");
    expect(NEUTRAL_NOTICE_ACTION).toBe("Открыть товар");
    const link = document.querySelector("[data-checkout-request-notice] a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/products/p-form");
    expect((document.querySelector("[data-checkout-request-notice]") as HTMLElement).hidden).toBe(false);
  });

  it("расширение дало подпись: сообщение и ссылка — её слова, {name} заменён названием товара", async () => {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ storeId: STORE, at: Date.now(), ids: { "p-form": false } }),
    );
    formProducts = ["p-form"];
    saleNotice = EXTENSION_NOTICE;
    const guard = guardOf(localCart([line("p-form", "Сумка")]));
    await flush();
    expect(guard.notices).toEqual([
      { productId: "p-form", name: "Сумка", href: "/products/p-form", ...EXTENSION_NOTICE },
    ]);
    expect(noticeText()).toBe("Товар «Сумка» оформляется через форму.Открыть форму");
    const link = document.querySelector("[data-checkout-request-notice] a") as HTMLAnchorElement;
    expect(link.textContent).toBe("Открыть форму");
    expect(link.getAttribute("href")).toBe("/products/p-form");
  });

  it("подпись без одного поля: недостающее берётся из нейтрального текста", async () => {
    formProducts = ["p-form"];
    saleNotice = { actionLabel: "Заполнить форму" };
    guardOf(localCart([line("p-form", "Сумка")]));
    await flush();
    expect(noticeText()).toBe("Товар «Сумка» нельзя купить через корзину.Заполнить форму");
  });

  it("кривая подпись (не объект, пустые и нестроковые поля) — нейтральный текст", async () => {
    formProducts = ["p-form"];
    saleNotice = { text: 5, actionLabel: "   " };
    guardOf(localCart([line("p-form", "Сумка")]));
    await flush();
    expect(noticeText()).toBe("Товар «Сумка» нельзя купить через корзину.Открыть товар");
  });

  it("подпись расширения проходит предел длины", async () => {
    formProducts = ["p-form"];
    saleNotice = { text: "я".repeat(SALE_NOTICE_LIMITS.text + 50), actionLabel: "ы".repeat(SALE_NOTICE_LIMITS.actionLabel + 20) };
    guardOf(localCart([line("p-form", "Сумка")]));
    await flush();
    const link = document.querySelector("[data-checkout-request-notice] a") as HTMLAnchorElement;
    expect(link.textContent).toHaveLength(SALE_NOTICE_LIMITS.actionLabel);
    expect(noticeText()).toHaveLength(SALE_NOTICE_LIMITS.text + SALE_NOTICE_LIMITS.actionLabel);
  });

  it("подпись приходит из сессии вкладки: ответ другой страницы виден без запроса", async () => {
    formProducts = ["p-form"];
    saleNotice = EXTENSION_NOTICE;
    await createExtensionSale(window).check("p-form");
    // Новая страница: память пуста, подпись лежит только в sessionStorage.
    const sale = createExtensionSale(window);
    expect(sale.notice("p-form")).toEqual(EXTENSION_NOTICE);
    expect(JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "{}").notices).toEqual({ "p-form": EXTENSION_NOTICE });
  });

  it("свежее «нет» убирает подпись товара из кэша", async () => {
    formProducts = ["p-form"];
    saleNotice = EXTENSION_NOTICE;
    const sale = createExtensionSale(window);
    await sale.check("p-form", { fresh: true });
    expect(sale.notice("p-form")).toEqual(EXTENSION_NOTICE);
    formProducts = [];
    await sale.check("p-form", { fresh: true });
    expect(sale.notice("p-form")).toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "{}").notices).toEqual({});
  });

  it("старая запись кэша без поля notices читается: подписи нет, ответ тот же", async () => {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ storeId: STORE, at: Date.now(), ids: { "p-form": true } }),
    );
    const sale = createExtensionSale(window);
    expect(sale.known("p-form")).toBe(true);
    expect(sale.notice("p-form")).toBeUndefined();
  });

  it("обычные товары: сообщения нет, блок скрыт, строки на месте", async () => {
    const cart = localCart([line("p-cart")]);
    const guard = guardOf(cart);
    await flush();
    expect(cart.current()).toEqual(["p-cart"]);
    expect(guard.notices).toEqual([]);
    expect((document.querySelector("[data-checkout-request-notice]") as HTMLElement).hidden).toBe(true);
  });

  it("название товара экранируется: разметка из названия не создаёт элементов", async () => {
    formProducts = ["p-form"];
    guardOf(localCart([line("p-form", '<img src=x onerror="alert(1)">')]));
    await flush();
    expect(document.querySelector("[data-checkout-request-notice] img")).toBeNull();
    expect(noticeText()).toContain('<img src=x onerror="alert(1)">');
  });

  it("в корзине остался только такой товар: корзина пуста, сообщение есть", async () => {
    formProducts = ["p-form"];
    const cart = localCart([line("p-form", "Сумка")]);
    const guard = guardOf(cart);
    await flush();
    expect(cart.current()).toEqual([]);
    expect(guard.notices).toHaveLength(1);
  });

  it("серверная корзина темы (setLocalItems): строка убирается из состава заказа", async () => {
    formProducts = ["p-form"];
    const { state } = cartStoreMock([
      { id: "s1", productId: "p-form", name: "Сумка", quantity: 1 },
      { id: "s2", productId: "p-cart", name: "Шарф", quantity: 1 },
    ]);
    guardOf(localCart([]));
    await flush();
    expect(state.items.map((i) => i.productId)).toEqual(["p-cart"]);
  });

  it("серверная корзина без setLocalItems: строка удаляется через removeItem, по разу", async () => {
    formProducts = ["p-form"];
    const { store, state } = cartStoreMock(
      [
        { id: "s1", productId: "p-form", name: "Сумка", quantity: 1 },
        { id: "s2", productId: "p-cart", name: "Шарф", quantity: 1 },
      ],
      false,
    );
    guardOf(localCart([]));
    await flush();
    expect(store.removeItem).toHaveBeenCalledTimes(1);
    expect(store.removeItem).toHaveBeenCalledWith("s1");
    expect(state.items.map((i) => i.productId)).toEqual(["p-cart"]);
  });

  it("серверная корзина пришла позже локальной: новые товары проверяются по cart:updated", async () => {
    formProducts = ["p-form"];
    const cart = localCart([line("p-cart")]);
    const guard = guardOf(cart);
    await flush();
    expect(guard.notices).toEqual([]);
    const { state } = cartStoreMock([{ id: "s1", productId: "p-form", name: "Сумка", quantity: 1 }]);
    document.dispatchEvent(new CustomEvent("cart:updated"));
    await flush();
    expect(state.items).toEqual([]);
    expect(guard.notices.map((n) => n.productId)).toEqual(["p-form"]);
  });

  it("серверная корзина дозагрузилась и вернула убранный товар: строка убирается снова, без повторного вопроса", async () => {
    formProducts = ["p-form"];
    const { state } = cartStoreMock([{ id: "s1", productId: "p-form", name: "Сумка", quantity: 1 }]);
    guardOf(localCart([]));
    await flush();
    expect(state.items).toEqual([]);
    const asks = formCalls.length;

    state.items = [
      { id: "s9", productId: "p-form", name: "Сумка", quantity: 1 },
      { id: "s2", productId: "p-cart", name: "Шарф", quantity: 1 },
    ];
    document.dispatchEvent(new CustomEvent("cart:updated"));
    await flush();
    expect(state.items.map((i) => i.productId)).toEqual(["p-cart"]);
    expect(formCalls.slice(asks)).toEqual(["p-cart"]);
  });

  it("«Купить сейчас»: запись товара, проданного формой, удаляется из sessionStorage", async () => {
    formProducts = ["p-form"];
    sessionStorage.setItem("test:buynow", JSON.stringify({ productId: "p-form", quantity: 1 }));
    const guard = guardOf(localCart([]));
    await flush();
    expect(sessionStorage.getItem("test:buynow")).toBeNull();
    expect(guard.notices[0]?.name).toBe("Товар");
  });

  it("подарочная строка (isBonus) расширению не показывается", async () => {
    cartStoreMock([{ id: "g1", productId: "p-gift", isBonus: true, quantity: 1 }]);
    guardOf(localCart([]));
    await flush();
    expect(formCalls).toEqual([]);
  });

  it("событие checkout:lines-changed приходит при начале и конце проверки", async () => {
    formProducts = ["p-form"];
    const seen: boolean[] = [];
    let guard: CheckoutLinesState | null = null;
    document.addEventListener("checkout:lines-changed", () => seen.push(guard?.checking ?? true));
    guard = guardOf(localCart([line("p-form")]));
    await flush();
    expect(seen).toContain(true);
    expect(seen[seen.length - 1]).toBe(false);
  });
});

describe("Б16: «Оплатить» не нажимается, пока идёт проверка (не дольше 3 с)", () => {
  it("пока расширение не ответило — checking, потом — снято по таймеру", async () => {
    hung = ["p-slow"];
    const guard = guardOf(localCart([line("p-slow")]), 400);
    expect(guard.checking).toBe(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    expect(guard.checking).toBe(false);
    expect(guard.notices).toEqual([]);
  });

  it("ответ пришёл вовремя — checking снимается сразу", async () => {
    const guard = guardOf(localCart([line("p-cart")]), 5000);
    await flush();
    expect(guard.checking).toBe(false);
  });

  it("нет конфига магазина: спрашивать некого, проверка не стартует", async () => {
    delete (window as unknown as Record<string, unknown>).__MERFY_CONFIG__;
    const guard = guardOf(localCart([line("p-form")]));
    await flush();
    expect(guard.checking).toBe(false);
    expect(formCalls).toEqual([]);
  });
});

describe("Б16: строки, убранные корзиной на других страницах", () => {
  it("название и адрес из sessionStorage показываются один раз", async () => {
    rememberRequestItem(window, { productId: "p-old", name: "Платье", href: "/products/p-old" });
    const guard = guardOf(localCart([]));
    expect(guard.notices).toEqual([{ productId: "p-old", name: "Платье", href: "/products/p-old" }]);
    expect(noticeText()).toContain("Товар «Платье» нельзя купить через корзину.");
    expect(sessionStorage.getItem(REQUEST_ITEMS_KEY)).toBeNull();

    // Второй заход на оформление: запись уже забрана.
    document.body.innerHTML = NOTICE_HTML;
    const again = guardOf(localCart([]));
    expect(again.notices).toEqual([]);
  });

  it("запомненная строка несёт подпись расширения: оформление показывает её слова", async () => {
    rememberRequestItem(window, { productId: "p-old", name: "Платье", href: "/products/p-old", ...EXTENSION_NOTICE });
    guardOf(localCart([]));
    expect(noticeText()).toBe("Товар «Платье» оформляется через форму.Открыть форму");
  });

  it("строку, убранную прямо на странице оформления, сообщение подхватывает сразу", async () => {
    const guard = guardOf(localCart([]));
    rememberRequestItem(window, { productId: "p-late", name: "Пояс", href: "/products/p-late" });
    expect(guard.notices.map((n) => n.name)).toEqual(["Пояс"]);
  });

  it("корзина темы запоминает убранную строку: название и адрес страницы товара", async () => {
    formProducts = ["p-form"];
    const cart = createNtCart({
      storageKey: STORAGE_KEY,
      eventPrefix: "test:cart",
      renderDrawerItem: (l) => `<li data-line-id="${l.id}"></li>`,
    });
    cart.addToCart({ productId: "p-form", name: "Сумка", price: 100, image: "", quantity: 1 });
    await flush();
    expect(cart.getCart()).toEqual([]);
    expect(JSON.parse(sessionStorage.getItem(REQUEST_ITEMS_KEY) ?? "[]")).toEqual([
      { productId: "p-form", name: "Сумка", href: "/products/p-form" },
    ]);
  });

  it("корзина темы запоминает вместе со строкой и подпись расширения", async () => {
    formProducts = ["p-form"];
    saleNotice = EXTENSION_NOTICE;
    const cart = createNtCart({
      storageKey: STORAGE_KEY,
      eventPrefix: "test:cart",
      renderDrawerItem: (l) => `<li data-line-id="${l.id}"></li>`,
    });
    cart.addToCart({ productId: "p-form", name: "Сумка", price: 100, image: "", quantity: 1 });
    await flush();
    expect(JSON.parse(sessionStorage.getItem(REQUEST_ITEMS_KEY) ?? "[]")).toEqual([
      { productId: "p-form", name: "Сумка", href: "/products/p-form", ...EXTENSION_NOTICE },
    ]);
  });

  it("одна запись на товар: повторное запоминание не дублирует", () => {
    rememberRequestItem(window, { productId: "p", name: "A", href: "/products/p" });
    rememberRequestItem(window, { productId: "p", name: "A", href: "/products/p" });
    expect(JSON.parse(sessionStorage.getItem(REQUEST_ITEMS_KEY) ?? "[]")).toHaveLength(1);
  });
});

describe("Б16: отказ сервера — свежая проверка всех строк", () => {
  it("recheck находит товар, переведённый на форму после первой проверки", async () => {
    const cart = localCart([line("p-form", "Сумка"), line("p-cart", "Шарф")]);
    const guard = guardOf(cart);
    await flush();
    expect(guard.notices).toEqual([]);

    formProducts = ["p-form"]; // магазин переключил товар уже после загрузки страницы
    expect(await guard.recheck()).toBe(true);
    expect(cart.current()).toEqual(["p-cart"]);
    expect(guard.notices.map((n) => n.productId)).toEqual(["p-form"]);
    expect(noticeText()).toContain("Товар «Сумка» нельзя купить через корзину.");
  });

  it("recheck ничего не нашёл — false, состав не тронут", async () => {
    const cart = localCart([line("p-cart")]);
    const guard = guardOf(cart);
    await flush();
    expect(await guard.recheck()).toBe(false);
    expect(cart.current()).toEqual(["p-cart"]);
  });

  it("recheck не считает повторно уже найденный товар", async () => {
    formProducts = ["p-form"];
    const guard = guardOf(localCart([line("p-form"), line("p-cart")]));
    await flush();
    expect(await guard.recheck()).toBe(false);
    expect(guard.notices).toHaveLength(1);
  });
});

describe("Б16: подключение к странице оформления (initCartUI)", () => {
  const makeCart = () =>
    createNtCart({
      storageKey: STORAGE_KEY,
      eventPrefix: "test:cart",
      renderDrawerItem: (l) => `<li data-line-id="${l.id}"></li>`,
    });

  it("на странице оформления initCartUI включает проверку: строка убрана, сообщение стоит", async () => {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ storeId: STORE, at: Date.now(), ids: { "p-form": false } }),
    );
    formProducts = ["p-form"];
    localStorage.setItem(STORAGE_KEY, JSON.stringify([line("p-form", "Сумка"), line("p-cart", "Шарф")]));
    document.body.innerHTML = `<section data-checkout-summary></section>${NOTICE_HTML}`;
    const cart = makeCart();
    cart.initCartUI();
    await flush();
    expect(cart.getCart().map((l) => l.productId)).toEqual(["p-cart"]);
    const state = (window as unknown as Record<string, CheckoutLinesState>)[CHECKOUT_LINES_WINDOW_KEY];
    expect(state.notices.map((n) => n.name)).toEqual(["Сумка"]);
    // свежий ответ лёг в кэш
    expect(extensionSaleOf(window).known("p-form")).toBe(true);
  });

  it("не на странице оформления проверка не включается", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([line("p-cart")]));
    document.body.innerHTML = `<main></main>`;
    makeCart().initCartUI();
    await flush();
    expect((window as unknown as Record<string, unknown>)[CHECKOUT_LINES_WINDOW_KEY]).toBeUndefined();
  });

  it("повторный вызов на той же странице не заводит вторую проверку", async () => {
    document.body.innerHTML = `<section data-checkout-summary></section>`;
    const deps = {
      sale: createExtensionSale(window),
      themeKey: "test",
      productPathPrefix: "/products",
      getLines: () => [],
      removeProducts: () => undefined,
    };
    const first = installCheckoutRequestItems(window, document, deps);
    expect(installCheckoutRequestItems(window, document, deps)).toBe(first);
  });

  it("renderRequestNotices без сообщений прячет блок и очищает его", () => {
    document.body.innerHTML = NOTICE_HTML;
    renderRequestNotices(document, [{ productId: "p", name: "A", href: "/products/p" }]);
    renderRequestNotices(document, []);
    const el = document.querySelector("[data-checkout-request-notice]") as HTMLElement;
    expect(el.hidden).toBe(true);
    expect(el.childElementCount).toBe(0);
  });
});
