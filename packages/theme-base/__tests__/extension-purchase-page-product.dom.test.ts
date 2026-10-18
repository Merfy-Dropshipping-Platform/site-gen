/**
 * @jest-environment jsdom
 *
 * Задача 5.6 спеки 120: форма расширения на странице товара — по товару, который
 * показывает секция. Общая страница товара (product/index.html) отдаётся на
 * любой /product/<id>, которого не было при сборке; SSR-товар в ней — первый
 * товар магазина. Остров формы ждёт товар гидрации (событие merfy:product),
 * если адрес не указывает на SSR-товар; гидрация сообщает найденный товар.
 *
 * Скрипты извлекаются из Product.astro и исполняются в jsdom (как в
 * checkout-payment-provider-view.dom.test.ts).
 */
import { join } from "path";
import {
  astroInlineRunners,
  astroScripts,
  type AstroScriptRunner,
} from "./helpers/astro-inline-script";

const ASTRO = join(__dirname, "..", "blocks", "Product", "Product.astro");
const SSR_ID = "table-1";
const PAGE_ID = "shirt-2";

interface MountCall {
  productId: string;
  storeId: string;
  apiBase: string;
}

/** Исполнитель инлайн-скрипта, тело которого содержит `marker`. */
function runnerWith(marker: string): AstroScriptRunner {
  const script = astroScripts(ASTRO).find((s) => s.body.includes(marker));
  const runner = astroInlineRunners(ASTRO).find((r) => r.line === script?.line);
  if (!runner) throw new Error(`в Product.astro нет скрипта с «${marker}»`);
  return runner;
}

const purchaseIsland = runnerWith("__merfyPurchase.mount");
const hydration = runnerWith("function onResolved");

function renderSection(): HTMLElement {
  document.body.innerHTML = `
    <section data-block="product" data-puck-component-id="prod-1"
      data-product-id="${SSR_ID}" data-product-slug="table-slug" data-product-handle="table-handle">
      <div data-product-info><h1>Стол</h1></div>
      <div class="xp" data-extension-purchase hidden></div>
    </section>`;
  const section = document.querySelector<HTMLElement>("[data-block='product']");
  if (!section) throw new Error("нет секции");
  return section;
}

function setup(path: string): { section: HTMLElement; calls: MountCall[] } {
  window.history.replaceState({}, "", path);
  const section = renderSection();
  const calls: MountCall[] = [];
  Object.assign(window, {
    __merfyRoot: () => section,
    __merfyPurchase: {
      mount: (_root: unknown, options: MountCall) => calls.push(options),
    },
  });
  return { section, calls };
}

function runIsland(productId: string): void {
  purchaseIsland.run({ blockId: "prod-1", apiBase: "https://api.test", siteId: "shop-1", productId });
}

const announce = (section: HTMLElement, id: string): boolean =>
  section.dispatchEvent(new CustomEvent("merfy:product", { detail: { id } }));

describe("остров формы на странице товара", () => {
  it("общая страница товара: форма ждёт товар из адреса, а не SSR-товар", () => {
    const { section, calls } = setup(`/product/${PAGE_ID}`);
    runIsland(SSR_ID);
    expect(calls).toEqual([]);
    announce(section, PAGE_ID);
    expect(calls.map((c) => c.productId)).toEqual([PAGE_ID]);
  });

  it("страница своего товара по id: форма сразу, по SSR-товару", () => {
    const { calls } = setup(`/product/${SSR_ID}`);
    runIsland(SSR_ID);
    expect(calls).toEqual([
      { productId: SSR_ID, storeId: "shop-1", apiBase: "https://api.test" },
    ]);
  });

  it("страница своего товара по slug: форма сразу, по SSR-товару", () => {
    const { calls } = setup("/product/table-slug");
    runIsland(SSR_ID);
    expect(calls.map((c) => c.productId)).toEqual([SSR_ID]);
  });

  it("страница своего товара по handle: форма сразу, по SSR-товару", () => {
    const { calls } = setup("/product/table-handle");
    runIsland(SSR_ID);
    expect(calls.map((c) => c.productId)).toEqual([SSR_ID]);
  });

  it("секция без товара в адресе: форма сразу, по SSR-товару", () => {
    const { calls } = setup("/");
    runIsland(SSR_ID);
    expect(calls.map((c) => c.productId)).toEqual([SSR_ID]);
  });

  it("адрес ?id= чужого товара: форма ждёт товар гидрации", () => {
    const { section, calls } = setup(`/product/?id=${PAGE_ID}`);
    runIsland(SSR_ID);
    expect(calls).toEqual([]);
    announce(section, PAGE_ID);
    expect(calls.map((c) => c.productId)).toEqual([PAGE_ID]);
  });

  it("SSR-товара нет: форма ждёт товар гидрации", () => {
    const { section, calls } = setup(`/product/${PAGE_ID}`);
    runIsland("");
    expect(calls).toEqual([]);
    announce(section, PAGE_ID);
    expect(calls.map((c) => c.productId)).toEqual([PAGE_ID]);
  });

  it("событие без id формы не монтирует", () => {
    const { section, calls } = setup(`/product/${PAGE_ID}`);
    runIsland(SSR_ID);
    announce(section, "");
    expect(calls).toEqual([]);
  });
});

/** Ответ fetch для гидрации: /data/products.json — список товаров магазина. */
function fetchProducts(products: Array<Record<string, unknown>>): void {
  Object.assign(globalThis, {
    fetch: (url: string) =>
      Promise.resolve({
        ok: url === "/data/products.json",
        json: () => Promise.resolve({ products }),
      }),
  });
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const PRODUCTS = [
  { id: SSR_ID, slug: "table-slug", title: "Стол", basePrice: 39000 },
  { id: PAGE_ID, slug: "shirt-slug", title: "Футболка", basePrice: 1000 },
];

describe("гидрация сообщает товар страницы", () => {
  it("общая страница товара: корень получает id товара из адреса и событие merfy:product", async () => {
    const { section } = setup(`/product/${PAGE_ID}`);
    const announced: string[] = [];
    section.addEventListener("merfy:product", (event) => {
      if (event instanceof CustomEvent) announced.push(event.detail.id);
    });
    fetchProducts(PRODUCTS);
    hydration.run({ siteId: "", apiBase: "", productId: SSR_ID, blockId: "prod-1" });
    await flush();
    expect(section.getAttribute("data-product-id")).toBe(PAGE_ID);
    expect(announced).toEqual([PAGE_ID]);
  });

  it("остров и гидрация вместе: форма монтируется по товару из адреса", async () => {
    const { calls } = setup(`/product/${PAGE_ID}`);
    fetchProducts(PRODUCTS);
    runIsland(SSR_ID);
    hydration.run({ siteId: "", apiBase: "", productId: SSR_ID, blockId: "prod-1" });
    await flush();
    expect(calls.map((c) => c.productId)).toEqual([PAGE_ID]);
  });
});
