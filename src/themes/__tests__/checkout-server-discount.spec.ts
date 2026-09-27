/**
 * @jest-environment jsdom
 */
/**
 * Чекаут показывает скидку, которую посчитал сервер, — в том числе
 * автоматическую скидку магазина, а не только промокод.
 *
 * Владелец 27.09: «автоматические скидки не отображаются в чекауте». Сервер
 * (orders) при каждом пересчёте корзины кладёт автоматическую скидку в
 * `cart.discountCents` и списывает её с заказа, но витрина брала скидку только
 * из события промокода `checkout:discount-applied`. Покупатель видел «Итого
 * 990 ₽» и «Оплатить 990₽», а заказ выставлялся на 891 ₽ (замер на dev,
 * магазин 9294b712…, flux и vanilla).
 *
 * Путь покупателя из настоящего кода: стор корзины темы
 * (`themes/<тема>/public/scripts/cart-store.js`) собирает серверную корзину
 * тем же методом, что страница чекаута темы, ответ сервера — как у orders
 * (`{ cart, items }`), а итоги и кнопку рисуют встроенные скрипты
 * CheckoutTotals.astro и CheckoutSubmit.astro.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const firstInlineScript = (file: string): string => {
  const src = readFileSync(resolve(SITES_ROOT, file), "utf-8");
  const body = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(src)?.[1];
  if (!body) throw new Error(`${file}: нет встроенного скрипта`);
  return body;
};
const CHECKOUT_TOTALS = firstInlineScript(
  "packages/theme-base/blocks/CheckoutTotals/CheckoutTotals.astro",
);
const CHECKOUT_SUBMIT = firstInlineScript(
  "packages/theme-base/blocks/CheckoutSubmit/CheckoutSubmit.astro",
);

/** cart-store.js темы как исполняемое тело: без import/export, CartAPI — параметром. */
const storeSource = (theme: string): string =>
  readFileSync(
    resolve(SITES_ROOT, "themes", theme, "public", "scripts", "cart-store.js"),
    "utf-8",
  )
    .replace(/^import .*$/gm, "")
    .replace(/^export default .*$/gm, "")
    .replace(/^export /gm, "");

const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const MUG = {
  productId: "mug",
  variantCombinationId: null,
  quantity: 1,
  unitPriceCents: 99000,
};

/** Ответ orders на GET корзины: автоматическая скидка 10% посчитана сервером. */
const serverCart = (discountCents: number, quantity = 1) => ({
  success: true,
  data: {
    cart: {
      id: "cart-1",
      subtotalCents: 99000 * quantity,
      discountCents,
      promoCode: discountCents ? "AUTO:Общая скидка" : null,
      totalCents: 99000 * quantity - discountCents,
    },
    items: [
      {
        id: "srv-1",
        orderId: "cart-1",
        ...MUG,
        quantity,
        totalCents: 99000 * quantity,
        isBonus: false,
      },
    ],
  },
});

let getCartResponse: ReturnType<typeof serverCart>;
const cartApi = {
  createCart: jest.fn(async () => ({ success: true, data: { id: "cart-1" } })),
  addItem: jest.fn(async () => ({ success: true })),
  getCart: jest.fn(async () => getCartResponse),
};

type Store = {
  setLocalItems?: (items: unknown[]) => void;
  syncToServer?: (opts?: { notify?: boolean }) => Promise<string | null>;
  syncLinesToServer?: (
    lines: unknown[],
    opts?: { notify?: boolean },
  ) => Promise<string | null>;
  getItems: () => unknown[];
};

function loadStore(theme: string): Store {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- исполняем настоящий стор темы
  new Function("CartAPI", storeSource(theme))(cartApi);
  return (window as unknown as { cartStore: Store }).cartStore;
}

