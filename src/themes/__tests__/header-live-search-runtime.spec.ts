/**
 * @jest-environment jsdom
 *
 * Живой поиск из лупы в шапке (просьба владельца 22.09): ввод → пауза → запрос
 * к gateway `/api/store/products/search` → разметка темы в [data-search-results].
 *
 * Что сторожим:
 *   • цена в выдаче та же, что в каталоге (минимум по вариантам, старая —
 *     только если больше текущей) — иначе один товар в поиске и в каталоге
 *     стоил бы по-разному;
 *   • запрос уходит в магазин витрины/превью и с лимитом области;
 *   • устаревший ответ не перетирает свежий (быстрый набор «но» → «нос»);
 *   • пусто / ошибка / очистка поля — понятные состояния, меню шторки
 *     возвращается;
 *   • вторая копия скрипта шапки (контентные страницы несут две) не вешает
 *     делегаты повторно — иначе каждый символ уходил бы двумя запросами.
 */
import {
  buildSearchUrl,
  highlightMatch,
  initHeaderSearch,
  mapSearchProduct,
  resolveSearchEndpoint,
  type HeaderSearchHit,
} from "../../../packages/theme-base/runtime/header-search";

const STORE = "6c107f35-63ff-4a5f-a6f0-70ba6f9939b0";
const MARK_OPEN =
  '<mark data-search-mark style="background:none;color:inherit;font-weight:700">';
const MARK_CLOSE = "</mark>";

const product = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  title: "Носки «Набор»",
  images: ["https://minio.merfy.ru/a.jpg", "https://minio.merfy.ru/b.jpg"],
  basePrice: "2690.00",
  compareAtPrice: "3228.00",
  hasVariants: false,
  quantity: 5,
  allowBackorder: false,
  ...over,
});

describe("mapSearchProduct — цена и ссылка как у карточки каталога", () => {
  it("простой товар: basePrice, старая цена, первое фото, страница товара", () => {
    const hit = mapSearchProduct(product())!;
    expect(hit).toMatchObject({
      id: "p-1",
      title: "Носки «Набор»",
      href: "/product?id=p-1",
      image: "https://minio.merfy.ru/a.jpg",
      price: 2690,
      oldPrice: 3228,
      onSale: true,
      available: true,
      combinationId: null,
    });
    expect(hit.images).toHaveLength(2);
  });

  it("товар с вариантами: минимальная цена комбинаций и первая по порядку показа", () => {
    const hit = mapSearchProduct(
      product({
        hasVariants: true,
        basePrice: null,
        compareAtPrice: null,
        variantGroups: [
          { name: "Цвет", options: [{ value: "Серый" }, { value: "Бежевый" }] },
        ],
        variantCombinations: [
          {
            id: "c-beige",
            price: 1200,
            available: true,
            options: { Цвет: "Бежевый" },
          },
          {
            id: "c-grey",
            price: 1500,
            available: true,
            options: { Цвет: "Серый" },
          },
        ],
      }),
    )!;
    expect(hit.price).toBe(1200);
    expect(hit.oldPrice).toBeNull();
    expect(hit.onSale).toBe(false);
    // Покупатель видит «Серый» первым — его и кладёт «В корзину».
    expect(hit.combinationId).toBe("c-grey");
    expect(hit.combinationOptions).toEqual({ Цвет: "Серый" });
  });

  it("свой basePrice у товара с вариантами не перебивает минимальную комбинацию", () => {
    // Каталог показывает «от X ₽» по самой дешёвой комбинации (mapApiProduct
    // портов) — поиск обязан показать то же число, а не basePrice товара.
    const hit = mapSearchProduct(
      product({
        hasVariants: true,
        basePrice: "1500.00",
        compareAtPrice: null,
        variantCombinations: [
          { id: "c-1", price: 1500, available: true, options: {} },
          { id: "c-2", price: 1200, available: true, options: {} },
        ],
      }),
    )!;
    expect(hit.price).toBe(1200);
  });

  it("старая цена не больше текущей — плашки «Скидка» нет", () => {
    const hit = mapSearchProduct(product({ compareAtPrice: "2000.00" }))!;
    expect(hit.oldPrice).toBeNull();
    expect(hit.onSale).toBe(false);
  });

  it("нет остатка и нет «продавать без остатка» — товар недоступен", () => {
    expect(mapSearchProduct(product({ quantity: 0 }))!.available).toBe(false);
    expect(
      mapSearchProduct(product({ quantity: 0, allowBackorder: true }))!
        .available,
    ).toBe(true);
  });

  it("мусор вместо товара отбрасывается", () => {
    expect(mapSearchProduct(null)).toBeNull();
    expect(mapSearchProduct({ title: "без id" })).toBeNull();
  });
});

