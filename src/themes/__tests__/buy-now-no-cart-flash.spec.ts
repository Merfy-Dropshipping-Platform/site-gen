/**
 * @jest-environment jsdom
 */
/**
 * «Купить сейчас» в секции «Товар»: товар в корзине, корзина не мелькает.
 *
 * Тестировщик: «В секции товар при нажатии на динамическую кнопку на 0.5 секунды
 * отображается корзина, хотя не должна, весь остальной флоу верный».
 *
 * Причина: «Купить сейчас» клала товар программным кликом по «В корзину», а общий
 * делегат корзины (runtime/nt-cart.ts) после каждого добавления показывает
 * отклик — окно «Товар добавлен» (bloom, flux) или шторку (rose, satin,
 * vanilla). Следом кнопка уходила в /checkout, и отклик был виден, пока грузится
 * оформление. Так с решения «Купить сейчас = вся корзина» (4f1509f5).
 *
 * Теперь кнопка шлёт CART_ADD_SILENT_EVENT: та же строка корзины, без отклика.
 *
 * Секция рисуется тем же рендером, что витрина (renderSections, живая цепочка),
 * её скрипты исполняются в jsdom поверх общего делегата корзины. Окно «Товар
 * добавлен» монтируем в двух вариантах: как в макете bloom/flux и без него (тогда
 * отклик — шторка). Контроль: «В корзину» отклик по-прежнему показывает, иначе
 * проверка «отклика нет» проходила бы впустую.
 */
import { createNtCart } from "../../../packages/theme-base/runtime/nt-cart";
import { renderSections } from "../../../scripts/qa/lib/render";
import { BLOCK_ROOT_INLINE } from "../../common/block-root-inline";

const THEMES = ["rose", "vanilla", "satin", "bloom", "flux"] as const;
const KEY = "t:cart:v1";

/** Разметка окна — минимум, по которому рантайм решает, что окно есть. */
const MODAL =
  '<div data-cart-added-modal class="hidden" aria-hidden="true"><div data-cart-modal-card class="translate-y-3 opacity-0"></div></div>';
const LAYOUTS: [string, boolean][] = [
  ["с окном «Товар добавлен»", true],
  ["без окна — отклик шторкой", false],
];

const PRODUCT = {
  id: "mug",
  name: "Кружка",
  title: "Кружка",
  slug: "mug",
  handle: "mug",
  image: "",
  images: [],
  price: 500,
  basePrice: 500,
  compareAtPrice: null,
  description: "",
  collectionIds: [],
  hasVariants: false,
  variantGroups: [],
  variantCombinations: [],
};

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 20) {
  for (let i = 0; i < n; i++) await tick();
}

/** Что случилось после сброса: сколько раз открывали шторку и уходили со страницы. */
const seen = { drawer: 0, navigate: 0 };
const frames = new Set<number>();

beforeAll(() => {
  const fetchMock = jest.fn(async (url: unknown) =>
    String(url).includes("products.json")
      ? ({ ok: true, status: 200, json: async () => [PRODUCT] } as unknown as Response)
      : ({ ok: false, status: 404, json: async () => null } as unknown as Response),
  );
  (window as unknown as { fetch: unknown }).fetch = fetchMock;
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = raf((t) => {
      frames.delete(id);
      cb(t);
    });
    frames.add(id);
    return id;
  };
  createNtCart({ storageKey: KEY, eventPrefix: "t:cart", renderDrawerItem: () => "" }).initCartUI();
  // Шторка темы слушает `<префикс>:open` на window.
  window.addEventListener("t:cart:open", () => {
    seen.drawer += 1;
  });
  // Переход jsdom не умеет и пишет «Not implemented: navigation» в console.error.
  const original = console.error;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
    if (/Not implemented: navigation/.test(text)) {
      seen.navigate += 1;
      return;
    }
    original(...(args as []));
  });
});

afterAll(() => {
  for (const id of frames) window.cancelAnimationFrame(id);
  frames.clear();
  document.body.innerHTML = "";
});

const rendered = new Map<string, string>();
function sectionHtml(theme: string): string {
  const cached = rendered.get(theme);
  if (cached !== undefined) return cached;
  const [r] = renderSections(
    theme,
    [{ block: "Product", props: { id: "Product-1", productId: "mug", colorScheme: "scheme-1", siteId: "site-1" } }],
    { MERFY_QA_STUB_PRODUCT: JSON.stringify(PRODUCT) },
  );
  if (r.error) throw new Error(`${theme}: ${r.error}`);
  rendered.set(theme, r.html ?? "");
  return r.html ?? "";
}

async function mount(theme: string, withModal: boolean) {
  for (const k of Object.keys(window)) {
    if (k.startsWith("__merfy")) delete (window as unknown as Record<string, unknown>)[k];
  }
  (0, eval)(BLOCK_ROOT_INLINE.replace(/^<script>|<\/script>$/g, ""));
  (window as unknown as { __MERFY_THEME__: string }).__MERFY_THEME__ = "t";
  const html = sectionHtml(theme);
  const scripts = [...html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  document.body.innerHTML = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "") + (withModal ? MODAL : "");
  for (const code of scripts) {
    try {
      (0, eval)(code);
    } catch {
      /* чужие узлы (шапка, аналитика) в одиночном рендере не найдутся */
    }
  }
  document.dispatchEvent(new Event("DOMContentLoaded"));
  window.dispatchEvent(new Event("load"));
  await settle();
  localStorage.clear();
  seen.drawer = 0;
  seen.navigate = 0;
  document.body.style.overflow = "";
}

const cartLines = () => (JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown[]).length;
const modalShown = () => {
  const m = document.querySelector("[data-cart-added-modal]");
  return !!m && !m.classList.contains("hidden");
};
/** Отклик корзины, который увидел бы покупатель. */
const feedback = () => ({ шторка: seen.drawer, окно: modalShown(), прокрутка: document.body.style.overflow });
const NO_FEEDBACK = { шторка: 0, окно: false, прокрутка: "" };

const buyButton = () => document.querySelector<HTMLElement>('[data-product-action="buy-now"], [data-cfg-buy]');
const addButton = () => document.querySelector<HTMLElement>("[data-add-to-cart]");

describe.each(THEMES)("«Купить сейчас» — %s", (theme) => {
  it.each(LAYOUTS)("%s: товар в корзине, отклика нет, переход есть", async (_name, withModal) => {
    await mount(theme, withModal);
    expect(buyButton()).not.toBeNull();
    buyButton()!.click();
    await settle(5);
    expect(cartLines()).toBe(1);
    expect(feedback()).toEqual(NO_FEEDBACK);
    expect(seen.navigate).toBe(1);
  });

  it.each(LAYOUTS)("контроль, %s: «В корзину» показывает отклик", async (_name, withModal) => {
    await mount(theme, withModal);
    expect(addButton()).not.toBeNull();
    addButton()!.click();
    await settle(5);
    expect(cartLines()).toBe(1);
    expect(withModal ? modalShown() : seen.drawer > 0).toBe(true);
  });
});

describe("саботаж: прежний путь «клик по „В корзину“ + переход» ловится", () => {
  it.each(LAYOUTS)("%s", async (_name, withModal) => {
    await mount("rose", withModal);
    addButton()!.click();
    window.location.href = "/checkout";
    await settle(5);
    expect(seen.navigate).toBe(1);
    expect(feedback()).not.toEqual(NO_FEEDBACK);
  });
});
