/**
 * @jest-environment jsdom
 *
 * extension-purchase — поведение формы покупки на странице товара: нет точки,
 * `null` и сбои дают тишину (кнопка покупки остаётся); форма рисуется по
 * данным расширения; пустая отправка не уходит запросом и показывает тексты
 * проверки; верная уходит с телом ProductSubmitInput; ответы 200 / 422 / 400 /
 * 503 / сеть. Функция импортируется напрямую — тот же код, что уезжает на
 * витрину строкой EXTENSION_PURCHASE_RUNTIME_SOURCE (её выполнение проверено
 * здесь же).
 */
import {
  mountExtensionPurchase,
  type ProductFormView,
} from "../runtime/extension-purchase";
import { EXTENSION_PURCHASE_RUNTIME_SOURCE } from "../runtime/extension-purchase.runtime";
import { MESSAGES_V2 } from "../runtime/forms-vendor/validate-v2";
import {
  STAND_EXTENSION_ID,
  STAND_FORM_FN,
  STAND_PRODUCT_ID,
  STAND_STORE_ID,
  STAND_SUBMIT_FN,
  VERSTAK_FORM_VIEW,
  VERSTAK_SENT,
} from "../stand/extension-purchase/stand-data";

/** То, что рантайм кладёт в init запроса; в тестах читаем только эти поля. */
interface FetchInitSeen {
  method?: string;
  credentials?: string;
  headers: Record<string, string>;
  body?: string;
}

const API = "https://gateway.test/api";
const TOKEN_KEY = "merfy_customer_token";
const GENERIC_FAILURE = "Не удалось отправить. Попробуйте ещё раз.";

type Reply = { status?: number; body: unknown } | "network-error";
type Route = Reply | (() => Promise<Reply>);
interface Routes {
  map?: Route;
  form?: Route;
  submit?: Route;
}

const STOREFRONT_MAP = {
  [STAND_EXTENSION_ID]: {
    product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN },
  },
};
/** Шлюз отдаёт карту как есть, без обёртки {success,data}; функции — с обёрткой. */
const MAP_REPLY: Reply = { body: STOREFRONT_MAP };
const FORM_REPLY: Reply = { body: { success: true, data: VERSTAK_FORM_VIEW } };

function routeOf(url: string): keyof Routes {
  if (url.includes("/store/extensions/storefront")) return "map";
  return url.includes(`/fn/${STAND_FORM_FN}`) ? "form" : "submit";
}