describe("highlightMatch — подсветка совпадения с запросом", () => {
  it("подсвечивает совпадение независимо от регистра", () => {
    expect(highlightMatch("Кроссовки Trail", "кроссовки")).toBe(
      `${MARK_OPEN}Кроссовки${MARK_CLOSE} Trail`,
    );
  });

  it("ё и е — одна буква, подсветка работает в обе стороны", () => {
    expect(highlightMatch("Ремень «Плетёный»", "плетеный")).toBe(
      `Ремень «${MARK_OPEN}Плетёный${MARK_CLOSE}»`,
    );
    expect(highlightMatch("Плетеный ремень", "плетёный")).toBe(
      `${MARK_OPEN}Плетеный${MARK_CLOSE} ремень`,
    );
  });

  it("слово из 1–2 букв подсвечивается только в начале слова", () => {
    expect(highlightMatch("Кроссовки Runner", "кр")).toBe(
      `${MARK_OPEN}Кр${MARK_CLOSE}оссовки Runner`,
    );
    // «ра» есть внутри «красный» (со второй буквы), но не в начале слова — подсветки нет.
    const html = highlightMatch("Ботинки красный", "ра");
    expect(html).toBe("Ботинки красный");
    expect(html).not.toContain("<mark");
  });

  it("слово от 3 букв подсвечивается в любом месте слова", () => {
    expect(highlightMatch("Кашпо «Терракота»", "рак")).toBe(
      `Кашпо «Тер${MARK_OPEN}рак${MARK_CLOSE}ота»`,
    );
  });

  it("пересекающиеся совпадения склеиваются в один <mark>", () => {
    // «крос» (0–4) и «ссовки» (3–9) перекрываются — должен остаться один
    // <mark> на всё слово, а не два вложенных или задвоенных фрагмента.
    const html = highlightMatch("Кроссовки", "крос ссовки");
    expect(html).toBe(`${MARK_OPEN}Кроссовки${MARK_CLOSE}`);
    expect(html.match(/<mark/g)).toHaveLength(1);
  });

  it("несколько разных слов запроса подсвечиваются каждое отдельно", () => {
    const html = highlightMatch("Кроссовки Trail красные", "trail красные");
    expect(html.match(/<mark/g)).toHaveLength(2);
    expect(html).toContain(`${MARK_OPEN}Trail${MARK_CLOSE}`);
    expect(html).toContain(`${MARK_OPEN}красные${MARK_CLOSE}`);
  });

  it("название экранируется — тег не проходит в разметку как есть", () => {
    const html = highlightMatch(
      "<script>alert(1)</script> Кроссовки",
      "кроссовки",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain(`${MARK_OPEN}Кроссовки${MARK_CLOSE}`);
  });

  it("пустой запрос — просто экранированный текст, без <mark>", () => {
    expect(highlightMatch("Кроссовки Trail", "")).toBe("Кроссовки Trail");
    expect(highlightMatch("<b>Кроссовки</b>", "")).toBe(
      "&lt;b&gt;Кроссовки&lt;/b&gt;",
    );
  });
});

describe("resolveSearchEndpoint — магазин и gateway", () => {
  it("превью конструктора: id сайта и same-origin база", () => {
    expect(
      resolveSearchEndpoint({
        __MERFY_SITE_ID__: STORE,
        __MERFY_API_BASE__: "http://localhost:3110/",
      }),
    ).toEqual({ storeId: STORE, apiBase: "http://localhost:3110" });
  });

  it("живая витрина: shopId из пропатченного конфига, /api срезается", () => {
    expect(
      resolveSearchEndpoint({
        __MERFY_CONFIG__: {
          shopId: STORE,
          apiUrl: "https://gateway.merfy.ru/api",
        },
      }),
    ).toEqual({ storeId: STORE, apiBase: "https://gateway.merfy.ru" });
  });

  it("демо-сборка темы без магазина — поиска на лету нет", () => {
    expect(
      resolveSearchEndpoint({ __MERFY_CONFIG__: { shopId: "" } }),
    ).toBeNull();
  });

  it("адрес запроса: публичный маршрут поиска с лимитом", () => {
    expect(
      buildSearchUrl(
        { storeId: STORE, apiBase: "https://gateway.merfy.ru" },
        "нос",
        4,
      ),
    ).toBe(
      `https://gateway.merfy.ru/api/store/products/search?store_id=${STORE}&q=%D0%BD%D0%BE%D1%81&limit=4`,
    );
  });
});

describe("initHeaderSearch — поведение области поиска", () => {
  type FetchCall = {
    url: string;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  };
  let calls: FetchCall[];
  let rendered: Array<{
    hits: HeaderSearchHit[];
    layout: string;
    query: string;
  }>;
  let events: string[];

  const flush = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };

  const mount = () => {
    document.body.innerHTML = `
      <div data-header-search data-search-layout="drawer" data-search-limit="4" id="scope">
        <form role="search" action="/catalog" method="get">
          <input type="search" name="q" id="q" />
          <button type="submit" aria-label="Найти"></button>
        </form>
        <div data-search-results hidden id="results"></div>
        <nav data-search-idle id="nav"><a href="/catalog">Каталог</a></nav>
      </div>`;
  };

  const type = (value: string) => {
    const input = document.getElementById("q") as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const answer = (call: FetchCall, products: unknown[]) =>
    call.resolve({
      ok: true,
      json: async () => ({ products, total: products.length }),
    });

  const scope = () => document.getElementById("scope") as HTMLElement;
  const results = () => document.getElementById("results") as HTMLElement;
  const nav = () => document.getElementById("nav") as HTMLElement;

  beforeAll(() => {
    // Делегаты вешаются один раз на окно — как на витрине.
    initHeaderSearch({
      render: (hits, ctx) => {
        rendered.push({ hits, layout: ctx.layout, query: ctx.query });
        return hits
          .map(
            (h) =>
              `<a href="${ctx.escapeHtml(h.href)}" data-search-hit>${ctx.escapeHtml(h.title)} ${ctx.formatPrice(h.price)}</a>`,
          )
          .join("");
      },
      messageClass: "msg",
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
    calls = [];
    rendered = [];
    events = [];
    (window as any).__MERFY_SITE_ID__ = STORE;
    (window as any).__MERFY_API_BASE__ = "https://gateway.merfy.ru";
    (window as any).fetch = jest.fn(
      (url: string) =>
        new Promise((resolve, reject) => {
          calls.push({ url, resolve, reject });
        }),
    );
    mount();
    scope().addEventListener("merfy:header-search", (e) =>
      events.push((e as CustomEvent).detail.state),
    );
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).__MERFY_SITE_ID__;
    delete (window as any).__MERFY_API_BASE__;
    delete (window as any).fetch;
  });

  it("один символ — запроса нет, меню на месте", async () => {
    type("н");
    jest.advanceTimersByTime(1000);
    await flush();
    expect(calls).toHaveLength(0);
    expect(results().hidden).toBe(true);
    expect(nav().hidden).toBe(false);
  });

  it("запрос уходит после паузы, с магазином и лимитом области; ответ рисует тема", async () => {
    type("нос");
    jest.advanceTimersByTime(100);
    expect(calls).toHaveLength(0);
    jest.advanceTimersByTime(300);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://gateway.merfy.ru/api/store/products/search?store_id=${STORE}&q=%D0%BD%D0%BE%D1%81&limit=4`,
    );
    // Пока ждём ответ — сообщение и спрятанное меню шторки.
    expect(scope().dataset.searchState).toBe("loading");
    expect(nav().hidden).toBe(true);

    answer(calls[0], [product()]);
    await flush();
    expect(scope().dataset.searchState).toBe("results");
    expect(results().hidden).toBe(false);
    expect(results().innerHTML).toContain("Носки «Набор»");
    expect(results().innerHTML).toContain("2");
    expect(rendered[0]).toMatchObject({ layout: "drawer", query: "нос" });
    expect(events).toContain("results");
  });

  it("устаревший ответ не перетирает свежий", async () => {
    type("но");
    jest.advanceTimersByTime(300);
    type("носки");
    jest.advanceTimersByTime(300);
    expect(calls).toHaveLength(2);

    answer(calls[1], [product({ id: "fresh", title: "Свежий" })]);
    await flush();
    answer(calls[0], [product({ id: "stale", title: "Устаревший" })]);
    await flush();

    expect(results().innerHTML).toContain("Свежий");
    expect(results().innerHTML).not.toContain("Устаревший");
  });

  it("пустой ответ — сообщение классом темы", async () => {
    type("zzz");
    jest.advanceTimersByTime(300);
    answer(calls[0], []);
    await flush();
    expect(scope().dataset.searchState).toBe("empty");
    const msg = results().querySelector('[data-search-message="empty"]');
    expect(msg?.className).toBe("msg");
    expect(msg?.textContent).toContain("zzz");
  });

  it("ошибка gateway — сообщение, а не вечная загрузка", async () => {
    type("ошибка");
    jest.advanceTimersByTime(300);
    calls[0].resolve({ ok: false, status: 502, json: async () => ({}) });
    await flush();
    expect(scope().dataset.searchState).toBe("error");
    expect(
      results().querySelector('[data-search-message="error"]'),
    ).not.toBeNull();
  });

  it("очистка поля возвращает меню и прячет выдачу", async () => {
    type("очистка");
    jest.advanceTimersByTime(300);
    answer(calls[0], [product()]);
    await flush();
    type("");
    expect(scope().dataset.searchState).toBe("idle");
    expect(results().hidden).toBe(true);
    expect(results().innerHTML).toBe("");
    expect(nav().hidden).toBe(false);
  });

  it("Escape в поле чистит запрос", async () => {
    type("эскейп");
    jest.advanceTimersByTime(300);
    answer(calls[0], [product()]);
    await flush();
    const input = document.getElementById("q") as HTMLInputElement;
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(input.value).toBe("");
    expect(scope().dataset.searchState).toBe("idle");
  });

  it("повторный запрос берётся из памяти, без второго похода в gateway", async () => {
    type("память");
    jest.advanceTimersByTime(300);
    answer(calls[0], [product()]);
    await flush();
    type("");
    type("память");
    jest.advanceTimersByTime(300);
    await flush();
    expect(calls).toHaveLength(1);
    expect(scope().dataset.searchState).toBe("results");
  });

  it("вторая копия скрипта шапки не удваивает запросы и обновляет рендер", async () => {
    initHeaderSearch({ render: () => "<b data-second>второй рендер</b>" });
    type("шарф");
    jest.advanceTimersByTime(300);
    expect(calls).toHaveLength(1);
    answer(calls[0], [product()]);
    await flush();
    expect(results().querySelector("[data-second]")).not.toBeNull();
  });

  it("без магазина (демо-сборка) запросов нет", async () => {
    delete (window as any).__MERFY_SITE_ID__;
    type("демо");
    jest.advanceTimersByTime(1000);
    await flush();
    expect(calls).toHaveLength(0);
    expect(scope().dataset.searchState).toBe("idle");
  });

  it("ctx.highlight в рендере темы подсвечивает совпадение с текущим запросом", async () => {
    initHeaderSearch({
      render: (hits, ctx) =>
        hits
          .map((h) => `<a data-search-hit>${ctx.highlight(h.title)}</a>`)
          .join(""),
    });
    type("trail");
    jest.advanceTimersByTime(300);
    answer(calls[0], [product({ title: "Кроссовки Trail" })]);
    await flush();
    // Через innerHTML jsdom нормализует сериализацию атрибута без значения
    // (`data-search-mark=""`) — сравниваем не сырую строку, а сам узел DOM.
    const mark = results().querySelector("mark[data-search-mark]");
    expect(mark?.textContent).toBe("Trail");
  });
});

describe("переключатель фото в карточке результата", () => {
  it("точка меняет картинку своей карточки и помечается активной", () => {
    document.body.innerHTML = `
      <div data-search-hit>
        <a href="/product?id=1"><img data-search-img src="a.jpg" /></a>
        <button type="button" data-search-dot data-src="a.jpg" data-active="true"></button>
        <button type="button" data-search-dot data-src="b.jpg" data-active="false" id="second"></button>
      </div>`;
    (document.getElementById("second") as HTMLElement).click();
    expect(
      (
        document.querySelector("[data-search-img]") as HTMLImageElement
      ).getAttribute("src"),
    ).toBe("b.jpg");
    expect(
      (document.getElementById("second") as HTMLElement).dataset.active,
    ).toBe("true");
  });
});
