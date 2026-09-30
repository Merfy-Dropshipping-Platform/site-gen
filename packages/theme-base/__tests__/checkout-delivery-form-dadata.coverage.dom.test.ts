/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryForm — первый инлайн-скрипт (initCheckoutDelivery): страна,
 * DaData автокомплит город/адрес, отслеживание полей адреса (dispatch
 * checkout:address-changed). Цель — 100% покрытия этого скрипта; второй скрипт
 * (рантайм-конфиг) покрыт в checkout-delivery-config.dom.test.ts.
 * Скрипт исполняется через astroInlineRunners (индекс [0] — первый <script>
 * файла), покрытие пишется под путём CheckoutDeliveryForm.astro.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutDeliveryForm",
  "CheckoutDeliveryForm.astro",
);

function mountDom(
  opts: { country?: boolean; cityPrefill?: string } = {},
): HTMLElement {
  document.body.innerHTML = `
    <section data-checkout-delivery data-puck-component-id="cdf-1">
      <div class="fields">
        ${
          opts.country !== false
            ? `<div class="field" data-checkout-field="country" data-checkout-address
                    data-country-default="Российская Федерация" data-country-selectable="true">
                 <input id="checkout-country" name="country" type="text" value="Российская Федерация" data-country-input />
                 <span data-country-chevron></span>
                 <ul data-country-list hidden></ul>
               </div>`
            : ""
        }
        <div class="field" data-checkout-field="firstName"><input id="checkout-firstName" /></div>
        <div class="field" data-checkout-field="lastName"><input id="checkout-lastName" /></div>
        <div class="field" data-checkout-field="city" data-checkout-address data-dadata="true">
          <input id="checkout-city" name="city" type="text" value="${opts.cityPrefill ?? ""}" data-checkout-dadata-input="city" />
          <ul data-checkout-dadata-list="city" hidden></ul>
        </div>
        <div class="row" data-checkout-address>
          <div class="field" data-checkout-field="address" data-dadata="true">
            <input id="checkout-address" name="address" type="text" data-checkout-dadata-input="address" />
            <ul data-checkout-dadata-list="address" hidden></ul>
          </div>
          <div class="field" data-checkout-field="postalCode" data-autofill="true">
            <input id="checkout-postal" name="postalCode" type="text" />
          </div>
        </div>
      </div>
    </section>`;
  return document.querySelector("[data-checkout-delivery]") as HTMLElement;
}

function runInitScript(section: HTMLElement | null) {
  (window as any).__merfyRoot = () => section;
  astroInlineRunners(ASTRO)[0].run({ blockId: "cdf-1" });
}

/** Несколько `await Promise.resolve()` — прогнать цепочку микрозадач fetch→json→... */
async function tick(times = 6) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

function setDadataToken(token: string | null) {
  if (token) (window as any).__DADATA_TOKEN__ = token;
  else delete (window as any).__DADATA_TOKEN__;
}

const CITY_SUGGEST = {
  suggestions: [
    {
      value: "Москва",
      data: { city_fias_id: "fias-msk", postal_code: "101000" },
    },
  ],
};

