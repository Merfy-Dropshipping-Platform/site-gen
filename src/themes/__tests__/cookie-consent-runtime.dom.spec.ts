/**
 * @jest-environment jsdom
 *
 * Баннер согласия на cookie — поведение рантайма
 * (packages/theme-base/runtime/cookie-consent.ts) на НАСТОЯЩЕЙ разметке
 * компонента: HTML берётся из рендера `CookieConsent.astro` (компилятор Astro
 * + Container API, render-cookie-consent.mjs), а не переписывается в тесте.
 *
 * Сценарии владельца 27.09:
 *  • до «Принять» баннер виден на каждой странице;
 *  • «Принять» прячет баннер и пишет `merfy:cookie-consent:v1` = дата;
 *  • повторная загрузка (новый модуль, новый DOM, то же хранилище) — баннера нет;
 *  • мягкая навигация Astro (новый <body>, `astro:page-load`) — состояние то же;
 *  • хранилище бросает исключения — ничего не падает, баннер показывается,
 *    «Принять» прячет его до конца визита;
 *  • политика написана (глобал `__MERFY_PRIVACY_POLICY_URL__`) — ссылка видна
 *    с этим адресом; нет глобала — фразы со ссылкой в DOM нет;
 *  • в превью конструктора (iframe) нажатие на ссылку политики гасится до
 *    агента превью (иначе конструктор автосоздаёт страницу), на витрине — нет.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const SITES_ROOT = resolve(__dirname, "..", "..", "..");
const MARKUP = execFileSync(
  process.execPath,
  [resolve(__dirname, "render-cookie-consent.mjs")],
  {
    cwd: SITES_ROOT,
    encoding: "utf8",
  },
)
  // Модульный скрипт компонента в jsdom не исполняется; рантайм зовём сами.
  .replace(/<script[\s\S]*?<\/script>/g, "");

const KEY = "merfy:cookie-consent:v1";
const GLOBAL = "__MERFY_PRIVACY_POLICY_URL__";

type Runtime =
  typeof import("../../../packages/theme-base/runtime/cookie-consent");

/** Слушатели, повешенные рантаймом, — снимаем между «загрузками страницы». */
const listeners: Array<
  [
    EventTarget,
    string,
    EventListenerOrEventListenerObject,
    boolean | AddEventListenerOptions | undefined,
  ]
> = [];

function trackListeners(target: EventTarget): void {
  const original = target.addEventListener.bind(target);
  jest
    .spyOn(target, "addEventListener")
    .mockImplementation((type, listener, options) => {
      listeners.push([target, type, listener!, options]);
      original(type, listener, options);
    });
}

/** «Загрузка страницы»: свежий модуль рантайма и свежий DOM. */
function loadPage(): Runtime {
  document.body.innerHTML = `<main><a href="/catalog">Каталог</a></main>${MARKUP}`;
  let runtime!: Runtime;
  jest.isolateModules(() => {
    // Свежий модуль = свежая память визита (как новая загрузка страницы).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    runtime = require("../../../packages/theme-base/runtime/cookie-consent");
  });
  delete (window as unknown as Record<string, unknown>)
    .__merfyCookieConsentBound;
  runtime.initCookieConsent();
  return runtime;
}

const banner = () =>
  document.querySelector<HTMLElement>("[data-cookie-consent]")!;
const accept = () =>
  document.querySelector<HTMLButtonElement>("[data-cookie-consent-accept]")!;
const policyLink = () =>
  document.querySelector<HTMLAnchorElement>(
    "[data-cookie-consent-policy-link]",
  );

beforeEach(() => {
  trackListeners(window);
  trackListeners(document);
});

afterEach(() => {
  for (const [target, type, listener, options] of listeners.splice(0)) {
    target.removeEventListener(type, listener, options);
  }
  jest.restoreAllMocks();
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>)[GLOBAL];
  delete (window as unknown as Record<string, unknown>)
    .__merfyCookieConsentBound;
  document.body.innerHTML = "";
});

