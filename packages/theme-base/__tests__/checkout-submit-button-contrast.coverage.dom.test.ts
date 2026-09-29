/**
 * @jest-environment jsdom
 *
 * CheckoutSubmit — ВТОРОЙ инлайн-скрипт (строки ~579-645): применение
 * контраста кнопки «как у Shopify». Он вызывает уже готовую функцию
 * `window.__merfyCheckoutButtonColors` (расчёт — отдельный TS-модуль
 * `runtime/checkout-button-contrast.ts`, вставляется третьим `<script
 * is:inline set:html={...}>`; его собственная математика — вне периметра
 * этого файла, у него свой источник и, по докстрингу модуля, свой гард) и
 * раскладывает результат в CSS-переменные + data-атрибут секции.
 *
 * `window.__merfyCheckoutButtonColors` здесь — управляемый мок: тесты
 * характеризуют, ЧТО ИМЕННО второй скрипт делает с входом/выходом этой
 * функции (какие роли собирает, как определяет фон колонки, как применяет
 * plate/label/source/shaded), а не саму формулу контраста.
 *
 * Исполнение — через помощник покрытия `astroInlineRunners`; это ВТОРОЙ
 * `is:inline`-скрипт файла (индекс 1), третий `<script is:inline
 * set:html={CHECKOUT_BUTTON_CONTRAST_SOURCE}>` помощник пропускает (пустое
 * тело между тегами) и в покрытие CheckoutSubmit.astro не входит.
 */
import { join } from "path";
import { astroInlineRunners } from "./helpers/astro-inline-script";

const ASTRO = join(
  __dirname,
  "..",
  "blocks",
  "CheckoutSubmit",
  "CheckoutSubmit.astro",
);

function runContrastScript(blockId: string | undefined = "cs-1") {
  astroInlineRunners(ASTRO)[1].run({ blockId });
}

function mockColors(out: {
  plate: number[];
  label: number[];
  source: string;
  shaded: boolean;
}) {
  (window as any).__merfyCheckoutButtonColors = jest.fn(() => out);
}

function cleanup() {
  delete (window as any).__merfyRoot;
  delete (window as any).__merfyCheckoutButtonColors;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});
afterEach(cleanup);

describe("CheckoutSubmit — контраст кнопки: обычный путь применения", () => {
  it("секция найдена через __merfyRoot, функция контраста задана → цвета и атрибут применяются", () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    mockColors({
      plate: [10, 20, 30],
      label: [255, 255, 255],
      source: "accent",
      shaded: false,
    });

    runContrastScript();

    expect(
      getComputedStyle(section).getPropertyValue("--color-button-bg").trim(),
    ).toBe("10 20 30");
    expect(
      getComputedStyle(section).getPropertyValue("--color-button-text").trim(),
    ).toBe("255 255 255");
    expect(section.getAttribute("data-checkout-submit-contrast")).toBe(
      "accent",
    );
  });

  it("shaded:true → к атрибуту добавляется суффикс +shade", () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    mockColors({
      plate: [0, 0, 0],
      label: [255, 255, 255],
      source: "heading",
      shaded: true,
    });

    runContrastScript();

    expect(section.getAttribute("data-checkout-submit-contrast")).toBe(
      "heading+shade",
    );
  });

  it("__merfyRoot не функция → используется резерв document.querySelector('[data-block=\"checkout-submit\"]')", () => {
    document.body.innerHTML = `<section data-block="checkout-submit"></section>`;
    delete (window as any).__merfyRoot; // не инжектирован вовсе — второй скрипт это учитывает (typeof-проверка)
    mockColors({
      plate: [1, 2, 3],
      label: [4, 5, 6],
      source: "bg",
      shaded: false,
    });

    runContrastScript(undefined);

    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    expect(
      getComputedStyle(section).getPropertyValue("--color-button-bg").trim(),
    ).toBe("1 2 3");
  });
});

describe("CheckoutSubmit — контраст кнопки: ранние выходы", () => {
  it("секция не найдена нигде → скрипт тихо завершается, функция контраста не вызывается", () => {
    document.body.innerHTML = "<div>пусто</div>";
    delete (window as any).__merfyRoot;
    const colors = jest.fn();
    (window as any).__merfyCheckoutButtonColors = colors;

    expect(() => runContrastScript()).not.toThrow();
    expect(colors).not.toHaveBeenCalled();
  });

  it("секция есть, но window.__merfyCheckoutButtonColors не функция → атрибут не выставляется", () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    delete (window as any).__merfyCheckoutButtonColors;

    expect(() => runContrastScript()).not.toThrow();
    expect(section.hasAttribute("data-checkout-submit-contrast")).toBe(false);
  });
});

describe("CheckoutSubmit — контраст кнопки: сброс своего прошлого результата перед пересчётом", () => {
  it("старое значение --color-button-bg снимается ДО чтения ролей (роли приходят пустыми, не «своими же»)", () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    section.style.setProperty("--color-button-bg", "9 9 9"); // «прошлый» результат прошлого прохода
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [7, 7, 7],
        label: [8, 8, 8],
        source: "button-bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();

    expect(colors.mock.calls[0][0].buttonBg).toBe(""); // снято перед чтением, не «9 9 9»
    expect(
      getComputedStyle(section).getPropertyValue("--color-button-bg").trim(),
    ).toBe("7 7 7");
  });
});