function mockFetch(routes: Routes) {
  const fn = jest.fn<Promise<unknown>, [string, FetchInitSeen?]>((url) => {
    const route = routes[routeOf(url)] ?? { status: 404, body: null };
    const reply =
      typeof route === "function" ? route() : Promise.resolve(route);
    return reply.then((value) => {
      if (value === "network-error") throw new TypeError("Failed to fetch");
      const status = value.status ?? 200;
      return {
        ok: status < 400,
        status,
        json: () => Promise.resolve(value.body),
      };
    });
  });
  (window as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

type FetchMock = ReturnType<typeof mockFetch>;

const submitCalls = (fn: FetchMock) =>
  fn.mock.calls.filter(([url]) => url.includes(`/fn/${STAND_SUBMIT_FN}`));

const initOf = (call: [string, FetchInitSeen?]): FetchInitSeen =>
  call[1] ?? { headers: {} };

function page(): HTMLElement {
  const root = document.createElement("section");
  root.innerHTML =
    '<div data-product-actions><button type="button">В корзину</button></div>' +
    "<span data-extension-purchase-note hidden></span>" +
    '<div class="xp" data-extension-purchase hidden></div>';
  document.body.appendChild(root);
  return root;
}

const mount = (root: HTMLElement) =>
  mountExtensionPurchase(root, {
    productId: STAND_PRODUCT_ID,
    storeId: STAND_STORE_ID,
    apiBase: API,
  });

const box = (root: HTMLElement) =>
  root.querySelector("[data-extension-purchase]") as HTMLElement;
const actions = (root: HTMLElement) =>
  root.querySelector("[data-product-actions]") as HTMLElement;
const submitButton = (root: HTMLElement) =>
  root.querySelector("[data-xp-submit]") as HTMLButtonElement;

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function typeInto(root: HTMLElement, selector: string, value: string): void {
  const el = root.querySelector(selector) as HTMLInputElement;
  el.value = value;
  fire(el, "input");
}

function fillVerstak(root: HTMLElement): void {
  typeInto(root, '[data-xp-field="f40"]', "180");
  typeInto(root, '[data-xp-field="f41"]', "90");
  (
    root.querySelector(
      '[data-xp-field="f42"][data-xp-value="Дуб"]',
    ) as HTMLElement
  ).click();
  const coating = root.querySelector(
    '[data-xp-field="f43"]',
  ) as HTMLSelectElement;
  coating.value = "Масло";
  fire(coating, "change");
  (root.querySelector('[data-xp-field="f45"]') as HTMLElement).click();
  typeInto(root, '[data-xp-contact="name"]', "Игорь");
  typeInto(root, '[data-xp-contact="email"]', "igor@example.ru");
  typeInto(root, '[data-xp-contact="social"]', "@igor.belov");
  (root.querySelector("[data-xp-consent]") as HTMLElement).click();
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function mounted(routes: Routes, token?: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  const fn = mockFetch({ map: MAP_REPLY, form: FORM_REPLY, ...routes });
  const root = page();
  await mount(root);
  return { fn, root };
}

async function submitFilled(routes: Routes, token?: string) {
  const ctx = await mounted(routes, token);
  fillVerstak(ctx.root);
  submitButton(ctx.root).click();
  await flush();
  return ctx;
}

/** jsdom не умеет прокручивать: подставляем счётчик вызовов. */
const scrollIntoView = jest.fn();

/** Выполняет строку рантайма так, как её выполнит страница: обычным скриптом. */
function runRuntimeSource(): void {
  const script = document.createElement("script");
  script.textContent = EXTENSION_PURCHASE_RUNTIME_SOURCE;
  document.head.appendChild(script);
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
  delete (window as unknown as { __merfyPurchase?: unknown }).__merfyPurchase;
  jest.restoreAllMocks();
});

describe("тишина: кнопка покупки остаётся", () => {
  async function expectSilence(routes: Routes) {
    const fn = mockFetch(routes);
    const root = page();
    await mount(root);
    expect(box(root).hidden).toBe(true);
    expect(box(root).innerHTML).toBe("");
    expect(actions(root).hidden).toBe(false);
    expect(actions(root).style.display).toBe("");
    return fn;
  }

  it("в карте нет расширения с точкой «товар»", async () => {
    const fn = await expectSilence({
      map: { body: { other: { orders: {} } } },
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("карта пустая", async () => {
    await expectSilence({ map: { body: {} } });
  });

  it("форма — null: товар продаётся обычно", async () => {
    const fn = await expectSilence({
      map: MAP_REPLY,
      form: { body: { success: true, data: null } },
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("форма не по схеме", async () => {
    await expectSilence({
      map: MAP_REPLY,
      form: { body: { success: true, data: { title: "без пунктов" } } },
    });
  });

  it("сеть упала на карте", async () => {
    await expectSilence({ map: "network-error" });
  });

  it("сеть упала на форме", async () => {
    await expectSilence({ map: MAP_REPLY, form: "network-error" });
  });

  it("форма ответила 500", async () => {
    await expectSilence({
      map: MAP_REPLY,
      form: {
        status: 500,
        body: { success: false, code: "boom", message: "x" },
      },
    });
  });

  it("нет контейнера на странице — ничего не запрашивается", async () => {
    const fn = mockFetch({});
    const root = document.createElement("section");
    document.body.appendChild(root);
    await mount(root);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("форма показана", () => {
  it("карта запрашивается без кук, функции — с куками и Bearer", async () => {
    const { fn } = await mounted({}, "tok-1");
    expect(fn.mock.calls[0][0]).toBe(
      `${API}/store/extensions/storefront?store_id=${STAND_STORE_ID}`,
    );
    expect(initOf(fn.mock.calls[0]).credentials).toBe("omit");
    const formInit = initOf(fn.mock.calls[1]);
    expect(fn.mock.calls[1][0]).toBe(
      `${API}/store/extensions/${STAND_EXTENSION_ID}/fn/${STAND_FORM_FN}?store_id=${STAND_STORE_ID}`,
    );
    expect(formInit.method).toBe("POST");
    expect(formInit.credentials).toBe("include");
    expect(formInit.headers.Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(formInit.body ?? "")).toEqual({
      productId: STAND_PRODUCT_ID,
    });
  });

  it("без токена заголовка Authorization нет", async () => {
    const { fn } = await mounted({});
    expect(initOf(fn.mock.calls[1]).headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("форма вместо кнопок покупки, примечание у цены, пункты «Верстака»", async () => {
    const { root } = await mounted({});
    expect(box(root).hidden).toBe(false);
    expect(actions(root).hidden).toBe(true);
    expect(actions(root).style.display).toBe("none");
    const note = root.querySelector(
      "[data-extension-purchase-note]",
    ) as HTMLElement;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe(VERSTAK_FORM_VIEW.priceNote);
    const text = box(root).textContent ?? "";
    [
      "Длина, см",
      "Ширина, см",
      "Порода дерева",
      "Покрытие",
      "Фото комнаты",
      "Нужен замер",
      "Имя",
      "Почта",
      "Телефон",
      "Соцсеть или Telegram",
    ].forEach((title) => expect(text).toContain(title));
    expect(box(root).querySelectorAll(".sf-num input")).toHaveLength(2);
    expect(submitButton(root).textContent).toBe(VERSTAK_FORM_VIEW.submitLabel);
  });

  it("повторный mount на том же контейнере ничего не запрашивает", async () => {
    const { fn, root } = await mounted({});
    const before = fn.mock.calls.length;
    await mount(root);
    expect(fn.mock.calls.length).toBe(before);
  });

  it("выбор варианта подсвечивает его .on и не теряет введённое", async () => {
    const { root } = await mounted({});
    typeInto(root, '[data-xp-field="f40"]', "150");
    (
      root.querySelector(
        '[data-xp-field="f42"][data-xp-value="Орех"]',
      ) as HTMLElement
    ).click();
    const on = root.querySelectorAll(".sf-seg button.on");
    expect(on).toHaveLength(1);
    expect(on[0].textContent).toBe("Орех");
    expect(
      (root.querySelector('[data-xp-field="f40"]') as HTMLInputElement).value,
    ).toBe("150");
  });

  it("пункт с условием появляется, когда условие выполнено", async () => {
    const view: ProductFormView = {
      ...VERSTAK_FORM_VIEW,
      form: {
        version: 2,
        items: [
          {
            id: "kind",
            kind: "field",
            type: "buttons",
            title: "Вид",
            visible: true,
            required: false,
            options: ["A", "B"],
          },
          {
            id: "extra",
            kind: "field",
            type: "text",
            title: "Допполе",
            visible: true,
            required: false,
            condition: { field: "kind", equals: "B" },
          },
          {
            id: "c-email",
            kind: "contact",
            key: "email",
            title: "Почта",
            visible: true,
            required: true,
          },
        ],
      },
    };
    const { root } = await mounted({
      form: { body: { success: true, data: view } },
    });
    expect(box(root).textContent).not.toContain("Допполе");
    (
      root.querySelector(
        '[data-xp-field="kind"][data-xp-value="B"]',
      ) as HTMLElement
    ).click();
    expect(box(root).textContent).toContain("Допполе");
  });

  it("всё, что пришло от расширения, экранируется", async () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    const view: ProductFormView = {
      ...VERSTAK_FORM_VIEW,
      title: evil,
      submitLabel: evil,
      hint: evil,
      priceNote: evil,
      form: {
        version: 2,
        items: [
          {
            id: "t",
            kind: "field",
            type: "text",
            title: evil,
            visible: true,
            required: false,
          },
          {
            id: "s",
            kind: "field",
            type: "select",
            title: "s",
            visible: true,
            required: false,
            options: [evil],
          },
          {
            id: "c-email",
            kind: "contact",
            key: "email",
            title: evil,
            visible: true,
            required: true,
          },
        ],
      },
    };
    const { root } = await mounted({
      form: { body: { success: true, data: view } },
    });
    expect(root.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(box(root).textContent).toContain(evil);
  });
});

describe("отправка: проверка полей", () => {
  it("пустая отправка не уходит запросом и показывает тексты проверки", async () => {
    const { fn, root } = await mounted({});
    submitButton(root).click();
    await flush();
    expect(submitCalls(fn)).toHaveLength(0);
    const errors = Array.from(box(root).querySelectorAll(".err")).map(
      (el) => el.textContent,
    );
    expect(
      errors.filter((text) => text === MESSAGES_V2.textRequired),
    ).toHaveLength(2);
    expect(
      errors.filter((text) => text === MESSAGES_V2.optionRequired),
    ).toHaveLength(2);
    expect(errors).toEqual(
      expect.arrayContaining([
        MESSAGES_V2.nameRequired,
        MESSAGES_V2.emailInvalid,
        MESSAGES_V2.consentRequired,
      ]),
    );
    expect(errors).toHaveLength(7);
  });

  it("рамка .bad у полей с ошибкой, необязательные без ошибок", async () => {
    const { root } = await mounted({});
    submitButton(root).click();
    const bad = (selector: string) =>
      root.querySelector(selector)?.classList.contains("bad");
    expect(bad('[data-xp-field="f40"]')).toBe(true);
    expect(bad('[data-xp-field="f43"]')).toBe(true);
    expect(bad('[data-xp-contact="email"]')).toBe(true);
    expect(bad('[data-xp-contact="phone"]')).toBe(false);
    expect(
      root.querySelector('[data-xp-field="f45"]')?.classList.contains("bad"),
    ).toBeFalsy();
  });

  it("прокрутка к первой ошибке", async () => {
    const { root } = await mounted({});
    submitButton(root).click();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(
      root.querySelector('[data-xp-field="f40"]'),
    );
  });

  it("неверная почта — только текст почты", async () => {
    const { fn, root } = await mounted({});
    fillVerstak(root);
    typeInto(root, '[data-xp-contact="email"]', "not-an-email");
    submitButton(root).click();
    expect(submitCalls(fn)).toHaveLength(0);
    const errors = Array.from(box(root).querySelectorAll(".err")).map(
      (el) => el.textContent,
    );
    expect(errors).toEqual([MESSAGES_V2.emailInvalid]);
  });

  it("введённое после ошибки не пропадает", async () => {
    const { root } = await mounted({});
    typeInto(root, '[data-xp-field="f40"]', "180");
    submitButton(root).click();
    expect(
      (root.querySelector('[data-xp-field="f40"]') as HTMLInputElement).value,
    ).toBe("180");
  });
});

describe("отправка: запрос и ответы", () => {
  it("верная отправка: адрес, Bearer, тело ProductSubmitInput", async () => {
    const { fn } = await submitFilled(
      { submit: { body: { success: true, data: VERSTAK_SENT } } },
      "tok-9",
    );
    const calls = submitCalls(fn);
    expect(calls).toHaveLength(1);
    const init = initOf(calls[0]);
    expect(calls[0][0]).toBe(
      `${API}/store/extensions/${STAND_EXTENSION_ID}/fn/${STAND_SUBMIT_FN}?store_id=${STAND_STORE_ID}`,
    );
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers.Authorization).toBe("Bearer tok-9");
    expect(JSON.parse(init.body ?? "")).toEqual({
      productId: STAND_PRODUCT_ID,
      values: { f40: 180, f41: 90, f42: "Дуб", f43: "Масло", f45: true },
      contacts: {
        name: "Игорь",
        email: "igor@example.ru",
        social: "@igor.belov",
        consent: true,
      },
      files: {},
    });
  });

  it("пока идёт запрос, кнопка недоступна и второй отправки нет", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { fn, root } = await mounted({
      submit: () =>
        gate.then(() => ({ body: { success: true, data: VERSTAK_SENT } })),
    });
    fillVerstak(root);
    submitButton(root).click();
    await flush();
    expect(submitButton(root).disabled).toBe(true);
    submitButton(root).click();
    expect(submitCalls(fn)).toHaveLength(1);
    release();
    await flush();
    expect(root.querySelector("[data-xp-submit]")).toBeNull();
  });

  it("200: вместо формы экран ответа — заголовок, текст, кнопки-ссылки", async () => {
    const { root } = await submitFilled({
      submit: { body: { success: true, data: VERSTAK_SENT } },
    });
    expect(root.querySelector("[data-xp-submit]")).toBeNull();
    expect(box(root).querySelector("b")?.textContent).toBe(VERSTAK_SENT.title);
    expect(box(root).textContent).toContain(VERSTAK_SENT.text);
    const links = Array.from(box(root).querySelectorAll("a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual(
      (VERSTAK_SENT.buttons ?? []).map(({ label, url }) => [label, url]),
    );
    expect(links[0].classList.contains("light")).toBe(false);
    expect(links[1].classList.contains("light")).toBe(true);
  });

  it("200 с javascript:-ссылкой: кнопка не рисуется", async () => {
    const data = {
      title: "Готово",
      buttons: [{ label: "Подвох", url: "javascript:alert(1)" }],
    };
    const { root } = await submitFilled({
      submit: { body: { success: true, data } },
    });
    expect(box(root).querySelector("a")).toBeNull();
    expect(box(root).innerHTML).not.toContain("javascript");
  });

  it("422: текст расширения у кнопки, подсветка issues.fields, форма цела", async () => {
    const message = "Такой размер мы не делаем";
    const { root } = await submitFilled({
      submit: {
        status: 422,
        body: {
          success: false,
          code: "refused",
          message,
          issues: { reason: "size", fields: ["f40", "f41"] },
        },
      },
    });
    expect(box(root).textContent).toContain(message);
    expect(
      root.querySelector('[data-xp-field="f40"]')?.classList.contains("bad"),
    ).toBe(true);
    expect(
      root.querySelector('[data-xp-field="f41"]')?.classList.contains("bad"),
    ).toBe(true);
    expect(
      root.querySelector('[data-xp-field="f43"]')?.classList.contains("bad"),
    ).toBe(false);
    expect(submitButton(root).disabled).toBe(false);
    expect(
      (root.querySelector('[data-xp-field="f40"]') as HTMLInputElement).value,
    ).toBe("180");
  });

  it("400 с полями: подсветка и общий текст, а не служебный", async () => {
    const { root } = await submitFilled({
      submit: {
        status: 400,
        body: {
          success: false,
          code: "invalid_input",
          message: "служебное",
          issues: { fields: ["f41"] },
        },
      },
    });
    expect(
      root.querySelector('[data-xp-field="f41"]')?.classList.contains("bad"),
    ).toBe(true);
    expect(box(root).textContent).toContain(GENERIC_FAILURE);
    expect(box(root).textContent).not.toContain("служебное");
    expect(submitButton(root).disabled).toBe(false);
  });

  it("503: общий текст, форма цела, кнопка снова доступна", async () => {
    const { root } = await submitFilled({
      submit: {
        status: 503,
        body: { success: false, code: "unavailable", message: "внутреннее" },
      },
    });
    expect(box(root).textContent).toContain(GENERIC_FAILURE);
    expect(box(root).textContent).not.toContain("внутреннее");
    expect(submitButton(root).disabled).toBe(false);
    expect(
      (root.querySelector('[data-xp-contact="email"]') as HTMLInputElement)
        .value,
    ).toBe("igor@example.ru");
  });

  it("сеть упала: общий текст, повторная отправка возможна", async () => {
    const { fn, root } = await submitFilled({ submit: "network-error" });
    expect(box(root).textContent).toContain(GENERIC_FAILURE);
    expect(submitButton(root).disabled).toBe(false);
    submitButton(root).click();
    await flush();
    expect(submitCalls(fn)).toHaveLength(2);
  });
});

describe("строка рантайма для темы", () => {
  it("выполняется и выставляет window.__merfyPurchase.mount", () => {
    runRuntimeSource();
    const api = (window as unknown as { __merfyPurchase?: { mount?: unknown } })
      .__merfyPurchase;
    expect(typeof api?.mount).toBe("function");
  });

  it("собранный mount проходит путь от карты до формы", async () => {
    runRuntimeSource();
    mockFetch({ map: MAP_REPLY, form: FORM_REPLY });
    const root = page();
    const api = (
      window as unknown as {
        __merfyPurchase: {
          mount: (r: HTMLElement, o: object) => Promise<void>;
        };
      }
    ).__merfyPurchase;
    await api.mount(root, {
      productId: STAND_PRODUCT_ID,
      storeId: STAND_STORE_ID,
      apiBase: API,
    });
    expect(box(root).hidden).toBe(false);
    expect(box(root).textContent).toContain("Длина, см");
  });
});