describe("показ и «Принять»", () => {
  it("без согласия баннер виден", () => {
    loadPage();
    expect(banner().hidden).toBe(false);
  });

  it("«Принять» прячет баннер и пишет дату в localStorage", () => {
    loadPage();
    accept().click();
    expect(banner().hidden).toBe(true);
    const stored = window.localStorage.getItem(KEY);
    expect(stored).not.toBeNull();
    expect(Number.isNaN(Date.parse(stored!))).toBe(false);
  });

  it("повторная загрузка после согласия — баннер не показывается", () => {
    loadPage();
    accept().click();
    for (const [target, type, listener, options] of listeners.splice(0)) {
      target.removeEventListener(type, listener, options);
    }
    loadPage();
    expect(banner().hidden).toBe(true);
  });

  it("согласие уже в хранилище — баннер скрыт с первой загрузки", () => {
    window.localStorage.setItem(KEY, "accepted");
    loadPage();
    expect(banner().hidden).toBe(true);
  });

  it("мягкая навигация Astro: новый баннер сверяется на astro:page-load", () => {
    loadPage();
    // Подмена <body> роутером: новый баннер приходит скрытым из разметки.
    document.body.innerHTML = MARKUP;
    expect(banner().hidden).toBe(true);
    document.dispatchEvent(new Event("astro:page-load"));
    expect(banner().hidden).toBe(false);
    accept().click();
    document.body.innerHTML = MARKUP;
    document.dispatchEvent(new Event("astro:page-load"));
    expect(banner().hidden).toBe(true);
  });

  it("повторный init не вешает второй обработчик (одна запись в хранилище за клик)", () => {
    const runtime = loadPage();
    runtime.initCookieConsent();
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    accept().click();
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe("хранилище недоступно", () => {
  it("ошибка чтения и записи — не падает, баннер виден, «Принять» прячет до конца визита", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => loadPage()).not.toThrow();
    expect(banner().hidden).toBe(false);
    expect(() => accept().click()).not.toThrow();
    expect(banner().hidden).toBe(true);
    // Мягкий переход в том же визите — баннер не возвращается.
    document.body.innerHTML = MARKUP;
    document.dispatchEvent(new Event("astro:page-load"));
    expect(banner().hidden).toBe(true);
  });

  it("сам доступ к window.localStorage бросает — не падает", () => {
    jest.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => loadPage()).not.toThrow();
    expect(banner().hidden).toBe(false);
    expect(() => accept().click()).not.toThrow();
    expect(banner().hidden).toBe(true);
  });
});

describe("ссылка на политику конфиденциальности", () => {
  it("политика написана — ссылка видна и ведёт на адрес из глобала", () => {
    (window as unknown as Record<string, unknown>)[GLOBAL] = "/legal/privacy";
    loadPage();
    const slot = document.querySelector<HTMLElement>(
      "[data-cookie-consent-policy]",
    )!;
    expect(slot.hidden).toBe(false);
    expect(policyLink()!.getAttribute("href")).toBe("/legal/privacy");
    expect(banner().textContent?.replace(/\s+/g, " ")).toContain(
      "Подробнее — в Политике конфиденциальности.",
    );
  });

  it("политики нет — фразы со ссылкой в DOM нет, баннер остаётся", () => {
    loadPage();
    expect(document.querySelector("[data-cookie-consent-policy]")).toBeNull();
    expect(banner().querySelector("a")).toBeNull();
    expect(banner().hidden).toBe(false);
  });

  it.each(["", "   ", "https://evil.example/privacy", "//evil.example", 42])(
    "негодный глобал %p — ссылки нет",
    (value) => {
      (window as unknown as Record<string, unknown>)[GLOBAL] = value;
      loadPage();
      expect(policyLink()).toBeNull();
    },
  );

  it("витрина: нажатие на ссылку не гасится", () => {
    (window as unknown as Record<string, unknown>)[GLOBAL] = "/legal/privacy";
    loadPage();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    policyLink()!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("превью конструктора (iframe): нажатие гасится раньше агента превью", () => {
    (window as unknown as Record<string, unknown>)[GLOBAL] = "/legal/privacy";
    loadPage();
    // Агент превью слушает document в фазе захвата (preview.service.ts).
    const agent = jest.fn();
    document.addEventListener("click", agent, true);
    jest
      .spyOn(window, "self", "get")
      .mockReturnValue({} as Window & typeof globalThis);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    policyLink()!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(agent).not.toHaveBeenCalled();
    document.removeEventListener("click", agent, true);
  });

  it("превью: «Принять» доходит до агента превью и НЕ прячет баннер (28.09: баннер настраивают)", () => {
    loadPage();
    const agent = jest.fn();
    document.addEventListener("click", agent, true);
    jest
      .spyOn(window, "self", "get")
      .mockReturnValue({} as Window & typeof globalThis);
    accept().click();
    expect(banner().hidden).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(agent).toHaveBeenCalledTimes(1);
    document.removeEventListener("click", agent, true);
  });
});

/**
 * Настройки продавца («Настройки темы» → «Баннер», владелец 28.09): тексты и
 * кнопки рантайм рисует из глобала `__MERFY_COOKIE_BANNER__`; в превью
 * конструктора агент меняет глобал и шлёт `merfy:cookie-banner` — баннер
 * перерисовывается без перезагрузки. В превью баннер виден всегда.
 */
describe("настройки продавца — тексты и кнопки", () => {
  const BANNER_GLOBAL = "__MERFY_COOKIE_BANNER__";
  const setBanner = (value: unknown) => {
    (window as unknown as Record<string, unknown>)[BANNER_GLOBAL] = value;
  };
  const heading = () =>
    document.querySelector<HTMLElement>("[data-cookie-consent-heading]")!;
  const text = () =>
    document.querySelector<HTMLElement>("[data-cookie-consent-text]")!;
  const decline = () =>
    document.querySelector<HTMLButtonElement>("[data-cookie-consent-decline]")!;
  const inPreview = () =>
    jest
      .spyOn(window, "self", "get")
      .mockReturnValue({} as Window & typeof globalThis);

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[BANNER_GLOBAL];
  });

  it("без настроек — прежний баннер: без заголовка, одна кнопка «Принять»", () => {
    loadPage();
    expect(heading().hidden).toBe(true);
    expect(text().textContent).toBe(
      "Мы используем файлы cookie, чтобы сайт работал корректно. Продолжая пользоваться сайтом, вы соглашаетесь с их использованием.",
    );
    expect(accept().textContent).toBe("Принять");
    expect(decline().hidden).toBe(true);
  });

  it("заголовок, текст, подписи и вторая кнопка — из глобала", () => {
    setBanner({
      heading: "Мы за честность",
      text: "Сайт хранит cookie.",
      primaryLabel: "Хорошо",
      secondaryLabel: "Нет, спасибо",
    });
    loadPage();
    expect(heading().hidden).toBe(false);
    expect(heading().textContent).toBe("Мы за честность");
    expect(text().textContent).toBe("Сайт хранит cookie.");
    expect(accept().textContent).toBe("Хорошо");
    expect(decline().hidden).toBe(false);
    expect(decline().textContent).toBe("Нет, спасибо");
  });

  it("пустая подпись — кнопки нет (как у секций), стёртый текст — пусто", () => {
    setBanner({ primaryLabel: "  ", secondaryLabel: "", text: "" });
    loadPage();
    expect(accept().hidden).toBe(true);
    expect(decline().hidden).toBe(true);
    expect(text().textContent).toBe("");
  });

  it("старая ревизия (declineEnabled/declineLabel) рисуется как раньше", () => {
    setBanner({ acceptLabel: "Ок", declineEnabled: true, declineLabel: "" });
    loadPage();
    expect(accept().textContent).toBe("Ок");
    expect(accept().hidden).toBe(false);
    expect(decline().hidden).toBe(false);
    expect(decline().textContent).toBe("Отклонить");
  });

  it("жирный/курсив и ссылка [текст](адрес); чужая разметка и javascript: — текстом", () => {
    setBanner({
      text: '<strong>Важно:</strong> <em>читайте</em> [правила](/pages/rules), <img src=x onerror="alert(1)"> [зло](javascript:alert(1))',
    });
    loadPage();
    const t = text();
    expect(t.querySelector("strong")!.textContent).toBe("Важно:");
    expect(t.querySelector("em")!.textContent).toBe("читайте");
    const links = t.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/pages/rules");
    expect(links[0].textContent).toBe("правила");
    expect(t.querySelector("img")).toBeNull();
    expect(t.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(t.textContent).toContain("зло");
  });

  it("дополнительная кнопка прячет баннер и запоминает отказ", () => {
    setBanner({ secondaryLabel: "Отклонить" });
    const runtime = loadPage();
    decline().click();
    expect(banner().hidden).toBe(true);
    expect(localStorage.getItem(KEY)).toMatch(/^declined:/);
    expect(runtime.cookieConsentDecision()).toBe("declined");
  });

  it("превью: баннер виден, даже если в этом браузере уже ответили", () => {
    window.localStorage.setItem(KEY, new Date().toISOString());
    inPreview();
    loadPage();
    expect(banner().hidden).toBe(false);
  });

  it("превью: новые настройки применяются по событию агента без перезагрузки", () => {
    inPreview();
    loadPage();
    expect(heading().hidden).toBe(true);
    setBanner({ heading: "Новый заголовок", secondaryLabel: "Нет" });
    document.dispatchEvent(new Event("merfy:cookie-banner"));
    expect(heading().hidden).toBe(false);
    expect(heading().textContent).toBe("Новый заголовок");
    expect(decline().hidden).toBe(false);
    // Настройки сбросили — баннер снова прежний.
    setBanner(null);
    document.dispatchEvent(new Event("merfy:cookie-banner"));
    expect(heading().hidden).toBe(true);
    expect(decline().hidden).toBe(true);
  });
});
