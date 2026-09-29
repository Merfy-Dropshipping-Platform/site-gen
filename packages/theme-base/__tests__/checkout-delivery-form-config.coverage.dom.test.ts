/**
 * @jest-environment jsdom
 *
 * CheckoutDeliveryForm — второй инлайн-скрипт (initCheckoutDeliveryConfig):
 * защитные ветки, не задетые checkout-delivery-config.dom.test.ts (там root
 * всегда находится через __merfyRoot, поля firstName/lastName всегда в DOM).
 * Скрипт исполняется через astroInlineRunners (индекс [1] — второй <script>),
 * покрытие пишется под путём CheckoutDeliveryForm.astro.
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
const FIELD_FULL = "md:col-span-2";

function runConfigScript(): void {
  astroInlineRunners(ASTRO)[1].run({
    blockId: "cdf-1",
    fieldFullClass: FIELD_FULL,
  });
}

afterEach(() => {
  delete (window as any).__merfyRoot;
  delete (window as any).__MERFY_CONFIG__;
  document.body.innerHTML = "";
});

describe("CheckoutDeliveryForm — runtime config: защитные ветки", () => {
  it("__merfyRoot(blockId) вернул null — root находится фолбэком через document.querySelector", () => {
    // ТЕКУЩЕЕ ПОВЕДЕНИЕ: `window.__merfyRoot(blockId) || document.querySelector(...)` —
    // сначала вызывается __merfyRoot, и только на falsy РЕЗУЛЬТАТ есть фолбэк.
    // Если __merfyRoot вообще не функция (глобал не инжектирован) — упадёт TypeError
    // до фолбэка (см. отдельный тест ниже); фолбэк спасает только "не нашёл элемент".
    document.body.innerHTML = `<section data-checkout-delivery></section>`;
    (window as any).__merfyRoot = () => null;

    expect(() => runConfigScript()).not.toThrow();
  });

  it("__merfyRoot(blockId) вернул null и секции нет в DOM — скрипт тихо завершается (root=null)", () => {
    document.body.innerHTML = "";
    (window as any).__merfyRoot = () => null;

    expect(() => runConfigScript()).not.toThrow();
  });

  describe("известные дефекты (ТЕКУЩЕЕ ПОВЕДЕНИЕ)", () => {
    it(// ТЕКУЩЕЕ ПОВЕДЕНИЕ (сомнительно): если window.__merfyRoot вообще не определён как функция
    // (глобал-хелпер почему-то не инжектирован в <head>), скрипт падает с TypeError ДО
    // фолбэка на document.querySelector — в отличие от многих других мест кода (config-ready
    // safety-net в CheckoutDeliveryMethod), здесь нет защиты на случай гонки/сбоя инъекции.
    "window.__merfyRoot не определён вовсе (не функция) — падает с TypeError раньше фолбэка", () => {
      document.body.innerHTML = `<section data-checkout-delivery></section>`;
      delete (window as any).__merfyRoot;

      expect(() => runConfigScript()).toThrow(/__merfyRoot is not a function/);
    });
  });

  it("нет полей firstName/lastName в DOM (ФИО одним полем) — customerNameMode не падает", () => {
    document.body.innerHTML = `
      <section data-checkout-delivery data-puck-component-id="cdf-1">
        <div data-checkout-field="fullName"></div>
        <div data-checkout-address data-checkout-field="city"></div>
      </section>`;
    (window as any).__merfyRoot = () =>
      document.querySelector("[data-checkout-delivery]");
    (window as any).__MERFY_CONFIG__ = {
      checkout: { customerNameMode: "surname" },
    };

    expect(() => runConfigScript()).not.toThrow();
    const addr = document.querySelector(
      "[data-checkout-address]",
    ) as HTMLElement;
    expect(addr.hidden).toBe(false); // addressRequired не задан → дефолт видимый
  });

  it("повторный запуск на том же root не навешивает listener дважды (guard __merfyDeliveryCfgInit)", () => {
    document.body.innerHTML = `<section data-checkout-delivery data-puck-component-id="cdf-1"></section>`;
    const section = document.querySelector(
      "[data-checkout-delivery]",
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;

    const addSpy = jest.spyOn(document, "addEventListener");
    runConfigScript();
    runConfigScript(); // повторный прогон (например, повторный astro:page-load)

    const configReadyBindings = addSpy.mock.calls.filter(
      (c) => c[0] === "checkout:config-ready",
    );
    expect(configReadyBindings.length).toBe(1);
    addSpy.mockRestore();
  });

  it('document.readyState="loading" — initCheckoutDeliveryConfig навешивается на DOMContentLoaded; повторный вызов оттуда не задваивает подписку config-ready', () => {
    document.body.innerHTML = `<section data-checkout-delivery data-puck-component-id="cdf-1"></section>`;
    const section = document.querySelector(
      "[data-checkout-delivery]",
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    // readyState — геттер прототипа Document в jsdom, а не собственное свойство:
    // getOwnPropertyDescriptor(document,'readyState') вернёт undefined, и наивное
    // "if(original) restore" ничего не восстановит — readyState останется 'loading'
    // для всех тестов ПОСЛЕ этого в файле. Восстанавливаем всегда: если своего
    // дескриптора не было — просто удаляем override, чтобы вернуть геттер прототипа.
    const original = Object.getOwnPropertyDescriptor(document, "readyState");
    Object.defineProperty(document, "readyState", {
      value: "loading",
      configurable: true,
    });
    try {
      const addSpy = jest.spyOn(document, "addEventListener");
      runConfigScript(); // безусловный вызов уже отработал, несмотря на readyState='loading'
      expect((section as any).__merfyDeliveryCfgInit).toBe(true);

      // Ветка, которую этот тест обязан проверить: readyState='loading' → скрипт
      // САМ регистрирует initCheckoutDeliveryConfig на DOMContentLoaded. Раньше
      // (до этого теста) событие не диспатчилось вовсе, и регистрация оставалась
      // недоказанной. Дispatch не должен задвоить подписку document на config-ready.
      document.dispatchEvent(new Event("DOMContentLoaded"));
      const configReadyBindings = addSpy.mock.calls.filter(
        (c) => c[0] === "checkout:config-ready",
      );
      expect(configReadyBindings.length).toBe(1); // guard __merfyDeliveryCfgInit не дал задвоить
      addSpy.mockRestore();
    } finally {
      if (original) Object.defineProperty(document, "readyState", original);
      else delete (document as any).readyState;
    }
  });
});