describe("CheckoutDeliveryForm — DaData init script", () => {
  let fetchMock: jest.Mock;
  let addressChangedEvents: any[];
  let onAddressChanged: (e: Event) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    addressChangedEvents = [];
    onAddressChanged = (e: any) => addressChangedEvents.push(e.detail);
    document.addEventListener("checkout:address-changed", onAddressChanged);
    fetchMock = jest.fn(() =>
      Promise.resolve({ json: async () => ({ suggestions: [] }) }),
    );
    (window as any).fetch = fetchMock;
    setDadataToken("dadata-token");
  });

  afterEach(() => {
    document.removeEventListener("checkout:address-changed", onAddressChanged);
    jest.clearAllTimers();
    jest.useRealTimers();
    delete (window as any).fetch;
    delete (window as any).__merfyRoot;
    delete (window as any).__MERFY_CONFIG__;
    delete (window as any).__DADATA_TOKEN__;
  });

  describe("инициализация", () => {
    it("без корня (нет секции) — тихо ничего не делает", () => {
      expect(() => runInitScript(null)).not.toThrow();
    });

    it("повторный запуск на той же секции не навешивает обработчики повторно (guard __merfyDeliveryInit)", async () => {
      const section = mountDom();
      runInitScript(section);
      runInitScript(section); // astro:page-load мог бы вызвать init снова

      const cityInput = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      cityInput.value = "Моск";
      cityInput.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      // Один listener → один fetch к DaData, а не два.
      const suggestCalls = fetchMock.mock.calls.filter((c) =>
        /suggest\/address/.test(String(c[0])),
      );
      expect(suggestCalls.length).toBe(1);
    });

    it('document.readyState="loading" — initCheckoutDelivery навешивается на DOMContentLoaded; повторный вызов оттуда не задваивает DaData-обработчики', async () => {
      // readyState — геттер прототипа Document в jsdom, а не собственное свойство
      // document: getOwnPropertyDescriptor(document,'readyState') вернёт undefined, и
      // наивное "if(original) restore" ничего не восстановит — readyState останется
      // 'loading' для всех тестов ПОСЛЕ этого в файле. Восстанавливаем всегда: если
      // своего дескриптора не было — удаляем override, возвращая геттер прототипа.
      const original = Object.getOwnPropertyDescriptor(document, "readyState");
      Object.defineProperty(document, "readyState", {
        value: "loading",
        configurable: true,
      });
      try {
        const section = mountDom();
        runInitScript(section);
        // Сам вызов initCheckoutDelivery() в конце скрипта выполняется безусловно,
        // несмотря на readyState — секция уже помечена ДО события.
        expect((section as any).__merfyDeliveryInit).toBe(true);

        // Ветка, которую этот тест обязан проверить: readyState='loading' → скрипт
        // САМ регистрирует initCheckoutDelivery на DOMContentLoaded. Диспатч не
        // должен задвоить DaData-обработчики (guard __merfyDeliveryInit).
        document.dispatchEvent(new Event("DOMContentLoaded"));
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "Москва";
        city.dispatchEvent(new Event("input", { bubbles: true }));
        jest.advanceTimersByTime(250);
        await tick();

        const suggestCalls = fetchMock.mock.calls.filter((c) =>
          /suggest\/address/.test(String(c[0])),
        );
        expect(suggestCalls.length).toBe(1); // один listener, а не два
      } finally {
        if (original) Object.defineProperty(document, "readyState", original);
        else delete (document as any).readyState;
      }
    });
  });

  describe("отслеживание полей адреса (dispatchAddressChange)", () => {
    it('change на "Индекс" диспатчит checkout:address-changed с cityFiasId+postalCode', () => {
      const section = mountDom();
      runInitScript(section);
      section.setAttribute("data-selected-city-fias-id", "fias-1");
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      postal.value = "101000";
      postal.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);

      expect(addressChangedEvents.at(-1)).toEqual({
        cityFiasId: "fias-1",
        postalCode: "101000",
        city: null,
        region: null,
        lat: null,
        lon: null,
      });
    });

    it('blur на "Город" тоже диспатчит (debounce схлопывает несколько вызовов подряд)', () => {
      const section = mountDom();
      runInitScript(section);
      section.setAttribute("data-selected-city-fias-id", "fias-1");
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.dispatchEvent(new Event("blur", { bubbles: true }));
      city.dispatchEvent(new Event("blur", { bubbles: true })); // повторный blur — схлопнётся в один таймер
      jest.advanceTimersByTime(400);

      expect(addressChangedEvents.length).toBe(1);
    });

    it("без сохранённого fiasId, но с текстом города ≥3 символов — резолвит через DaData (last-resort)", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (/suggest\/address/.test(url))
          return Promise.resolve({ json: async () => CITY_SUGGEST });
        return Promise.resolve({ json: async () => ({}) });
      });
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Москва";
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      postal.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);
      await tick();

      expect(section.getAttribute("data-selected-city-fias-id")).toBe(
        "fias-msk",
      );
      expect(addressChangedEvents.at(-1).cityFiasId).toBe("fias-msk");
    });

    it("last-resort резолв молчит без токена (fiasId остаётся пустым)", async () => {
      setDadataToken(null);
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Москва";
      city.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);
      await tick();

      expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
      expect(addressChangedEvents.at(-1).cityFiasId).toBe("");
    });

    it("last-resort резолв — сетевая ошибка молча игнорируется (postalCode всё равно уходит)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.reject(new Error("network down")),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Москва";
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      postal.value = "101000";
      city.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);
      await tick();

      expect(addressChangedEvents.at(-1)).toEqual({
        cityFiasId: "",
        postalCode: "101000",
        city: null,
        region: null,
        lat: null,
        lon: null,
      });
    });

    it("город короче 3 символов — last-resort резолв не запускается", () => {
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Мо";
      city.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);

      const suggestCalls = fetchMock.mock.calls.filter((c) =>
        /suggest\/address/.test(String(c[0])),
      );
      expect(suggestCalls.length).toBe(0);
      expect(addressChangedEvents.at(-1).cityFiasId).toBe("");
    });

    it('без поля "Индекс" в DOM — postalCode в событии пустая строка', () => {
      const section = mountDom();
      section.querySelector('[data-checkout-field="postalCode"]')!.remove();
      runInitScript(section);
      section.setAttribute("data-selected-city-fias-id", "fias-1");
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.dispatchEvent(new Event("blur", { bubbles: true }));
      jest.advanceTimersByTime(400);

      expect(addressChangedEvents.at(-1)).toEqual({
        cityFiasId: "fias-1",
        postalCode: "",
        city: null,
        region: null,
        lat: null,
        lon: null,
      });
    });
  });

  describe("страна", () => {
    it("список стран рисуется (20 пунктов), открывается по фокусу и клику", () => {
      const section = mountDom();
      runInitScript(section);
      const input = section.querySelector(
        "[data-country-input]",
      ) as HTMLInputElement;
      const list = section.querySelector("[data-country-list]") as HTMLElement;
      expect(list.querySelectorAll("li").length).toBe(20);
      expect(list.hidden).toBe(true);

      input.dispatchEvent(new Event("focus"));
      expect(list.hidden).toBe(false);
      const chevron = section.querySelector(
        "[data-country-chevron]",
      ) as HTMLElement;
      expect(chevron.style.transform).toContain("rotate(180deg)");

      list.hidden = true;
      input.dispatchEvent(new Event("click"));
      expect(list.hidden).toBe(false);
    });

    it("выбор страны — value + input-событие + список закрывается", () => {
      const section = mountDom();
      runInitScript(section);
      const input = section.querySelector(
        "[data-country-input]",
      ) as HTMLInputElement;
      const list = section.querySelector("[data-country-list]") as HTMLElement;
      input.dispatchEvent(new Event("focus"));

      let inputEventFired = false;
      input.addEventListener("input", () => (inputEventFired = true));
      const li = list.querySelector(
        '[data-country-value="Беларусь"]',
      ) as HTMLElement;
      li.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );

      expect(input.value).toBe("Беларусь");
      expect(inputEventFired).toBe(true);
      expect(list.hidden).toBe(true);
      expect(
        (section.querySelector("[data-country-chevron]") as HTMLElement).style
          .transform,
      ).toBe("");
    });

    it("клик вне поля страны закрывает список", () => {
      const section = mountDom();
      runInitScript(section);
      const input = section.querySelector(
        "[data-country-input]",
      ) as HTMLInputElement;
      const list = section.querySelector("[data-country-list]") as HTMLElement;
      input.dispatchEvent(new Event("focus"));
      expect(list.hidden).toBe(false);

      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(list.hidden).toBe(true);
    });

    it("клик по mousedown вне <li> (например, по самому списку) не выбирает страну", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector("[data-country-list]") as HTMLElement;
      const before = (
        section.querySelector("[data-country-input]") as HTMLInputElement
      ).value;
      list.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      expect(
        (section.querySelector("[data-country-input]") as HTMLInputElement)
          .value,
      ).toBe(before);
    });

    it('data-country-selectable="false" — переключатель страны не инициализируется (нет дропдауна)', () => {
      const section = mountDom({ country: false });
      expect(() => runInitScript(section)).not.toThrow();
      expect(section.querySelector("[data-country-list]")).toBeNull();
    });
  });

  describe("DaData подсказки — общее поведение (город и адрес)", () => {
    it("без токена — список скрыт, fetch не вызывается", () => {
      setDadataToken(null);
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "Моск";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);

      expect(list.hidden).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("запрос короче 2 символов — список скрыт, fetch не вызывается", () => {
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "М";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);

      expect(list.hidden).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("одинаковый текст дважды подряд не шлёт повторный fetch (lastQuery dedup)", () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => CITY_SUGGEST }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Москва";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      city.dispatchEvent(new Event("input", { bubbles: true })); // то же значение — no-op
      jest.advanceTimersByTime(250);

      expect(fetchMock.mock.calls.length).toBe(1);
    });

    it("пустой ответ suggestions — список скрывается и очищается", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({ suggestions: [] }) }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "Зачаточное Село";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.hidden).toBe(true);
      expect(list.innerHTML).toBe("");
    });

    it("сетевая ошибка при поиске подсказок — список скрывается (catch)", async () => {
      fetchMock.mockImplementation(() => Promise.reject(new Error("boom")));
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "Москва";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.hidden).toBe(true);
    });

    it("подсказка совпадающая с текущим значением поля отфильтровывается (progressive disclosure)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({ suggestions: [{ value: "Москва", data: {} }] }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "Москва"; // совпадает с value подсказки → после фильтра пусто
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.hidden).toBe(true);
      expect(list.innerHTML).toBe("");
    });

    it("фокус на непустом поле с уже отрисованными пунктами — список открывается заново", () => {
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.innerHTML = "<li>Москва</li>";
      list.hidden = true;
      city.value = "Мо";
      city.dispatchEvent(new Event("focus"));
      expect(list.hidden).toBe(false);
    });

    it("фокус на коротком значении не открывает список", () => {
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.innerHTML = "<li>Москва</li>";
      list.hidden = true;
      city.value = "М";
      city.dispatchEvent(new Event("focus"));
      expect(list.hidden).toBe(true);
    });

    it("клик вне поля закрывает список подсказок", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.hidden = false;
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(list.hidden).toBe(true);
    });

    it("без поля/списка в DOM — setupDadata тихо ничего не делает для отсутствующего поля, city продолжает работать", () => {
      const section = mountDom();
      section.querySelector('[data-checkout-field="address"]')!.remove();
      runInitScript(section);

      // Отсутствие поля "адрес" не должно ронять инициализацию city — фокус на
      // непустом поле с уже отрисованными пунктами должен открыть список как обычно.
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const cityList = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      cityList.innerHTML = "<li>Москва</li>";
      cityList.hidden = true;
      city.value = "Мо";
      city.dispatchEvent(new Event("focus"));
      expect(cityList.hidden).toBe(false);
    });
  });

  describe("DaData город — специфика", () => {
    it("тело запроса ограничивает city..settlement", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => CITY_SUGGEST }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Москва";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      const call = fetchMock.mock.calls.find((c) =>
        /suggest\/address/.test(String(c[0])),
      )!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.from_bound).toEqual({ value: "city" });
      expect(body.to_bound).toEqual({ value: "settlement" });
    });

    it("выбор подсказки — ставит fiasId, закрывает список, диспатчит адрес", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="Москва" data-postal="101000" data-fias-id="fias-msk"></li>';
      const li = list.querySelector("li") as HTMLElement;
      li.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      jest.advanceTimersByTime(400);

      const cityInput = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      expect(cityInput.value).toBe("Москва");
      expect(section.getAttribute("data-selected-city-fias-id")).toBe(
        "fias-msk",
      );
      expect(list.hidden).toBe(true);
      // Postal НЕ автозаполняется из города (комментарий в коде) — индекс остаётся пустым.
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      expect(postal.value).toBe("");
      expect(addressChangedEvents.at(-1).cityFiasId).toBe("fias-msk");
    });

    it("выбор подсказки без fias-id — атрибут удаляется (город без ФИАС)", () => {
      const section = mountDom();
      section.setAttribute("data-selected-city-fias-id", "stale");
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.innerHTML = '<li data-suggest-value="Далёкое село"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );

      expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
    });

    it("клик по mousedown без data-suggest-value (мимо строки) не выбирает город", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.innerHTML = '<li data-suggest-value="Москва"></li>';
      list.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      expect(
        (
          section.querySelector(
            '[data-checkout-dadata-input="city"]',
          ) as HTMLInputElement
        ).value,
      ).toBe("");
    });

    it("ручной ввод города очищает сохранённый fias и индекс прежнего города", () => {
      const section = mountDom();
      runInitScript(section);
      section.setAttribute("data-selected-city-fias-id", "fias-old");
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      postal.value = "101000";
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Новый Город";
      city.dispatchEvent(new Event("input", { bubbles: true }));

      expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
      expect(postal.value).toBe("");
    });

    it("ручной ввод города с пустым индексом не трогает поле (postalEl.value falsy branch)", () => {
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Го";
      expect(() =>
        city.dispatchEvent(new Event("input", { bubbles: true })),
      ).not.toThrow();
    });

    describe("resolveCityIfMissing (blur/начальный проб)", () => {
      it("fiasId уже сохранён — повторный ресолв не запускается на blur", () => {
        const section = mountDom();
        runInitScript(section);
        section.setAttribute("data-selected-city-fias-id", "fias-1");
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "Москва";
        city.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(150);

        const suggestCalls = fetchMock.mock.calls.filter((c) =>
          /suggest\/address/.test(String(c[0])),
        );
        expect(suggestCalls.length).toBe(0);
      });

      it("короткий текст (<3 симв.) — ресолв не запускается на blur", () => {
        const section = mountDom();
        runInitScript(section);
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "Мо";
        city.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(150);

        const suggestCalls = fetchMock.mock.calls.filter((c) =>
          /suggest\/address/.test(String(c[0])),
        );
        expect(suggestCalls.length).toBe(0);
      });

      it("без токена — ресолв не запускается на blur", () => {
        setDadataToken(null);
        const section = mountDom();
        runInitScript(section);
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "Москва";
        city.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(150);

        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("успешный ресолв на blur — сохраняет fias и обновляет value, если DaData вернул другое написание", async () => {
        fetchMock.mockImplementation(() =>
          Promise.resolve({
            json: async () => ({
              suggestions: [
                { value: "Москва", data: { city_fias_id: "fias-msk" } },
              ],
            }),
          }),
        );
        const section = mountDom();
        runInitScript(section);
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "москва";
        city.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(150);
        await tick();

        expect(section.getAttribute("data-selected-city-fias-id")).toBe(
          "fias-msk",
        );
        expect(city.value).toBe("Москва");
      });

      it("ресолв на blur — сетевая ошибка молча проглатывается", async () => {
        fetchMock.mockImplementation(() => Promise.reject(new Error("net")));
        const section = mountDom();
        runInitScript(section);
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "Москва";
        city.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(150);
        await tick();

        expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
      });

      it("DaData вернул пустой suggestions (без fiasId) — resolveCityIfMissing тихо завершается", async () => {
        fetchMock.mockImplementation(() =>
          Promise.resolve({ json: async () => ({ suggestions: [] }) }),
        );
        const section = mountDom();
        runInitScript(section);
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        city.value = "Москва";
        city.dispatchEvent(new Event("blur"));
        jest.advanceTimersByTime(150);
        await tick();

        expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
      });

      it('resolveCityIfMissing для поля "адрес" — no-op (kind !== city)', () => {
        const section = mountDom();
        runInitScript(section);
        const address = section.querySelector(
          '[data-checkout-dadata-input="address"]',
        ) as HTMLInputElement;
        address.value = "Тверская";
        expect(() => address.dispatchEvent(new Event("blur"))).not.toThrow();
        jest.advanceTimersByTime(150);
        // адресный blur не пишет data-selected-city-fias-id (это прерогатива city)
        expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
      });

      it("начальный проб: непустой город с уже сохранённым fias — сразу диспатчит адрес", () => {
        const section = mountDom({ cityPrefill: "Москва" });
        section.setAttribute("data-selected-city-fias-id", "fias-msk");
        runInitScript(section);
        // 50мс — сама проба вызывает dispatchAddressChange(), которая ставит СВОЙ
        // debounce-таймер на 400мс — событие уходит только после него.
        jest.advanceTimersByTime(50 + 400);

        expect(addressChangedEvents.at(-1)?.cityFiasId).toBe("fias-msk");
      });

      it("начальный проб: непустой город без fias — запускает resolveCityIfMissing", async () => {
        fetchMock.mockImplementation(() =>
          Promise.resolve({ json: async () => CITY_SUGGEST }),
        );
        const section = mountDom({ cityPrefill: "Москва" });
        runInitScript(section);
        jest.advanceTimersByTime(50);
        await tick();

        expect(section.getAttribute("data-selected-city-fias-id")).toBe(
          "fias-msk",
        );
      });

      it("начальный проб: пустое поле города — проба не запускается", () => {
        const section = mountDom({ cityPrefill: "" });
        runInitScript(section);
        jest.advanceTimersByTime(50);

        expect(fetchMock).not.toHaveBeenCalled();
      });
    });
  });

  describe("DaData адрес — специфика", () => {
    it("locations по сохранённому city_fias_id (приоритет 1)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({ suggestions: [] }) }),
      );
      const section = mountDom();
      runInitScript(section);
      section.setAttribute("data-selected-city-fias-id", "fias-msk");
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      address.value = "Тверская 1";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      const call = fetchMock.mock.calls.find((c) =>
        /suggest\/address/.test(String(c[0])),
      )!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.locations).toEqual([{ city_fias_id: "fias-msk" }]);
      expect(body.from_bound).toEqual({ value: "street" });
      expect(body.to_bound).toEqual({ value: "flat" });
    });

    it("locations по тексту города, если fias не сохранён (приоритет 2)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({ suggestions: [] }) }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Казань"; // просто текст, без клика на подсказку
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      address.value = "Баумана 1";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      const call = fetchMock.mock.calls.find((c) =>
        /suggest\/address/.test(String(c[0])),
      )!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.locations).toEqual([{ city: "Казань" }]);
    });

    it('locations по стране "Россия", если нет ни fias, ни текста города (приоритет 3)', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({ suggestions: [] }) }),
      );
      const section = mountDom();
      runInitScript(section);
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      address.value = "Баумана 1";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      const call = fetchMock.mock.calls.find((c) =>
        /suggest\/address/.test(String(c[0])),
      )!;
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.locations).toEqual([{ country: "Россия" }]);
    });

    it('короткий адрес формируется из street+house+flat (все три части, с экранированием "&")', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({
            suggestions: [
              {
                value: "г Москва, ул Тверская, д 1, кв 5",
                data: {
                  street_with_type: "ул Тверская & Дом",
                  house: "1",
                  flat: "5",
                  postal_code: "101000",
                  city_fias_id: "fias-msk",
                },
              },
            ],
          }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      address.value = "Тверская";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      const li = list.querySelector("li")!;
      expect(li.getAttribute("data-suggest-value")).toBe(
        "ул Тверская & Дом, д 1, кв 5",
      );
      expect(li.textContent).toBe("ул Тверская & Дом, д 1, кв 5");
      expect(li.innerHTML).toContain("&amp;"); // экранирование спецсимвола в esc()
    });

    it("короткий адрес — только улица (house/flat отсутствуют, house_type/flat_type не нужны)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({
            suggestions: [
              { value: "ул Ленина", data: { street_with_type: "ул Ленина" } },
            ],
          }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      address.value = "Ленина";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.querySelector("li")!.getAttribute("data-suggest-value")).toBe(
        "ул Ленина",
      );
    });

    it('короткий адрес — кастомные house_type/flat_type ("корп"/"офис") идут вместо дефолтов', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({
            suggestions: [
              {
                value: "x",
                data: {
                  street_with_type: "ул Ленина",
                  house: "2",
                  house_type: "корп",
                  flat: "10",
                  flat_type: "офис",
                },
              },
            ],
          }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      address.value = "Ленина";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.querySelector("li")!.getAttribute("data-suggest-value")).toBe(
        "ул Ленина, корп 2, офис 10",
      );
    });

    it("без street_with_type в ответе — используется полное value подсказки как есть", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({
            suggestions: [{ value: "Просто текст", data: {} }],
          }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      address.value = "Просто";
      address.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.querySelector("li")!.getAttribute("data-suggest-value")).toBe(
        "Просто текст",
      );
    });

    it("ручная правка адреса очищает сохранённые street/building/apartment", () => {
      const section = mountDom();
      runInitScript(section);
      section.setAttribute("data-addr-street", "Старая");
      section.setAttribute("data-addr-building", "1");
      section.setAttribute("data-addr-apartment", "2");
      const address = section.querySelector(
        '[data-checkout-dadata-input="address"]',
      ) as HTMLInputElement;
      address.value = "Новый адрес";
      address.dispatchEvent(new Event("input", { bubbles: true }));

      expect(section.hasAttribute("data-addr-street")).toBe(false);
      expect(section.hasAttribute("data-addr-building")).toBe(false);
      expect(section.hasAttribute("data-addr-apartment")).toBe(false);
    });

    it("выбор адресной подсказки — пишет street/building/apartment, автозаполняет индекс, диспатчит адрес", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="ул Ленина, д 1, кв 5" data-postal="101000" data-street="ул Ленина" data-house="1" data-flat="5"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      jest.advanceTimersByTime(400);

      expect(section.getAttribute("data-addr-street")).toBe("ул Ленина");
      expect(section.getAttribute("data-addr-building")).toBe("1");
      expect(section.getAttribute("data-addr-apartment")).toBe("5");
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      expect(postal.value).toBe("101000");
      expect(addressChangedEvents.at(-1).postalCode).toBe("101000");
    });

    it("выбор адресной подсказки без flat — data-addr-apartment удаляется (а не остаётся от прошлого выбора)", () => {
      const section = mountDom();
      runInitScript(section);
      section.setAttribute("data-addr-apartment", "стар");
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="ул Ленина, д 1" data-street="ул Ленина" data-house="1"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );

      expect(section.hasAttribute("data-addr-apartment")).toBe(false);
    });

    it('data-autofill="false" — индекс НЕ автозаполняется при выборе адреса', () => {
      const section = mountDom();
      section
        .querySelector('[data-checkout-field="postalCode"]')!
        .setAttribute("data-autofill", "false");
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="ул Ленина, д 1" data-postal="101000" data-street="ул Ленина" data-house="1"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );

      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      expect(postal.value).toBe("");
    });

    it(// ТЕКУЩЕЕ ПОВЕДЕНИЕ: явный `if (postal) dispatchAddressChange()` в обработчике не
    // выполняется без индекса, НО поле "Адрес" само в числе отслеживаемых trackFields —
    // `input.dispatchEvent(new Event('change', {bubbles:true}))` чуть выше по коду
    // безусловно триггерит тот же dispatchAddressChange ещё раз. Событие всё равно
    // уходит, просто с пустым postalCode.
    "подсказка без postal — checkout:address-changed всё равно уходит (через change на самом поле), но с пустым postalCode", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="ул Ленина, д 1" data-street="ул Ленина" data-house="1"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      jest.advanceTimersByTime(400);

      expect(addressChangedEvents.at(-1).postalCode).toBe("");
    });

    it("выбор адреса делает progressive-disclosure повторный запрос (refetch того же значения)", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({ suggestions: [] }) }),
      );
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="ул Ленина, д 1" data-street="ул Ленина" data-house="1"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      await tick();

      const suggestCalls = fetchMock.mock.calls.filter((c) =>
        /suggest\/address/.test(String(c[0])),
      );
      expect(suggestCalls.length).toBe(1); // refetch с уже выбранным значением (углубление уровня)
    });
  });

  // Оставшиеся защитные ветки (null-safety на нестандартной разметке / DaData-ответах),
  // не задетые сценариями выше, — добиваем прицельно для 100% branch coverage.
  describe("защитные ветки (fallbacks)", () => {
    it("токен берётся из __MERFY_CONFIG__.dadataToken, если __DADATA_TOKEN__ не задан", async () => {
      setDadataToken(null);
      (window as any).__MERFY_CONFIG__ = { dadataToken: "cfg-token" };
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => CITY_SUGGEST }),
      );
      const section = mountDom();
      runInitScript(section);

      // getDadataToken() — используется в fetchSuggestions.
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Москва";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();
      expect(
        fetchMock.mock.calls.some((c) => /suggest\/address/.test(String(c[0]))),
      ).toBe(true);

      // Инлайновый лукап токена в dispatchAddressChange (last-resort резолв).
      fetchMock.mockClear();
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      city.value = "Казань"; // ещё раз, без выбора подсказки
      postal.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);
      await tick();
      expect(
        fetchMock.mock.calls.some((c) => /suggest\/address/.test(String(c[0]))),
      ).toBe(true);
    });

    it("last-resort резолв (dispatchAddressChange) использует settlement_fias_id, если city_fias_id не пришёл", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({
            suggestions: [{ data: { settlement_fias_id: "settlement-x" } }],
          }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Урюпинск";
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      postal.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);
      await tick();

      expect(section.getAttribute("data-selected-city-fias-id")).toBe(
        "settlement-x",
      );
    });

    it("last-resort резолв (dispatchAddressChange) — DaData не вернул ни один fias, cityFiasId остаётся пустым", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({ suggestions: [{ data: {} }] }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Урюпинск";
      const postal = section.querySelector(
        '[data-checkout-field="postalCode"] input',
      ) as HTMLInputElement;
      postal.dispatchEvent(new Event("change", { bubbles: true }));
      jest.advanceTimersByTime(400);
      await tick();

      expect(section.getAttribute("data-selected-city-fias-id")).toBeNull();
      expect(addressChangedEvents.at(-1).cityFiasId).toBe("");
    });

    it("resolveCityIfMissing на blur использует settlement_fias_id, если city_fias_id не пришёл", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          json: async () => ({
            suggestions: [
              {
                value: "Урюпинск",
                data: { settlement_fias_id: "settlement-y" },
              },
            ],
          }),
        }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "Урюпинск";
      city.dispatchEvent(new Event("blur"));
      jest.advanceTimersByTime(150);
      await tick();

      expect(section.getAttribute("data-selected-city-fias-id")).toBe(
        "settlement-y",
      );
    });

    it.each(["input", "focus"] as const)(
      'city поле пустое (не тронуто) — "%s" не падает, список остаётся скрыт (фолбэк-пустая строка)',
      (eventName) => {
        const section = mountDom();
        runInitScript(section);
        const city = section.querySelector(
          '[data-checkout-dadata-input="city"]',
        ) as HTMLInputElement;
        const list = section.querySelector(
          '[data-checkout-dadata-list="city"]',
        ) as HTMLElement;
        city.dispatchEvent(new Event(eventName, { bubbles: true }));
        expect(list.hidden).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it("blur на пустом city-поле (без ввода) не падает — resolveCityIfMissing получает фолбэк-пустую строку", () => {
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      expect(() => city.dispatchEvent(new Event("blur"))).not.toThrow();
      jest.advanceTimersByTime(150);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("без chevron в разметке — открытие/закрытие списка стран не падает", () => {
      document.body.innerHTML = `
        <section data-checkout-delivery data-puck-component-id="cdf-1">
          <div class="field" data-checkout-field="country" data-checkout-address
               data-country-default="РФ" data-country-selectable="true">
            <input id="checkout-country" data-country-input value="РФ" />
            <ul data-country-list hidden></ul>
          </div>
        </section>`;
      const section = document.querySelector(
        "[data-checkout-delivery]",
      ) as HTMLElement;
      runInitScript(section);
      const input = section.querySelector(
        "[data-country-input]",
      ) as HTMLInputElement;
      const list = section.querySelector("[data-country-list]") as HTMLElement;

      expect(() => input.dispatchEvent(new Event("focus"))).not.toThrow();
      expect(list.hidden).toBe(false);
      expect(() =>
        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      ).not.toThrow();
      expect(list.hidden).toBe(true);
    });

    it("клик ВНУТРИ поля страны не закрывает список (contains → true)", () => {
      const section = mountDom();
      runInitScript(section);
      const input = section.querySelector(
        "[data-country-input]",
      ) as HTMLInputElement;
      const list = section.querySelector("[data-country-list]") as HTMLElement;
      input.dispatchEvent(new Event("focus"));
      expect(list.hidden).toBe(false);

      input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(list.hidden).toBe(false);
    });

    it("пункт страны с пустым data-country-value (нестандартная разметка) — фолбэк на пустую строку", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector("[data-country-list]") as HTMLElement;
      list.insertAdjacentHTML(
        "beforeend",
        '<li data-country-value="">Пусто</li>',
      );
      const li = list.lastElementChild as HTMLElement;
      li.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );

      expect(
        (section.querySelector("[data-country-input]") as HTMLInputElement)
          .value,
      ).toBe("");
    });

    it("ответ DaData без ключа suggestions (не suggestions:[], а вовсе без поля) — список скрывается", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({}) }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "Москва";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.hidden).toBe(true);
    });

    it("подсказка без value и без data — рендерится пустой setVal, без падения", async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve({ json: async () => ({ suggestions: [{}] }) }),
      );
      const section = mountDom();
      runInitScript(section);
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      city.value = "ab";
      city.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(250);
      await tick();

      expect(list.hidden).toBe(false);
      expect(list.querySelector("li")!.getAttribute("data-suggest-value")).toBe(
        "",
      );
    });

    it("пункт списка DaData с пустым data-suggest-value (нестандартная разметка) — фолбэк на пустую строку", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.innerHTML = '<li data-suggest-value=""></li>';
      const city = section.querySelector(
        '[data-checkout-dadata-input="city"]',
      ) as HTMLInputElement;
      city.value = "что-то";

      expect(() =>
        (list.querySelector("li") as HTMLElement).dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        ),
      ).not.toThrow();
      expect(city.value).toBe("");
    });

    it("выбор адреса без data-street/data-house (только data-flat) — street/building пустые, атрибуты не выставляются", () => {
      const section = mountDom();
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML = '<li data-suggest-value="кв 5" data-flat="5"></li>';
      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );

      expect(section.hasAttribute("data-addr-street")).toBe(false);
      expect(section.hasAttribute("data-addr-building")).toBe(false);
      expect(section.getAttribute("data-addr-apartment")).toBe("5");
    });

    it('автозаполнение индекса — поле "Индекс" без вложенного <input> (нестандартная разметка) не падает', () => {
      document.body.innerHTML = `
        <section data-checkout-delivery data-puck-component-id="cdf-1">
          <div class="field" data-checkout-field="address" data-dadata="true">
            <input data-checkout-dadata-input="address" />
            <ul data-checkout-dadata-list="address" hidden></ul>
          </div>
          <div class="field" data-checkout-field="postalCode" data-autofill="true"></div>
        </section>`;
      const section = document.querySelector(
        "[data-checkout-delivery]",
      ) as HTMLElement;
      runInitScript(section);
      const list = section.querySelector(
        '[data-checkout-dadata-list="address"]',
      ) as HTMLElement;
      list.innerHTML =
        '<li data-suggest-value="ул Ленина, д 1" data-postal="101000" data-street="ул Ленина" data-house="1"></li>';

      (list.querySelector("li") as HTMLElement).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      // Отсутствие <input> в поле "Индекс" не должно обрывать разбор адреса —
      // остальные side-effect'ы выбора подсказки (street/house) применяются как обычно.
      expect(section.getAttribute("data-addr-street")).toBe("ул Ленина");
      expect(section.getAttribute("data-addr-building")).toBe("1");
    });

    it("поле DaData без обёртки [data-checkout-field] (нестандартная разметка) — клик вне списка не падает (field=null)", () => {
      document.body.innerHTML = `
        <section data-checkout-delivery data-puck-component-id="cdf-1">
          <input data-checkout-dadata-input="city" />
          <ul data-checkout-dadata-list="city" hidden></ul>
        </section>`;
      const section = document.querySelector(
        "[data-checkout-delivery]",
      ) as HTMLElement;
      expect(() => runInitScript(section)).not.toThrow();
      const list = section.querySelector(
        '[data-checkout-dadata-list="city"]',
      ) as HTMLElement;
      list.hidden = false;

      expect(() =>
        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      ).not.toThrow();
      // guard `field && ...` — без обёртки клик-вне не имеет владельца, список не трогается этим обработчиком.
      expect(list.hidden).toBe(false);
    });
  });
});