/** Как `themes/<тема>/src/pages/checkout.astro`: серверная корзина из локальной. */
async function hydrateCheckout(store: Store): Promise<void> {
  const line = {
    id: "mug",
    productId: "mug",
    name: "Кружка",
    price: 990,
    quantity: 1,
    variant: {},
  };
  if (store.syncLinesToServer) {
    await store.syncLinesToServer([line], { notify: true });
    return;
  }
  store.setLocalItems!([{ ...MUG, id: "mug", priceCents: 99000 }]);
  await store.syncToServer!({ notify: true });
}

function mountCheckout(): void {
  document.body.innerHTML = `
		<section data-checkout-totals data-free-text="Бесплатно" hidden>
			<div data-totals-row="delivery"><span>Доставка</span><span data-totals-delivery>Бесплатно</span></div>
			<div data-totals-row="discount" hidden><span>Скидка</span><span data-totals-discount>0 ₽</span></div>
			<div data-totals-row="total"><span>Итого</span><span data-totals-total>0 ₽</span></div>
		</section>
		<section data-block="checkout-submit">
			<div data-checkout-submit-error hidden></div>
			<button data-checkout-submit>Оплатить {total}</button>
		</section>`;
  const w = window as unknown as Record<string, unknown>;
  w.__merfyRoot = (id: string) =>
    document.querySelector(
      id === "ct-1"
        ? "[data-checkout-totals]"
        : '[data-block="checkout-submit"]',
    );
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- настоящие встроенные скрипты блоков
  new Function("blockId", CHECKOUT_TOTALS)("ct-1");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(
    "buttonText",
    "loadingText",
    "successRedirectUrl",
    "blockId",
    CHECKOUT_SUBMIT,
  )("Оплатить {total}", "Оформляем…", "/checkout-result", "cs-1");
}

const text = (selector: string) =>
  (document.querySelector(selector)?.textContent ?? "").replace(/\s/g, "");
const discountRowHidden = () =>
  document.querySelector<HTMLElement>('[data-totals-row="discount"]')!.hidden;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
  (window as unknown as Record<string, unknown>).__MERFY_CONFIG__ = {
    shopId: "shop-1",
    apiUrl: "https://gateway.test/api",
  };
  // Каталог для само-лечения цен rose (`/data/products.json`): пустой — позиции не трогает.
  const emptyCatalog = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  }));
  (globalThis as unknown as { fetch: unknown }).fetch = emptyCatalog;
  (window as unknown as { fetch: unknown }).fetch = emptyCatalog;
});

describe.each(THEMES)("%s: автоматическая скидка в чекауте", (theme) => {
  it("сервер посчитал скидку — видна строка «Скидка», итог и кнопка со скидкой", async () => {
    getCartResponse = serverCart(9900);
    mountCheckout();
    const store = loadStore(theme);
    await hydrateCheckout(store);
    await flush();

    expect(discountRowHidden()).toBe(false);
    expect(text("[data-totals-discount]")).toBe("−99₽");
    expect(text("[data-totals-total]")).toBe("891₽");
    expect(text("[data-checkout-submit]")).toBe("Оплатить891₽");
  });

  it("скидки нет — строки нет, итог полный", async () => {
    getCartResponse = serverCart(0);
    mountCheckout();
    await hydrateCheckout(loadStore(theme));
    await flush();

    expect(discountRowHidden()).toBe(true);
    expect(text("[data-totals-total]")).toBe("990₽");
    expect(text("[data-checkout-submit]")).toBe("Оплатить990₽");
  });

  it("состав корзины поменялся — старая скидка не показывается, пока сервер не ответил", async () => {
    getCartResponse = serverCart(9900);
    mountCheckout();
    const store = loadStore(theme);
    await hydrateCheckout(store);
    await flush();

    // Локальная правка без ответа сервера: 2 кружки вместо одной.
    const items = store.getItems() as Array<{ quantity: number }>;
    items[0].quantity = 2;
    document.dispatchEvent(
      new CustomEvent("cart:updated", { detail: { items } }),
    );
    await flush();

    expect(discountRowHidden()).toBe(true);
    expect(text("[data-totals-total]")).toBe("1980₽");
  });
});