describe("CheckoutSubmit — контраст кнопки: сбор ролей из CSS-переменных секции", () => {
  it("все 7 ролей читаются из --color-* и передаются функции контраста как есть", () => {
    // --color-button-bg/-text заданы ЧЕРЕЗ СТИЛЕВОЕ ПРАВИЛО (как в проде —
    // tokens.css), а не инлайном на секции: apply() ПЕРВЫМ делом снимает эти
    // два свойства именно со своего ИНЛАЙН-style (см. describe выше про
    // сброс прошлого результата) — заданные инлайном на самой секции, они
    // всегда читались бы пустыми после снятия. Правило в <style> переживает
    // removeProperty() точно так же, как в браузере переживает каскад из
    // tokens.css. Остальные 5 ролей apply() не трогает — их можно вешать
    // инлайном прямо на секцию.
    document.head.innerHTML = `<style>
      section[data-block="checkout-submit"] {
        --color-button-bg: 113 192 255;
        --color-button-text: 255 255 255;
      }
    </style>`;
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1" style="
        --color-accent: 10 20 30;
        --color-heading: 40 50 60;
        --color-bg: 70 80 90;
        --color-text: 100 110 120;
        --color-button-2-bg: 130 140 150;
      "></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [0, 0, 0],
        label: [0, 0, 0],
        source: "button-bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();

    expect(colors.mock.calls[0][0]).toEqual({
      buttonBg: "113 192 255",
      buttonText: "255 255 255",
      accent: "10 20 30",
      heading: "40 50 60",
      bg: "70 80 90",
      text: "100 110 120",
      button2Bg: "130 140 150",
    });
  });
});

describe("CheckoutSubmit — контраст кнопки: определение фона колонки (обход предков)", () => {
  it("фон найден на самой секции → используется он, обход не идёт выше", () => {
    document.body.innerHTML = `<div style="background-color: rgb(1, 1, 1)">
      <section data-block="checkout-submit" data-puck-component-id="cs-1" style="background-color: rgb(20, 30, 40)"></section>
    </div>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [0, 0, 0],
        label: [0, 0, 0],
        source: "bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();

    expect(colors.mock.calls[0][1]).toBe("20 30 40");
  });

  it("секция прозрачна, фон найден у предка → используется фон предка", () => {
    document.body.innerHTML = `<div style="background-color: rgb(58, 69, 48)">
      <section data-block="checkout-submit" data-puck-component-id="cs-1"></section>
    </div>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [0, 0, 0],
        label: [0, 0, 0],
        source: "bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();

    expect(colors.mock.calls[0][1]).toBe("58 69 48");
  });

  it("фрагмент превью оторван от document (нет предков) → фон не найден нигде, дефолт 255 255 255", () => {
    // Как в комментарии CheckoutSubmit.astro:605-606: «на превью-фрагменте
    // блока предка может не быть». __merfyRoot возвращает узел НАПРЯМУЮ, без
    // document.body.appendChild — единственный способ создать «оторванный»
    // фрагмент, у которого parentElement обрывается в null раньше html.
    const detached = document.createElement("section");
    detached.setAttribute("data-block", "checkout-submit");
    (window as any).__merfyRoot = () => detached;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [0, 0, 0],
        label: [0, 0, 0],
        source: "bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();

    expect(colors.mock.calls[0][1]).toBe("255 255 255");
  });

  it("секция прикреплена к body/html, но фона нигде нет → дефолт 255 255 255 (тот же дефолт, другой путь обхода)", () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [0, 0, 0],
        label: [0, 0, 0],
        source: "bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();

    expect(colors.mock.calls[0][1]).toBe("255 255 255");
  });
});

describe("CheckoutSubmit — контраст кнопки: повторный пересчёт через requestAnimationFrame", () => {
  it("requestAnimationFrame доступен → apply() вызывается ВТОРОЙ раз на следующем кадре", async () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [1, 1, 1],
        label: [2, 2, 2],
        source: "bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    runContrastScript();
    expect(colors).toHaveBeenCalledTimes(1); // синхронный вызов apply()

    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 0)),
    );
    expect(colors.mock.calls.length).toBeGreaterThanOrEqual(2); // + отложенный проход
  });

  it("requestAnimationFrame недоступен (typeof !== function) → повторного прохода нет, только синхронный", async () => {
    document.body.innerHTML = `<section data-block="checkout-submit" data-puck-component-id="cs-1"></section>`;
    const section = document.querySelector(
      '[data-block="checkout-submit"]',
    ) as HTMLElement;
    (window as any).__merfyRoot = () => section;
    const colors = jest.fn(
      (_roles: Record<string, string>, _column: string) => ({
        plate: [1, 1, 1],
        label: [2, 2, 2],
        source: "bg",
        shaded: false,
      }),
    );
    (window as any).__merfyCheckoutButtonColors = colors;

    const realRaf = window.requestAnimationFrame;
    // @ts-expect-error — временно убираем rAF, чтобы проверить typeof-гейт
    delete window.requestAnimationFrame;
    try {
      runContrastScript();
      await new Promise((r) => setTimeout(r, 20));
      expect(colors).toHaveBeenCalledTimes(1);
    } finally {
      window.requestAnimationFrame = realRaf;
    }
  });
});
