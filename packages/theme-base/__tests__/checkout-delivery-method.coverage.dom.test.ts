/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryMethod — оставшиеся ветки, не задетые pvz-picker/dedup/digital
 * тестами: ошибки расчёта, ретраи, отмена запроса (AbortController), резолв
 * индекса по ФИАС, дебаунс cart:updated, экранирование текста, редкие состояния
 * ПВЗ-пикера (ошибка/пусто/поиск без совпадений/сортировка одинаковых типов).
 * Скрипт исполняется через astroInlineRunners (в файле один <script>, индекс [0]),
 * покрытие пишется под путём CheckoutDeliveryMethod.astro.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutDeliveryMethod",
  "CheckoutDeliveryMethod.astro",
);

function mountDom(pickupEnabled = false): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery-method data-puck-component-id="cdm-1"
             data-cdek-enabled="true"
             data-cdek-door-label="Курьер СДЭК до двери"
             data-cdek-pvz-label="Пункт выдачи СДЭК"
             data-cdek-postamat-label="Постамат СДЭК"
             data-pickup-enabled="${pickupEnabled ? "true" : "false"}"
             data-pickup-label="Самовывоз"
             data-free-shipping-threshold="">
      <div data-checkout-delivery-empty></div>
      <div data-checkout-delivery-loading hidden></div>
      <div data-checkout-delivery-error hidden></div>
      <div data-checkout-delivery-list hidden></div>
      <div data-cdek-pvz-picker hidden></div>
    </section>`;
  return document.querySelector(
    "[data-checkout-delivery-method]",
  ) as HTMLElement;
}

// document переживает все it() одного файла (только body.innerHTML сбрасывается
// между тестами) — а скрипт на каждый runScript() вешает НОВЫЕ document-level
// listener'ы (checkout:address-changed, cart:updated, checkout:config-ready).
// Без снятия их между тестами к N-му тесту накапливается N экземпляров скрипта,
// каждый параллельно реагирует на диспатчи (лишние fetch к логистике — портит
// счётчики вызовов в тестах ретраев). Перехватываем регистрацию и снимаем в afterEach.
let capturedDocListeners: Array<[string, EventListenerOrEventListenerObject]> =
  [];

/**
 * Единственная точка входа для исполнения скрипта в этом файле. document
 * переживает все it() одного файла (только body.innerHTML сбрасывается между
 * тестами) — а скрипт на каждый запуск вешает НОВЫЕ document-level listener'ы
 * (checkout:address-changed ×2, cart:updated, checkout:config-ready). Без
 * снятия их между тестами к N-му тесту накапливается N экземпляров скрипта,
 * каждый параллельно реагирует на диспатчи (лишние fetch к логистике — портит
 * счётчики вызовов в тестах ретраев/дебаунса). ВСЕ вызовы .run() в файле обязаны
 * идти через этот хелпер (напрямую astroInlineRunners(...).run(...) не звать) —
 * иначе его слушатели не попадут в capturedDocListeners и останутся навсегда.
 */
function runInstrumented(
  runIt: () => void,
  opts: { keepSafetyNet?: boolean } = {},
) {
  const originalAdd = document.addEventListener.bind(document);
  (document as any).addEventListener = (
    type: string,
    listener: any,
    opts2?: any,
  ) => {
    capturedDocListeners.push([type, listener]);
    return originalAdd(type, listener, opts2);
  };
  try {
    runIt();
  } finally {
    document.addEventListener = originalAdd;
  }
  // Скрипт безусловно ставит safety-net таймер (~1500мс) на первичный рендер
  // (initialDeliveryRender). Для большинства тестов файла он НЕ имеет отношения
  // к сценарию (уже покрыт checkout-delivery-method-digital.dom.test.ts) и, если
  // тесту нужно продвинуть fake timers дальше 1500мс (ретраи 2000/5000/10000мс),
  // он же самостоятельно стреляет и порождает ПАРАЛЛЕЛЬНЫЙ независимый
  // recalculate — раздувая число fetch-вызовов. Гасим его сразу после
  // инициализации — КРОМЕ тестов, которые намеренно проверяют сам safety-net
  // (opts.keepSafetyNet), им он нужен живым.
  if (!opts.keepSafetyNet) jest.clearAllTimers();
}

function runScript(
  section: HTMLElement,
  opts: { keepSafetyNet?: boolean } = {},
) {
  (window as any).__merfyRoot = () => section;
  runInstrumented(
    () => astroInlineRunners(ASTRO)[0].run({ blockId: "cdm-1" }),
    opts,
  );
}

function dispatchAddress(detail: Record<string, unknown>) {
  document.dispatchEvent(
    new CustomEvent("checkout:address-changed", { detail }),
  );
}

async function tick(times = 8) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  await tick();
}

const OK_OWN = (name = "Своя доставка") => ({
  success: true,
  data: {
    deliveryOptions: [
      {
        id: "own1",
        name,
        type: "OWN",
        price: 150,
        minDays: 1,
        maxDays: 3,
        description: "",
      },
    ],
    pickupPoints: [],
  },
});

describe("CheckoutDeliveryMethod — покрытие оставшихся веток", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    localStorage.setItem("merfy:cartId", "cart1");
    (window as any).__MERFY_CONFIG__ = {
      shopId: "shop1",
      apiUrl: "https://gateway.test/api",
    };
    fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      }),
    );
    (window as any).fetch = fetchMock;
  });

  afterEach(() => {
    capturedDocListeners.forEach(([type, listener]) =>
      document.removeEventListener(type, listener),
    );
    capturedDocListeners = [];
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).cartStore;
    delete (window as any).__DADATA_TOKEN__;
    document.body.innerHTML = "";
  });

  it("экранирует спецсимволы в подписи тарифа (esc)", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => OK_OWN("Экспресс & К° <24ч>"),
      }),
    );
    const section = mountDom();
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    const label = section.querySelector("[data-delivery-label]")!;
    expect(label.innerHTML).toContain("&amp;");
    expect(label.innerHTML).toContain("&lt;24ч&gt;");
    expect(label.textContent).toBe("Экспресс & К° <24ч>");
  });

  it("без window.cartStore порог бесплатной доставки считает корзину нулевой (fallback 0₽)", async () => {
    // cartStore не задан вовсе (в отличие от остальных тестов файла).
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => OK_OWN() }),
    );
    const section = mountDom();
    section.setAttribute("data-free-shipping-threshold", "0"); // порог 0 — бесплатно при sum>=0, т.е. всегда
    runScript(section);
    dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
    await tick();

    const card = section.querySelector("[data-delivery-option]")!;
    expect(card.getAttribute("data-delivery-price-cents")).toBe("0");
  });

  describe("порог бесплатной доставки — с window.cartStore.getTotal (сумма ниже/выше порога)", () => {
    it("сумма корзины НИЖЕ порога — платный тариф остаётся платным", async () => {
      (window as any).cartStore = { getTotal: () => 10000 }; // 100₽
      fetchMock.mockImplementation(
        () => Promise.resolve({ ok: true, json: async () => OK_OWN() }), // 150₽ = 15000 копеек
      );
      const section = mountDom();
      section.setAttribute("data-free-shipping-threshold", "20000"); // порог 200₽ — корзина меньше
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const card = section.querySelector("[data-delivery-option]")!;
      expect(card.getAttribute("data-delivery-price-cents")).toBe("15000");
    });

    it("сумма корзины НЕ НИЖЕ порога — платный тариф становится бесплатным", async () => {
      (window as any).cartStore = { getTotal: () => 25000 }; // 250₽
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => OK_OWN() }),
      );
      const section = mountDom();
      section.setAttribute("data-free-shipping-threshold", "20000"); // порог 200₽ — корзина выше
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const card = section.querySelector("[data-delivery-option]")!;
      expect(card.getAttribute("data-delivery-price-cents")).toBe("0");
    });
  });

  describe("ошибки расчёта", () => {
    it('адрес НЕизвестен, опций нет вообще (нет OWN, самовывоз выключен) — "Заполните адрес доставки" (после исчерпания ретраев)', async () => {
      // recalculate(null) — addressKnown=false; пустой ответ без cdekError не
      // фатален сразу, ретраит до конца лестницы, и только тогда render()
      // показывает block-level empty (не error) для случая "без адреса".
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { deliveryOptions: [], pickupPoints: [] },
          }),
        }),
      );
      const section = mountDom(false); // самовывоз выключен, OWN-тарифов в ответе нет
      runScript(section);
      dispatchAddress({}); // без cityFiasId → addressKnown=false
      await tick();
      await advance(2000);
      await advance(5000);
      await advance(10000);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const emptyEl = section.querySelector(
        "[data-checkout-delivery-empty]",
      ) as HTMLElement;
      expect(emptyEl.hidden).toBe(false);
      expect(emptyEl.textContent).toBe(
        "Заполните адрес доставки чтобы увидеть варианты.",
      );
      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.hidden).toBe(true); // это block-level empty, а не error
    });

    it("адрес известен, опций нет, cdekError не пришёл — общее сообщение об ошибке (после исчерпания ретраев)", async () => {
      // Пустой ответ БЕЗ cdekError не считается фатальным сразу (это же «пустой
      // ответ» eventual-consistency retry, строки 795/801) — движок домучивает
      // всю лестницу ретраев и только потом render() показывает общую ошибку.
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { deliveryOptions: [], pickupPoints: [] },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      await advance(2000);
      await advance(5000);
      await advance(10000);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toBe(
        "Нет доступных вариантов доставки для этого адреса",
      );
    });

    it("адрес известен, опций нет, но пришёл cdekError — показываем его текст", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [],
              pickupPoints: [],
              cdekError: "СДЭК недоступен для этого города",
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.textContent).toBe("СДЭК недоступен для этого города");
    });

    it("cdekError пришёл СРАЗУ на первой попытке (адрес известен, 0 опций и 0 точек) — ошибка без ретраев", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [],
              pickupPoints: [],
              cdekError: "СДЭК лежит",
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(fetchMock).toHaveBeenCalledTimes(1); // без ретраев — фатальная ошибка
      expect(
        (section.querySelector("[data-checkout-delivery-error]") as HTMLElement)
          .textContent,
      ).toBe("СДЭК лежит");
    });

    it("ответ success:false — сообщение из error без ретраев", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: false, error: "Магазин не найден" }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        (section.querySelector("[data-checkout-delivery-error]") as HTMLElement)
          .textContent,
      ).toBe("Магазин не найден");
    });

    it("ответ success:false — сообщение из message, если error отсутствует", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: false, message: "Bad request" }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(
        (section.querySelector("[data-checkout-delivery-error]") as HTMLElement)
          .textContent,
      ).toBe("Bad request");
    });

    it("ответ success:false без error/message — дефолтная фраза", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => ({ success: false }) }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(
        (section.querySelector("[data-checkout-delivery-error]") as HTMLElement)
          .textContent,
      ).toBe("Не удалось рассчитать доставку");
    });

    it('все 4 попытки падают по сети — итоговая ошибка "Сервис доставки недоступен" (полный ретрай-цикл)', async () => {
      fetchMock.mockImplementation(() =>
        Promise.reject(new Error("network down")),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({}); // без адреса — проще, без резолва индекса
      await tick();
      await advance(2000);
      await advance(5000);
      await advance(10000);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toBe("Сервис доставки недоступен");
    });

    it("первая попытка пуста (retry), вторая — успешна: рендерится результат второй попытки", async () => {
      let call = 0;
      fetchMock.mockImplementation(() => {
        call += 1;
        if (call === 1)
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: { deliveryOptions: [], pickupPoints: [] },
            }),
          });
        return Promise.resolve({
          ok: true,
          json: async () => OK_OWN("Со второй попытки"),
        });
      });
      const section = mountDom();
      runScript(section);
      dispatchAddress({}); // addressKnown=false → пустой ответ не считается фатальным, просто следующая попытка
      await tick();
      await advance(2000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(section.querySelector("[data-delivery-label]")!.textContent).toBe(
        "Со второй попытки",
      );
    });

    it("AbortError при отмене предыдущего запроса — recalculate тихо завершается (без ошибки на экране)", async () => {
      const abortError = () =>
        Object.assign(new Error("aborted"), { name: "AbortError" });
      fetchMock.mockImplementation((_url: string, opts: any) => {
        return new Promise((resolve, reject) => {
          const signal = opts && opts.signal;
          if (signal) {
            if (signal.aborted) {
              reject(abortError());
              return;
            }
            signal.addEventListener("abort", () => reject(abortError()));
          }
          Promise.resolve().then(() =>
            resolve({
              ok: true,
              json: async () => OK_OWN("Вторая корзина/адрес"),
            }),
          );
        });
      });
      const section = mountDom();
      runScript(section); // фейковые таймеры ещё активны — safety-net (~1500мс) гасится clearAllTimers() внутри runScript
      jest.useRealTimers(); // дальше гонка разрешается микрозадачами, таймеры не нужны; переключаться РАНЬШЕ runScript нельзя — иначе safety-net уйдёт в реальный setTimeout и переживёт тест

      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" }); // первый запрос — уйдёт в отмену
      dispatchAddress({ cityFiasId: "fias2", postalCode: "190000" }); // второй — должен отрисоваться
      await tick(20);

      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.hidden).toBe(true); // AbortError не показывается как ошибка
      expect(section.querySelector("[data-delivery-label]")!.textContent).toBe(
        "Вторая корзина/адрес",
      );
    });
  });

  describe("recalculate — ранние выходы", () => {
    it('нет shopId — "Магазин не определён", fetch не вызывается', async () => {
      (window as any).__MERFY_CONFIG__ = {}; // shopId пуст
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      expect(fetchMock).not.toHaveBeenCalled();
      const emptyEl = section.querySelector(
        "[data-checkout-delivery-empty]",
      ) as HTMLElement;
      expect(emptyEl.hidden).toBe(false);
      expect(emptyEl.textContent).toBe("Магазин не определён");
    });

    it('нет cartId в localStorage — "Добавьте товар в корзину", fetch не вызывается', async () => {
      localStorage.clear(); // без merfy:cartId
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      expect(fetchMock).not.toHaveBeenCalled();
      const emptyEl = section.querySelector(
        "[data-checkout-delivery-empty]",
      ) as HTMLElement;
      expect(emptyEl.textContent).toBe(
        "Добавьте товар в корзину чтобы рассчитать доставку",
      );
    });
  });

  describe("resolvePostalFromFiasId — резолв индекса по ФИАС", () => {
    function mountStrayPostalInput(initialValue = ""): HTMLInputElement {
      const wrap = document.createElement("div");
      wrap.setAttribute("data-checkout-field", "postalCode");
      wrap.innerHTML = `<input value="${initialValue}" />`;
      document.body.appendChild(wrap);
      return wrap.querySelector("input") as HTMLInputElement;
    }

    it("индекс не пришёл от формы — резолвится по fiasId и подставляется в видимое поле (оно было пустым)", async () => {
      (window as any).__DADATA_TOKEN__ = "tok";
      const section = mountDom();
      const postalInput = mountStrayPostalInput("");
      fetchMock.mockImplementation((url: string) => {
        if (/findById\/address/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              suggestions: [{ data: { postal_code: "101000" } }],
            }),
          });
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({ ok: true, json: async () => OK_OWN() });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" }); // postalCode не передан
      await tick();

      expect(postalInput.value).toBe("101000");
    });

    it('видимое поле "Индекс" уже заполнено — резолв его не перезаписывает', async () => {
      (window as any).__DADATA_TOKEN__ = "tok";
      const section = mountDom();
      const postalInput = mountStrayPostalInput("999000");
      fetchMock.mockImplementation((url: string) => {
        if (/findById\/address/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              suggestions: [{ data: { postal_code: "101000" } }],
            }),
          });
        return Promise.resolve({ ok: true, json: async () => OK_OWN() });
      });
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      expect(postalInput.value).toBe("999000");
    });

    it("без DaData-токена — резолв возвращает пусто, запрос в логистику всё равно уходит без postalCode", async () => {
      delete (window as any).__DADATA_TOKEN__;
      const section = mountDom();
      mountStrayPostalInput("");
      fetchMock.mockImplementation((url: string) => {
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({ ok: true, json: async () => OK_OWN() });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      expect(
        fetchMock.mock.calls.some((c) =>
          /findById\/address/.test(String(c[0])),
        ),
      ).toBe(false);
      const calcCall = fetchMock.mock.calls.find((c) =>
        /delivery\/calculate/.test(String(c[0])),
      )!;
      const body = JSON.parse((calcCall[1] as RequestInit).body as string);
      expect(body.postalCode).toBeUndefined();
    });

    it("токен есть, но DaData вернул сетевую ошибку — резолв возвращает пусто (catch)", async () => {
      (window as any).__DADATA_TOKEN__ = "tok";
      const section = mountDom();
      mountStrayPostalInput("");
      fetchMock.mockImplementation((url: string) => {
        if (/findById\/address/.test(url))
          return Promise.reject(new Error("dadata down"));
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({ ok: true, json: async () => OK_OWN() });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      const calcCall = fetchMock.mock.calls.find((c) =>
        /delivery\/calculate/.test(String(c[0])),
      )!;
      const body = JSON.parse((calcCall[1] as RequestInit).body as string);
      expect(body.postalCode).toBeUndefined();
    });

    it("токен из __MERFY_CONFIG__.dadataToken (без __DADATA_TOKEN__) — резолв тоже срабатывает", async () => {
      (window as any).__MERFY_CONFIG__ = {
        shopId: "shop1",
        apiUrl: "https://gateway.test/api",
        dadataToken: "cfg-tok",
      };
      const section = mountDom();
      const postalInput = mountStrayPostalInput("");
      fetchMock.mockImplementation((url: string) => {
        if (/findById\/address/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              suggestions: [{ data: { postal_code: "450000" } }],
            }),
          });
        return Promise.resolve({ ok: true, json: async () => OK_OWN() });
      });
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      expect(postalInput.value).toBe("450000");
    });

    it("DaData вернул suggestions без postal_code — резолв возвращает пусто", async () => {
      (window as any).__DADATA_TOKEN__ = "tok";
      const section = mountDom();
      mountStrayPostalInput("");
      fetchMock.mockImplementation((url: string) => {
        if (/findById\/address/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({ suggestions: [{ data: {} }] }),
          });
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({ ok: true, json: async () => OK_OWN() });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      const calcCall = fetchMock.mock.calls.find((c) =>
        /delivery\/calculate/.test(String(c[0])),
      )!;
      const body = JSON.parse((calcCall[1] as RequestInit).body as string);
      expect(body.postalCode).toBeUndefined();
    });

    it('видимого поля "Индекс" от формы нет в DOM — резолв не падает, расчёт всё равно завершается карточкой', async () => {
      (window as any).__DADATA_TOKEN__ = "tok"; // stray input НЕ монтируем
      fetchMock.mockImplementation((url: string) => {
        if (/findById\/address/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              suggestions: [{ data: { postal_code: "101000" } }],
            }),
          });
        return Promise.resolve({ ok: true, json: async () => OK_OWN() });
      });
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      // Резолв индекса — лишь побочный шаг; главное здесь то, что отсутствие
      // поля "Индекс" в DOM не обрывает recalculate — карточка всё равно рисуется.
      expect(section.querySelector("[data-delivery-label]")!.textContent).toBe(
        "Своя доставка",
      );
    });
  });

  describe("cart:updated — дебаунс и recalcFromCart", () => {
    it("без сохранённого адреса, но с готовой корзиной — пересчитывает адрес-независимые опции (recalculate(null))", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => OK_OWN("OWN без адреса"),
        }),
      );
      const section = mountDom();
      runScript(section);
      // data-last-fias-id не выставлен вовсе
      document.dispatchEvent(new CustomEvent("cart:updated"));
      await advance(400);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(section.querySelector("[data-delivery-label]")!.textContent).toBe(
        "OWN без адреса",
      );
    });

    it("без адреса и без готовой корзины (нет shopId) — recalcFromCart ничего не делает", async () => {
      (window as any).__MERFY_CONFIG__ = {}; // нет shopId
      const section = mountDom();
      runScript(section);
      document.dispatchEvent(new CustomEvent("cart:updated"));
      await advance(400);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("несколько cart:updated подряд схлопываются в один пересчёт (дебаунс 400мс)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => OK_OWN() }),
      );
      const section = mountDom();
      runScript(section);
      document.dispatchEvent(new CustomEvent("cart:updated"));
      document.dispatchEvent(new CustomEvent("cart:updated"));
      document.dispatchEvent(new CustomEvent("cart:updated"));
      await advance(400);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("с сохранённым адресом — cart:updated пересчитывает по нему (lastFiasId ветка)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => OK_OWN("С адресом") }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias9", postalCode: "111111" });
      await tick();
      fetchMock.mockClear();

      document.dispatchEvent(new CustomEvent("cart:updated"));
      await advance(400);

      const calcCall = fetchMock.mock.calls.find((c) =>
        /delivery\/calculate/.test(String(c[0])),
      )!;
      const body = JSON.parse((calcCall[1] as RequestInit).body as string);
      expect(body.cityFiasId).toBe("fias9");
    });
  });

  describe('первичный рендер — readyState="loading"', () => {
    it('document.readyState="loading" — первичный safety-net навешивается на DOMContentLoaded (до события вызова нет, после + 1500мс — ровно один)', async () => {
      // readyState в jsdom — геттер на прототипе Document, а не собственное свойство
      // document: getOwnPropertyDescriptor(document,'readyState') вернёт undefined,
      // и наивное "if(original) restore" НИЧЕГО не восстановит — readyState навсегда
      // останется 'loading' для всех последующих тестов файла (поймано на практике:
      // тест safety-net ниже переставал видеть настоящий вызов scheduleInitialSafetyNet).
      // Поэтому восстанавливаем явно, всегда, через delete — свойство просто перестаёт
      // быть собственным и снова читается из прототипа jsdom (обычно 'complete').
      const original = Object.getOwnPropertyDescriptor(document, "readyState");
      Object.defineProperty(document, "readyState", {
        value: "loading",
        configurable: true,
      });
      try {
        const section = mountDom();
        runScript(section, { keepSafetyNet: true });
        // ДО DOMContentLoaded — safety-net ещё не выстрелил, вызовов нет.
        expect(fetchMock).not.toHaveBeenCalled();

        // ПОСЛЕ DOMContentLoaded + его собственного таймера (~1500мс) — ровно ОДИН
        // вызов initialDeliveryRender()→recalculate (не задвоился, не потерялся).
        document.dispatchEvent(new Event("DOMContentLoaded"));
        await advance(1500);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        if (original) Object.defineProperty(document, "readyState", original);
        else delete (document as any).readyState;
      }
    });
  });

  describe("ПВЗ-пикер — редкие состояния", () => {
    function mockCalcWithPickupTariff(kind: string | null = null) {
      fetchMock.mockImplementation((url: string) => {
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    description: "",
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: kind,
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    it('ошибка загрузки точек — показывается сообщение с кнопкой "Повторить", повтор перезапрашивает', async () => {
      mockCalcWithPickupTariff();
      let pointsCall = 0;
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url)) {
          pointsCall += 1;
          if (pointsCall === 1) return Promise.reject(new Error("net"));
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [{ code: "P1", address: "ул А, 1", type: "PVZ" }],
            }),
          });
        }
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;
      expect(picker.textContent).toContain(
        "Не удалось загрузить пункты выдачи",
      );
      const retryBtn = picker.querySelector("[data-pvz-retry]") as HTMLElement;
      expect(retryBtn).not.toBeNull();

      retryBtn.click();
      await tick();

      expect(picker.querySelector("[data-pvz-row]")).not.toBeNull();
      expect(pointsCall).toBe(2);
    });

    it('точек для этого типа нет (пустой массив) — "Нет доступных пунктов выдачи в этом городе"', async () => {
      mockCalcWithPickupTariff("PVZ");
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: [] }),
          });
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;
      expect(picker.textContent).toContain(
        "Нет доступных пунктов выдачи в этом городе",
      );
    });

    it('точек для постамата нет — сообщение с формой множественного числа "постаматов"', async () => {
      mockCalcWithPickupTariff("POSTAMAT");
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: [] }),
          });
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;
      expect(picker.textContent).toContain(
        "Нет доступных постаматов в этом городе",
      );
    });

    it("сортировка двух точек ОДНОГО типа — по адресу (localeCompare), не по типу", async () => {
      mockCalcWithPickupTariff("PVZ");
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [
                { code: "B", address: "ул Яузская, 2", type: "PVZ" },
                { code: "A", address: "ул Арбат, 1", type: "PVZ" },
              ],
            }),
          });
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const rows = section.querySelectorAll("[data-pvz-row]");
      expect(rows.length).toBe(2);
      expect(rows[0].getAttribute("data-pvz-code")).toBe("A"); // Арбат раньше Яузской
      expect(rows[1].getAttribute("data-pvz-code")).toBe("B");
    });

    it('поиск без совпадений — "Ничего не найдено"', async () => {
      mockCalcWithPickupTariff();
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [{ code: "P1", address: "ул А, 1", type: "PVZ" }],
            }),
          });
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const search = section.querySelector(
        "[data-pvz-search]",
      ) as HTMLInputElement;
      search.value = "Нет такой улицы";
      search.dispatchEvent(new Event("input", { bubbles: true }));

      expect(
        section.querySelector("[data-cdek-pvz-picker]")!.textContent,
      ).toContain("Ничего не найдено");
    });
  });

  describe("дедуп CDEK по одинаковой цене (cdekBetter) — срок как тай-брейкер", () => {
    // Пять PARTNER pickup-тарифов ОДНОГО метода (PVZ) по ОДНОЙ цене (300₽) — цена
    // не решает, поэтому tie-break идёт по сроку (меньше maxDays/minDays лучше);
    // отсутствие срока считается «самым долгим» (Infinity).
    const SAME_PRICE_PVZ = [
      {
        id: "a",
        name: "A",
        type: "PARTNER",
        price: 300,
        minDays: 2,
        maxDays: 5,
        cdekTariffCode: 1,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "b",
        name: "B",
        type: "PARTNER",
        price: 300,
        minDays: null,
        maxDays: null,
        cdekTariffCode: 2,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "c",
        name: "C",
        type: "PARTNER",
        price: 300,
        minDays: 1,
        maxDays: 5,
        cdekTariffCode: 3,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "d",
        name: "D",
        type: "PARTNER",
        price: 300,
        minDays: null,
        maxDays: null,
        cdekTariffCode: 4,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "e",
        name: "E",
        type: "PARTNER",
        price: 300,
        minDays: null,
        maxDays: 5,
        cdekTariffCode: 5,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
    ];

    it("из пяти дублей по одной цене побеждает тариф с самым быстрым известным сроком (1–5 дней, тариф 3)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { deliveryOptions: SAME_PRICE_PVZ, pickupPoints: [] },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const cards = section.querySelectorAll("[data-delivery-option]");
      expect(cards.length).toBe(1); // все пять — один методKey (PVZ) → одна карточка
      expect(cards[0].getAttribute("data-delivery-tariff-code")).toBe("3");
    });
  });

  describe("переключение radio-визуала на клике (data-delivery-radio-dot)", () => {
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ (сомнительно): обработчик клика ищет [data-delivery-radio-dot]
    // внутри карточки (строки 659,671 CheckoutDeliveryMethod.astro) и обновляет его
    // className/innerHTML, но шаблон render() (строки 591-610) такой узел вообще не
    // рисует — есть только <input data-delivery-radio>. При текущей вёрстке это
    // мёртвый код. Ниже элемент добавлен вручную (как будто он есть), чтобы
    // зафиксировать, что сама JS-логика переключения корректна на случай, если
    // верстальщики добавят этот узел или его вернут в другой теме/варианте.
    it("добавленный вручную [data-delivery-radio-dot] переключается между карточками при клике", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "o1",
                  name: "Вариант 1",
                  type: "OWN",
                  price: 100,
                  minDays: 1,
                  maxDays: 2,
                },
                {
                  id: "o2",
                  name: "Вариант 2",
                  type: "OWN",
                  price: 200,
                  minDays: 1,
                  maxDays: 2,
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const cards = Array.from(
        section.querySelectorAll("[data-delivery-option]"),
      );
      expect(cards.length).toBe(2);
      cards.forEach((c) =>
        c.insertAdjacentHTML(
          "afterbegin",
          "<span data-delivery-radio-dot></span>",
        ),
      );
      const [first, second] = cards;
      // Первая карточка выбрана автовыбором — эмулируем, что её dot уже "включен".
      (
        first.querySelector("[data-delivery-radio-dot]") as HTMLElement
      ).innerHTML = "<span>•</span>";

      (second as HTMLElement).click();

      expect(
        (first.querySelector("[data-delivery-radio-dot]") as HTMLElement)
          .innerHTML,
      ).toBe("");
      expect(
        (second.querySelector("[data-delivery-radio-dot]") as HTMLElement)
          .innerHTML,
      ).toContain("span");
    });
  });

  describe("корень блока и дефолты атрибутов", () => {
    it("__merfyRoot(blockId) вернул null — секция находится фолбэком через document.querySelector", async () => {
      document.body.innerHTML = `
        <section data-checkout-delivery-method data-cdek-enabled="true" data-pickup-enabled="false" data-pickup-label="Самовывоз"
                 data-cdek-door-label="Курьер" data-cdek-pvz-label="ПВЗ" data-cdek-postamat-label="Постамат" data-free-shipping-threshold="">
          <div data-checkout-delivery-empty></div>
          <div data-checkout-delivery-loading hidden></div>
          <div data-checkout-delivery-error hidden></div>
          <div data-checkout-delivery-list hidden></div>
          <div data-cdek-pvz-picker hidden></div>
        </section>`;
      const section = document.querySelector(
        "[data-checkout-delivery-method]",
      ) as HTMLElement;
      (window as any).__merfyRoot = () => null;
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => OK_OWN() }),
      );

      runInstrumented(() =>
        astroInlineRunners(ASTRO)[0].run({ blockId: "cdm-1" }),
      );
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      // Слушатели действительно повешены на секцию, найденную фолбэком —
      // иначе checkout:address-changed никто бы не поймал и список остался пуст.
      expect(section.querySelector("[data-delivery-label]")).not.toBeNull();
    });

    it("ни __merfyRoot, ни секция в DOM — скрипт тихо завершается", () => {
      document.body.innerHTML = "";
      (window as any).__merfyRoot = () => null;
      expect(() =>
        runInstrumented(() =>
          astroInlineRunners(ASTRO)[0].run({ blockId: "cdm-1" }),
        ),
      ).not.toThrow();
    });

    it("без data-pickup-label/data-cdek-door-label/data-cdek-pvz-label — используются дефолтные подписи", async () => {
      document.body.innerHTML = `
        <section data-checkout-delivery-method data-puck-component-id="cdm-1" data-cdek-enabled="true" data-pickup-enabled="true" data-free-shipping-threshold="">
          <div data-checkout-delivery-empty></div>
          <div data-checkout-delivery-loading hidden></div>
          <div data-checkout-delivery-error hidden></div>
          <div data-checkout-delivery-list hidden></div>
          <div data-cdek-pvz-picker hidden></div>
        </section>`;
      const section = document.querySelector(
        "[data-checkout-delivery-method]",
      ) as HTMLElement;
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [],
              pickupPoints: [{ id: "p1", address: "ул А" }],
            },
          }),
        }),
      );
      runScript(section);
      dispatchAddress({});
      await tick();

      expect(section.querySelector("[data-delivery-label]")!.textContent).toBe(
        "Самовывоз",
      ); // дефолт pickupLabel
    });
  });

  describe("esc()/fmt() — редкие входные данные", () => {
    it('цена не число (backend прислал мусор) — карточка показывает "0 ₽", а не NaN', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "o1",
                  name: "Странный тариф",
                  type: "OWN",
                  price: "не число",
                  minDays: 1,
                  maxDays: 2,
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const card = section.querySelector("[data-delivery-option]")!;
      const price = card.lastElementChild as HTMLElement; // последний child карточки — span с ценой (см. render() в .astro), не завязано на Tailwind-класс
      expect(price.textContent).toBe("0 ₽");
      expect(price.textContent).not.toContain("NaN");
    });

    it('цена не задана вовсе (нет поля price) — считается 0 и показывается "Бесплатно"', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "o1",
                  name: "Без цены",
                  type: "OWN",
                  minDays: 1,
                  maxDays: 2,
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(
        section
          .querySelector("[data-delivery-price-cents]")!
          .getAttribute("data-delivery-price-cents"),
      ).toBe("0");
    });

    it("точка самовывоза без code/address (только type) — экранирование не падает на undefined", async () => {
      fetchMock.mockImplementation((url: string) => {
        // type:'PVZ' обязателен — иначе kindFilteredPoints отфильтрует точку до рендера
        // (тариф ниже — ПВЗ-тип), а code/address нарочно отсутствуют.
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: [{ type: "PVZ" }] }),
          });
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: "PVZ",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const row = section.querySelector("[data-pvz-row]") as HTMLElement;
      expect(row.getAttribute("data-pvz-code")).toBe("");
      expect(row.getAttribute("data-pvz-address")).toBe("");
    });
  });

  describe("дедуп CDEK — обе стороны тай-брейкера (периоды null у a и у b)", () => {
    // Пять PARTNER-опций: X1..X4 (методKey PVZ, одна цена 300) прогоняют обе
    // стороны сравнения periodMax/periodMin у КАНДИДАТА (a); Y1..Y2 (методKey
    // POSTAMAT) прогоняют те же стороны у ТЕКУЩЕГО ЛУЧШЕГО (b) — недостающий
    // срок считается «самым долгим» (Infinity) с обеих сторон сравнения.
    const OPTIONS = [
      {
        id: "x1",
        name: "X1",
        type: "PARTNER",
        price: 300,
        minDays: 2,
        maxDays: 5,
        cdekTariffCode: 1,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "x2",
        name: "X2",
        type: "PARTNER",
        price: 300,
        minDays: null,
        maxDays: null,
        cdekTariffCode: 2,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "x3",
        name: "X3",
        type: "PARTNER",
        price: 300,
        minDays: 1,
        maxDays: 5,
        cdekTariffCode: 3,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "x4",
        name: "X4",
        type: "PARTNER",
        price: 300,
        minDays: null,
        maxDays: 5,
        cdekTariffCode: 4,
        deliveryMode: "pickup",
        pickupPointKind: "PVZ",
      },
      {
        id: "y1",
        name: "Y1",
        type: "PARTNER",
        price: 300,
        minDays: null,
        maxDays: null,
        cdekTariffCode: 10,
        deliveryMode: "pickup",
        pickupPointKind: "POSTAMAT",
      },
      {
        id: "y2",
        name: "Y2",
        type: "PARTNER",
        price: 300,
        minDays: 5,
        maxDays: null,
        cdekTariffCode: 11,
        deliveryMode: "pickup",
        pickupPointKind: "POSTAMAT",
      },
    ];

    it("ПВЗ-группа выбирает X3 (1–5 дней — самый быстрый ИЗВЕСТНЫЙ срок среди дублей)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { deliveryOptions: OPTIONS, pickupPoints: [] },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const pvz = section.querySelector('[data-delivery-pvz-kind="PVZ"]')!;
      expect(pvz.getAttribute("data-delivery-tariff-code")).toBe("3");
    });

    it("постамат-группа выбирает Y2 (известные 5 дней побеждают полностью неизвестный срок)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { deliveryOptions: OPTIONS, pickupPoints: [] },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const postamat = section.querySelector(
        '[data-delivery-pvz-kind="POSTAMAT"]',
      )!;
      expect(postamat.getAttribute("data-delivery-tariff-code")).toBe("11");
    });
  });

  describe("buildOptions — редкие поля тарифов", () => {
    it("адрес НЕизвестен — PARTNER-опция молча пропускается (continue), рендерится только OWN", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "own1",
                  name: "OWN без адреса",
                  type: "OWN",
                  price: 100,
                  minDays: 1,
                  maxDays: 2,
                },
                {
                  id: "p1",
                  name: "СДЭК",
                  type: "PARTNER",
                  price: 300,
                  minDays: 1,
                  maxDays: 3,
                  cdekTariffCode: 1,
                  deliveryMode: "door",
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({}); // без cityFiasId → addressKnown=false
      await tick();

      const cards = section.querySelectorAll("[data-delivery-option]");
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute("data-delivery-type")).toBe("custom");
    });

    it('door-тариф без cdekTariffCode и без срока — атрибут кода пуст, meta без "· срок"', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "p1",
                  name: "СДЭК дверь",
                  type: "PARTNER",
                  price: 300,
                  deliveryMode: "door",
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const card = section.querySelector('[data-delivery-type="cdek_door"]')!;
      expect(card.getAttribute("data-delivery-tariff-code")).toBe("");
      const label = card.querySelector("[data-delivery-label]")!;
      // Единственная карточка (без "дешевле всего") — meta идёт СРАЗУ следующим
      // span после лейбла; проверка по структуре, а не по Tailwind-классу.
      const meta = label.nextElementSibling as HTMLElement;
      expect(meta.textContent).toBe("Привезём по вашему адресу"); // без " · срок" суффикса
    });

    it("бесплатная доставка от порога не трогает уже бесплатный самовывоз (priceCents уже 0)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "own1",
                  name: "Платная своя",
                  type: "OWN",
                  price: 200,
                  minDays: 1,
                  maxDays: 2,
                },
              ],
              pickupPoints: [{ id: "pp1", address: "ул Магазинная" }],
            },
          }),
        }),
      );
      const section = mountDom(true); // самовывоз включён
      section.setAttribute("data-free-shipping-threshold", "0"); // порог 0 — бесплатно всегда
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const cards = section.querySelectorAll("[data-delivery-option]");
      cards.forEach((c) =>
        expect(c.getAttribute("data-delivery-price-cents")).toBe("0"),
      );
      // самовывоз (уже 0) — freeShipping флаг на него не нужен, платный OWN — стал 0 через override
      const own = section.querySelector('[data-delivery-type="custom"]')!;
      expect(own.getAttribute("data-delivery-price-cents")).toBe("0");
    });
  });

  describe("pickup-points — HTTP-ошибка и битый JSON", () => {
    function mockPvzTariff() {
      fetchMock.mockImplementation((url: string) => {
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: "PVZ",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    it('HTTP-ошибка (res.ok=false) на /pickup-points — пикер показывает "Не удалось загрузить"', async () => {
      mockPvzTariff();
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({}),
          });
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(
        section.querySelector("[data-cdek-pvz-picker]")!.textContent,
      ).toContain("Не удалось загрузить пункты выдачи");
    });

    it("/pickup-points вернул невалидный JSON (res.json() бросает) — пикер считает точки пустыми, без падения", async () => {
      mockPvzTariff();
      const origImpl = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => {
              throw new Error("invalid json");
            },
          });
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const picker = section.querySelector("[data-cdek-pvz-picker]")!;
      expect(picker.textContent).toContain("Нет доступных пунктов выдачи");
    });

    it("shopId пропал к моменту повторного открытия пикера (retry) — точки считаются пустыми", async () => {
      mockPvzTariff();
      const origImpl = fetchMock.getMockImplementation()!;
      let pointsCall = 0;
      fetchMock.mockImplementation((url: string, opts?: any) => {
        if (/pickup-points/.test(url)) {
          pointsCall += 1;
          if (pointsCall === 1) return Promise.reject(new Error("net"));
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [{ code: "P1", address: "ул А" }],
            }),
          });
        }
        return origImpl(url, opts);
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      (window as any).__MERFY_CONFIG__ = {}; // shopId исчез
      (section.querySelector("[data-pvz-retry]") as HTMLElement).click();
      await tick();

      // fetchPickupPoints увидел !shopId → вернул [] сама, retry-fetch до pickup-points не дошёл
      expect(pointsCall).toBe(1);
      expect(
        section.querySelector("[data-cdek-pvz-picker]")!.textContent,
      ).toContain("Нет доступных пунктов выдачи");
    });
  });

  describe("AbortController недоступен (старое окружение)", () => {
    it("без глобального AbortController — расчёт не падает, запрос уходит без signal", async () => {
      const OriginalAbortController = (global as any).AbortController;
      delete (global as any).AbortController;
      try {
        fetchMock.mockImplementation(() =>
          Promise.resolve({ ok: true, json: async () => OK_OWN() }),
        );
        const section = mountDom();
        runScript(section);
        dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
        await tick();

        const call = fetchMock.mock.calls[0];
        expect((call[1] as RequestInit).signal).toBeUndefined();
      } finally {
        (global as any).AbortController = OriginalAbortController;
      }
    });
  });

  describe("дебаунс адреса — тот же город внутри 400мс схлопывается", () => {
    it("второе уточнение того же города (в течение 400мс) откладывается и не даёт второй пересчёт", async () => {
      // Индекс задан ОБОИМИ диспатчами (непустой) — чтобы recalculate не заходил
      // в ветку resolvePostalFromFiasId (это отдельный async-путь, тестируется
      // своим блоком выше) и таймлайн дебаунса не запутывался лишними await.
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => OK_OWN("С адресом") }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" }); // первый — сразу (новый город)
      await tick();
      fetchMock.mockClear();

      dispatchAddress({ cityFiasId: "fias1", postalCode: "101001" }); // тот же город, уточнение индекса
      await tick();
      expect(fetchMock).not.toHaveBeenCalled(); // отложено, схлопнётся с предыдущим

      await advance(400);
      expect(fetchMock).toHaveBeenCalledTimes(1); // ОДИН отложенный пересчёт, не два
    });
  });

  describe("recalcFromCart — цифровой режим, и запоминание адреса", () => {
    it("cart:updated в цифровом режиме — нейтрализует секцию, не запрашивает логистику", async () => {
      (window as any).__MERFY_CONFIG__ = {
        shopId: "shop1",
        apiUrl: "https://gateway.test/api",
        checkout: { addressRequired: false },
      };
      const section = mountDom();
      runScript(section);
      document.dispatchEvent(new CustomEvent("cart:updated"));
      await advance(400);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(section.hidden).toBe(true);
    });

    it("checkout:address-changed без detail — data-last-fias-id не выставляется (не падает)", () => {
      const section = mountDom();
      runScript(section);
      document.dispatchEvent(new CustomEvent("checkout:address-changed"));
      expect(section.hasAttribute("data-last-fias-id")).toBe(false);
    });
  });

  describe("initialDeliveryRender — нет shopId к моменту safety-net", () => {
    it("safety-net сработал (~1500мс), но shopId так и не появился — recalculate не вызывается", async () => {
      (window as any).__MERFY_CONFIG__ = {}; // нет shopId
      const section = mountDom();
      runScript(section, { keepSafetyNet: true }); // именно ЭТОТ тест проверяет сам safety-net
      await advance(1500);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("клик по списку доставки — редкие цели", () => {
    it("клик мимо карточек (по самому списку) — обработчик тихо игнорирует, событие выбора не переотправляется", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => OK_OWN() }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const listEl = section.querySelector(
        "[data-checkout-delivery-list]",
      ) as HTMLElement;
      let deliveryChangedCount = 0;
      const onChanged = () => {
        deliveryChangedCount += 1;
      };
      document.addEventListener("checkout:delivery-changed", onChanged);
      try {
        listEl.click(); // мимо любой [data-delivery-option] — closest() не находит карточку
        expect(deliveryChangedCount).toBe(0);
      } finally {
        document.removeEventListener("checkout:delivery-changed", onChanged);
      }
    });

    it("карточка без вложенных data-delivery-radio/label/type (искажённая разметка) — клик не падает", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "o1",
                  name: "A",
                  type: "OWN",
                  price: 100,
                  minDays: 1,
                  maxDays: 2,
                },
                {
                  id: "o2",
                  name: "B",
                  type: "OWN",
                  price: 200,
                  minDays: 1,
                  maxDays: 2,
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const cards = Array.from(
        section.querySelectorAll("[data-delivery-option]"),
      );
      // Ломаем разметку ОБЕИХ карточек: снимаем radio/label/type-атрибут.
      cards.forEach((c) => {
        c.querySelector("[data-delivery-radio]")?.remove();
        c.querySelector("[data-delivery-label]")?.remove();
        c.removeAttribute("data-delivery-type");
        c.removeAttribute("data-delivery-price-cents");
      });

      let lastDetail: any = null;
      const onChanged = (e: any) => {
        lastDetail = e.detail;
      };
      document.addEventListener("checkout:delivery-changed", onChanged);
      try {
        (cards[1] as HTMLElement).click(); // клик не падает несмотря на снятые узлы/атрибуты
        expect(lastDetail?.type).toBe(""); // data-delivery-type снят — фолбэк на '', но событие всё равно ушло
      } finally {
        document.removeEventListener("checkout:delivery-changed", onChanged);
      }
    });
  });

  describe("показ ошибки/пустого состояния — разметка без соседних блоков", () => {
    function mountMinimalDom(pickupEnabled = false): HTMLElement {
      document.body.innerHTML = `
        <section data-checkout-delivery-method data-puck-component-id="cdm-1"
                 data-cdek-enabled="true" data-pickup-enabled="${pickupEnabled ? "true" : "false"}" data-pickup-label="Самовывоз"
                 data-cdek-door-label="Курьер" data-cdek-pvz-label="ПВЗ" data-cdek-postamat-label="Постамат" data-free-shipping-threshold="">
          <div data-checkout-delivery-list hidden></div>
        </section>`;
      return document.querySelector(
        "[data-checkout-delivery-method]",
      ) as HTMLElement;
    }

    it("нет соседних empty/loading/error блоков — showEmpty/showError не падают (guard на отсутствующий элемент), fetch не вызывается без shopId", async () => {
      const section = mountMinimalDom();
      (window as any).__MERFY_CONFIG__ = {}; // нет shopId → showEmpty('Магазин не определён')
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1" });
      await tick();

      expect(fetchMock).not.toHaveBeenCalled(); // ранний выход на guard'ах, до утильных блоков
    });
  });

  describe("syncPicker/openPickerFor без [data-cdek-pvz-picker] в разметке", () => {
    it("PARTNER pickup-тариф без пикера в DOM — syncPicker не падает (pickerEl=null)", async () => {
      document.body.innerHTML = `
        <section data-checkout-delivery-method data-puck-component-id="cdm-1"
                 data-cdek-enabled="true" data-pickup-enabled="false" data-pickup-label="Самовывоз"
                 data-cdek-door-label="Курьер" data-cdek-pvz-label="ПВЗ" data-cdek-postamat-label="Постамат" data-free-shipping-threshold="">
          <div data-checkout-delivery-empty></div>
          <div data-checkout-delivery-loading hidden></div>
          <div data-checkout-delivery-error hidden></div>
          <div data-checkout-delivery-list hidden></div>
        </section>`; // ни одного [data-cdek-pvz-picker]
      const section = document.querySelector(
        "[data-checkout-delivery-method]",
      ) as HTMLElement;
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "o1",
                  name: "ПВЗ",
                  type: "PARTNER",
                  price: 300,
                  minDays: 1,
                  maxDays: 3,
                  cdekTariffCode: 1,
                  deliveryMode: "pickup",
                  pickupPointKind: "PVZ",
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(
        section.querySelector('[data-delivery-type="cdek_pickup"]'),
      ).not.toBeNull();
    });
  });

  describe("openPickerFor — кэш точек и пустой fias", () => {
    it("повторное открытие пикера для ТОГО ЖЕ города берёт точки из кэша (без нового fetch)", async () => {
      const origMock = jest.fn((url: string) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [{ code: "P1", address: "ул А", type: "PVZ" }],
            }),
          });
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: "PVZ",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      fetchMock.mockImplementation(origMock);
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      const pointsCallsBefore = fetchMock.mock.calls.filter((c) =>
        /pickup-points/.test(String(c[0])),
      ).length;
      expect(pointsCallsBefore).toBe(1);

      // Повторный пересчёт по ТОМУ ЖЕ адресу (cart:updated) → снова рисует cdek_pickup
      // и снова открывает пикер для того же fias — должен взять из pvzCache.
      document.dispatchEvent(new CustomEvent("cart:updated"));
      await advance(400);

      const pointsCallsAfter = fetchMock.mock.calls.filter((c) =>
        /pickup-points/.test(String(c[0])),
      ).length;
      expect(pointsCallsAfter).toBe(1); // кэш — нового HTTP-запроса нет
      expect(section.querySelector("[data-pvz-row]")).not.toBeNull(); // но точки всё равно отрисованы
    });

    it("data-last-fias-id отсутствует в момент открытия пикера — openPickerFor получает пустой fias", async () => {
      // Синтетика: снимаем атрибут СРАЗУ после диспатча (слушатель "запомнить адрес"
      // уже отработал синхронно в момент dispatchEvent), но ДО того как асинхронный
      // recalculate дойдёт до syncPicker/openPickerFor — эмулирует гонку, при которой
      // openPickerFor(section.getAttribute(...)||'') получает '' вместо fias.
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [
                {
                  id: "o1",
                  name: "ПВЗ",
                  type: "PARTNER",
                  price: 300,
                  minDays: 1,
                  maxDays: 3,
                  cdekTariffCode: 1,
                  deliveryMode: "pickup",
                  pickupPointKind: "PVZ",
                },
              ],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      section.removeAttribute("data-last-fias-id");
      await tick();

      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;
      expect(picker.hidden).toBe(false); // пикер всё равно раскрыт (тип карточки cdek_pickup)
      expect(picker.querySelector("[data-pvz-row]")).toBeNull(); // но точек нет — fias пуст
    });
  });

  describe("поиск по name/code (адрес отсутствует)", () => {
    it("точка без address, найденная по name; точка без name/address, найденная по code", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [
                { code: "C1", name: "Центральный пункт", type: "PVZ" },
                { code: "XYZ99", type: "PVZ" },
                // Совсем без address/name/code — при ЛЮБОМ поиске фильтр проверяет
                // и её тоже: все три фолбэка (||'') реально используются (иначе
                // String(undefined) упал бы раньше индексации).
                { type: "PVZ" },
              ],
            }),
          });
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: "PVZ",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const search = section.querySelector(
        "[data-pvz-search]",
      ) as HTMLInputElement;

      search.value = "центральный";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(section.querySelectorAll("[data-pvz-row]").length).toBe(1);
      expect(
        section.querySelector("[data-pvz-row]")!.getAttribute("data-pvz-code"),
      ).toBe("C1");

      search.value = "xyz99";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(section.querySelectorAll("[data-pvz-row]").length).toBe(1);
      expect(
        section.querySelector("[data-pvz-row]")!.getAttribute("data-pvz-code"),
      ).toBe("XYZ99");

      // Очистка поиска (пустое значение) — снова показываются все три точки.
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(section.querySelectorAll("[data-pvz-row]").length).toBe(3);
    });
  });

  describe("сортировка точек разных типов (без фильтра по kind)", () => {
    it("без kind у тарифа — ПВЗ и постаматы сортируются вперемешку по типу, затем по адресу", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: [
                { code: "PST-B", address: "ул Я", type: "POSTAMAT" },
                { code: "PVZ-B", address: "ул Б", type: "PVZ" },
                { code: "PST-A", address: "ул А", type: "POSTAMAT" },
                { code: "PVZ-A", address: "ул Ба", type: "PVZ" },
              ],
            }),
          });
        if (/delivery\/calculate/.test(url))
          // pickupPointKind НЕ задан вовсе (старый бэк) — kindFilteredPoints не фильтрует.
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ/постамат",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      const section = mountDom();
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const rows = Array.from(section.querySelectorAll("[data-pvz-row]"));
      expect(rows.length).toBe(4);
      // ПВЗ идут раньше постаматов (тип), внутри типа — по адресу (localeCompare).
      // 'ул Б' короче и лексикографически предшествует 'ул Ба' (общий префикс) — так что PVZ-B раньше PVZ-A.
      expect(rows.map((r) => r.getAttribute("data-pvz-code"))).toEqual([
        "PVZ-B",
        "PVZ-A",
        "PST-A",
        "PST-B",
      ]);
    });
  });

  describe("самовывоз магазина — несколько точек (city/address/точка N, id, meta)", () => {
    it("несколько точек самовывоза: подпись городом/адресом/номером, id и meta с фолбэками", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [],
              pickupPoints: [
                { id: "pp1", city: "Москва" }, // есть city → используем его; meta без address → фолбэк
                { address: "ул. Ленина, 5" }, // нет city, нет id → используем address; meta = address
                null, // пропускается (!pp → continue)
                {}, // нет ни city, ни address, ни id → "точка 4"
              ],
            },
          }),
        }),
      );
      const section = mountDom(true); // самовывоз включён
      runScript(section);
      dispatchAddress({});
      await tick();

      const cards = Array.from(
        section.querySelectorAll('[data-delivery-type="self_pickup"]'),
      );
      expect(cards.length).toBe(3); // null пропущен

      const labels = cards.map(
        (c) => c.querySelector("[data-delivery-label]")!.textContent,
      );
      expect(labels[0]).toBe("Самовывоз — Москва");
      expect(labels[1]).toBe("Самовывоз — ул. Ленина, 5");
      expect(labels[2]).toBe("Самовывоз — точка 4");

      expect(cards[0].getAttribute("data-delivery-pickup-id")).toBe("pp1");
      expect(cards[1].getAttribute("data-delivery-pickup-id")).toBe(""); // нет id → фолбэк null → атрибут пуст

      // meta — следующий span сразу после лейбла (нет "дешевле всего" у этих
      // карточек — все три бесплатны); проверка по структуре, не по Tailwind-классу.
      const metas = cards.map(
        (c) =>
          (
            c.querySelector("[data-delivery-label]")!
              .nextElementSibling as HTMLElement
          ).textContent,
      );
      expect(metas[0]).toBe("Заберите из нашего магазина"); // нет address → фолбэк
      expect(metas[1]).toBe("ул. Ленина, 5"); // есть address
    });
  });

  describe("render() — cdekError на финальном рендере (когда сырые points>0, но buildOptions даёт 0 карточек)", () => {
    it("pickupEnabled=false игнорирует пришедшие pickupPoints — 0 карточек, показывается cdekError", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [],
              pickupPoints: [{ id: "pp1", address: "ул А" }], // раз points>0 — retry-цикл не пойдёт дальше
              cdekError: "СДЭК недоступен",
            },
          }),
        }),
      );
      const section = mountDom(false); // самовывоз ВЫКЛЮЧЕН — pickupPoints будут проигнорированы
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      expect(fetchMock).toHaveBeenCalledTimes(1); // без ретраев — render() вызван сразу (points>0 сырых)
      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toBe("СДЭК недоступен");
    });
  });

  describe("meta пустая строка на карточке (нет описания и нет срока)", () => {
    it("OWN-тариф без description и без minDays/maxDays — meta не рендерится вовсе", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [{ id: "o1", name: "Пустая мета", type: "OWN" }],
              pickupPoints: [],
            },
          }),
        }),
      );
      const section = mountDom();
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();

      const card = section.querySelector("[data-delivery-option]")!;
      const label = card.querySelector("[data-delivery-label]")!;
      expect(label.nextElementSibling).toBeNull(); // opt.meta falsy и не "дешевле всего" → после лейбла ничего нет
    });
  });

  describe("recalculate — ответ без поля data вовсе (не просто пустые массивы)", () => {
    it("success:true без data — buildOptions получает {} через фолбэк, показывает пустое/ошибку по месту", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ ok: true, json: async () => ({ success: true }) }),
      );
      const section = mountDom(false);
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      await advance(2000);
      await advance(5000);
      await advance(10000);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const errorEl = section.querySelector(
        "[data-checkout-delivery-error]",
      ) as HTMLElement;
      expect(errorEl.hidden).toBe(false);
      expect(errorEl.textContent).toBe(
        "Нет доступных вариантов доставки для этого адреса",
      );
    });
  });

  describe("showError без соседнего [data-checkout-delivery-error] в разметке", () => {
    it("нет error-блока рядом — showError не падает (guard на отсутствующий элемент)", async () => {
      document.body.innerHTML = `
        <section data-checkout-delivery-method data-puck-component-id="cdm-1"
                 data-cdek-enabled="true" data-pickup-enabled="false" data-pickup-label="Самовывоз"
                 data-cdek-door-label="Курьер" data-cdek-pvz-label="ПВЗ" data-cdek-postamat-label="Постамат" data-free-shipping-threshold="">
          <div data-checkout-delivery-empty></div>
          <div data-checkout-delivery-loading hidden></div>
          <div data-checkout-delivery-list hidden></div>
        </section>`; // нет [data-checkout-delivery-error]
      const section = document.querySelector(
        "[data-checkout-delivery-method]",
      ) as HTMLElement;
      // cdekError + addressKnown + 0 опций/точек — фатальная ошибка СРАЗУ на первой
      // попытке (без ретраев), так showError долетает быстро и детерминированно.
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              deliveryOptions: [],
              pickupPoints: [],
              cdekError: "СДЭК недоступен",
            },
          }),
        }),
      );
      runScript(section);
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      expect(fetchMock).toHaveBeenCalledTimes(1); // без ретраев
    });
  });

  describe("ПВЗ-пикер — прямые манипуляции с делегированными обработчиками", () => {
    async function openPvzPicker(
      section: HTMLElement,
      fetchMockLocal: jest.Mock,
      points: any[],
    ) {
      fetchMockLocal.mockImplementation((url: string) => {
        if (/pickup-points/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: points }),
          });
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: "PVZ",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
    }

    it("[data-pvz-list] удалён из пикера ПОСЛЕ раскрытия — ввод в поиск не падает (guard !listC)", async () => {
      const section = mountDom();
      await openPvzPicker(section, fetchMock, [
        { code: "P1", address: "ул А", type: "PVZ" },
      ]);
      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;
      picker.querySelector("[data-pvz-list]")!.remove(); // искусственно ломаем разметку пикера
      const search = picker.querySelector(
        "[data-pvz-search]",
      ) as HTMLInputElement;

      search.value = "что угодно";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(picker.querySelector("[data-pvz-list]")).toBeNull(); // подтверждаем, что список действительно отсутствовал — guard был нужен
    });

    it("точка списка без data-pvz-code/data-pvz-address — клик по ней не падает и переотправляет событие с pickupPointCode=null (фолбэк на null)", async () => {
      const section = mountDom();
      let lastDetail: any = null;
      const onChanged = (e: any) => {
        lastDetail = e.detail;
      };
      document.addEventListener("checkout:delivery-changed", onChanged);
      try {
        await openPvzPicker(section, fetchMock, [{ type: "PVZ" }]); // нет code/address
        const row = section.querySelector("[data-pvz-row]") as HTMLElement;
        // esc(undefined) → '' — атрибут рисуется, но пустой (не отсутствует вовсе).
        expect(row.getAttribute("data-pvz-code")).toBe("");

        row.click();
        expect(lastDetail.pickupPointCode).toBeNull(); // фолбэк на null, событие всё равно ушло
      } finally {
        document.removeEventListener("checkout:delivery-changed", onChanged);
      }
    });

    it('клик внутри пикера мимо строки и кнопки "Повторить" — обработчик тихо игнорирует, точка не выбирается', async () => {
      const section = mountDom();
      await openPvzPicker(section, fetchMock, [
        { code: "P1", address: "ул А", type: "PVZ" },
      ]);
      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;
      let changedCount = 0;
      const onChanged = () => {
        changedCount += 1;
      };
      document.addEventListener("checkout:delivery-changed", onChanged);
      try {
        picker.click(); // клик по контейнеру, не по строке/кнопке
        expect(changedCount).toBe(0); // ни retry, ни выбор точки не сработали
      } finally {
        document.removeEventListener("checkout:delivery-changed", onChanged);
      }
    });

    it("input-событие внутри пикера не на поле поиска — обработчик тихо игнорирует (guard !s)", async () => {
      const section = mountDom();
      await openPvzPicker(section, fetchMock, [
        { code: "P1", address: "ул А", type: "PVZ" },
      ]);
      const picker = section.querySelector(
        "[data-cdek-pvz-picker]",
      ) as HTMLElement;

      picker.dispatchEvent(new Event("input", { bubbles: true }));
      // список точек не сброшен посторонним input-событием
      expect(section.querySelectorAll("[data-pvz-row]").length).toBe(1);
    });

    it('точка без code, найденная поиском по name — фолбэк p.code||"" не роняет фильтр', async () => {
      const section = mountDom();
      await openPvzPicker(section, fetchMock, [
        { name: "Уникальное имя", type: "PVZ" },
      ]); // нет code
      const search = section.querySelector(
        "[data-pvz-search]",
      ) as HTMLInputElement;
      search.value = "уникальное";
      search.dispatchEvent(new Event("input", { bubbles: true }));

      expect(section.querySelectorAll("[data-pvz-row]").length).toBe(1);
    });

    it('retry без сохранённого data-last-fias-id — открывает пикер с пустым fias (фолбэк ""), без падения', async () => {
      const section = mountDom();
      // Первая попытка — сетевая ошибка, чтобы получить кнопку "Повторить".
      let callN = 0;
      fetchMock.mockImplementation((url: string) => {
        if (/pickup-points/.test(url)) {
          callN += 1;
          return Promise.reject(new Error("net"));
        }
        if (/delivery\/calculate/.test(url))
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                deliveryOptions: [
                  {
                    id: "o1",
                    name: "ПВЗ",
                    type: "PARTNER",
                    price: 300,
                    minDays: 1,
                    maxDays: 3,
                    cdekTariffCode: 1,
                    deliveryMode: "pickup",
                    pickupPointKind: "PVZ",
                  },
                ],
                pickupPoints: [],
              },
            }),
          });
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      runScript(section);
      section.setAttribute("data-last-fias-id", "fias1");
      dispatchAddress({ cityFiasId: "fias1", postalCode: "101000" });
      await tick();
      expect(callN).toBe(1);

      // Атрибут "потерялся" к моменту клика на "Повторить" (например, форма адреса
      // была пересобрана) — retry-обработчик берёт fias через фолбэк "".
      section.removeAttribute("data-last-fias-id");
      const retryBtn = section.querySelector("[data-pvz-retry]") as HTMLElement;
      retryBtn.click();
      await tick();

      // fias='' → openPickerFor берёт ветку "нет города" (пустой список), сети не касается.
      expect(callN).toBe(1);
      expect(
        section.querySelector("[data-cdek-pvz-picker]")!.textContent,
      ).toContain("Нет доступных пунктов выдачи");
    });
  });
});
