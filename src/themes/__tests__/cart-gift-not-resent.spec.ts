/**
 * @jest-environment jsdom
 */
/**
 * Подарок акции «1+1=3» не уходит обратно на сервер как покупка.
 *
 * Замер 27.09 на dev (flux): две кружки по 990 ₽, сервер добавил третью
 * подарком (`isBonus`, 0 ₽). «Оплатить» пересобирает серверную корзину из
 * позиций стора — вместе с подарком. Сервер принимал его как ещё одну
 * оплачиваемую кружку и снова дарил: 3×990 + подарок, 2 970 ₽ вместо 1 980 ₽.
 * Так было у flux и rose (пересборка из позиций стора, где лежит ответ
 * сервера); vanilla/bloom/satin пересобирают из локальной корзины темы, где
 * подарка нет, но правило одно для всех: подарок на сервер не отправляется.
 *
 * Путь из настоящего кода: стор корзины темы получает ответ сервера с
 * подарком (как после чекаута или промокода), затем пересобирает корзину тем
 * методом, которым это делает «Оплатить» / страница чекаута темы.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const THEMES = ["rose", "vanilla", "flux", "satin", "bloom"] as const;

const storeSource = (theme: string): string =>
  readFileSync(
    resolve(SITES_ROOT, "themes", theme, "public", "scripts", "cart-store.js"),
    "utf-8",
  )
    .replace(/^import .*$/gm, "")
    .replace(/^export default .*$/gm, "")
    .replace(/^export /gm, "");

const MUG = {
  productId: "mug",
  variantCombinationId: null,
  unitPriceCents: 99000,
};

/** Ответ orders: две оплачиваемые кружки и третья — подарок «1+1=3». */
const SERVER_CART = {
  success: true,
  data: {
    cart: {
      id: "cart-1",
      subtotalCents: 198000,
      discountCents: 0,
      totalCents: 198000,
    },
    items: [
      { id: "srv-1", ...MUG, quantity: 2, totalCents: 198000, isBonus: false },
      {
        id: "srv-gift",
        ...MUG,
        unitPriceCents: 0,
        quantity: 1,
        totalCents: 0,
        isBonus: true,
      },
    ],
  },
};

const cartApi = {
  createCart: jest.fn(async () => ({ success: true, data: { id: "cart-2" } })),
  addItem: jest.fn(async () => ({ success: true })),
  getCart: jest.fn(async () => SERVER_CART),
};

type Store = {
  syncFromCartData: (data: unknown) => void;
  getItems: () => Array<Record<string, unknown>>;
  syncToServer?: () => Promise<string | null>;
  syncLinesToServer?: (lines: unknown[]) => Promise<string | null>;
};

function loadStore(theme: string): Store {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- исполняем настоящий стор темы
  new Function("CartAPI", storeSource(theme))(cartApi);
  return (window as unknown as { cartStore: Store }).cartStore;
}

/** Пересборка серверной корзины тем методом, который есть у темы. */
async function rebuildServerCart(store: Store): Promise<void> {
  if (store.syncToServer) {
    await store.syncToServer();
    return;
  }
  await store.syncLinesToServer!(store.getItems());
}

/** Сколько кружек ушло на сервер как покупка. */
const sentQuantity = () =>
  cartApi.addItem.mock.calls.reduce(
    (sum, call) => sum + Number((call as unknown[])[2]),
    0,
  );

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  const emptyCatalog = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  }));
  (globalThis as unknown as { fetch: unknown }).fetch = emptyCatalog;
  (window as unknown as { fetch: unknown }).fetch = emptyCatalog;
});

describe.each(THEMES)(
  "%s: подарок 1+1 не покупается при пересборке корзины",
  (theme) => {
    it("на сервер уходят только 2 оплачиваемые кружки, подарок — нет", async () => {
      const store = loadStore(theme);
      store.syncFromCartData(SERVER_CART.data);
      expect(store.getItems().some((i) => i.isBonus)).toBe(true);

      await rebuildServerCart(store);

      expect(sentQuantity()).toBe(2);
      expect(cartApi.addItem).toHaveBeenCalledTimes(1);
    });
  },
);
