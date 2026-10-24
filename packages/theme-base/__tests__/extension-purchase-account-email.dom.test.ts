/**
 * @jest-environment jsdom
 *
 * Баг тестировщика 24.10, Б6: у вошедшего покупателя поле «Почта» в форме
 * заявки было пустым, а введённая чужая почта попадала в кабинет магазина,
 * тогда как письма и «Мои заказы» идут по почте аккаунта. Теперь вошедшему
 * покупателю форма подставляет почту аккаунта (GET /store/auth/me по токену)
 * и не даёт её менять; в отправку почта уходит из аккаунта. Гость вводит
 * почту сам, как раньше.
 */
import { mountExtensionPurchase } from "../runtime/extension-purchase";
import {
  STAND_EXTENSION_ID,
  STAND_FORM_FN,
  STAND_PRODUCT_ID,
  STAND_STORE_ID,
  STAND_SUBMIT_FN,
  VERSTAK_FORM_VIEW,
  VERSTAK_SENT,
} from "../stand/extension-purchase/stand-data";

const API = "https://gateway.test/api";
const TOKEN_KEY = "merfy_customer_token";
const ACCOUNT_EMAIL = "buyer@account.test";

interface FetchInitSeen {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

type MeReply = { status: number; body: unknown } | "network-error";

function mockFetch(me: MeReply) {
  const fn = jest.fn<Promise<unknown>, [string, FetchInitSeen?]>((url) => {
    const respond = (status: number, body: unknown) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (url.includes("/store/extensions/storefront")) {
      return respond(200, {
        [STAND_EXTENSION_ID]: {
          product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN },
        },
      });
    }
    if (url.includes("/store/auth/me")) {
      if (me === "network-error") return Promise.reject(new TypeError("Failed to fetch"));
      return respond(me.status, me.body);
    }
    if (url.includes(`/fn/${STAND_FORM_FN}`)) {
      return respond(201, { success: true, data: VERSTAK_FORM_VIEW });
    }
    return respond(201, { success: true, data: VERSTAK_SENT });
  });
  (window as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

function page(): HTMLElement {
  const root = document.createElement("section");
  root.innerHTML =
    '<div data-product-actions><button type="button">В корзину</button></div>' +
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

const emailInput = (root: HTMLElement) =>
  root.querySelector('[data-xp-contact="email"]') as HTMLInputElement;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function typeInto(root: HTMLElement, selector: string, value: string): void {
  const el = root.querySelector(selector) as HTMLInputElement;
  el.value = value;
  fire(el, "input");
}

/** Заполняет всё, кроме почты (её ставит аккаунт или вводит гость отдельно). */
function fillWithoutEmail(root: HTMLElement): void {
  typeInto(root, '[data-xp-field="f40"]', "180");
  typeInto(root, '[data-xp-field="f41"]', "90");
  (
    root.querySelector('[data-xp-field="f42"][data-xp-value="Дуб"]') as HTMLElement
  ).click();
  const coating = root.querySelector('[data-xp-field="f43"]') as HTMLSelectElement;
  coating.value = "Масло";
  fire(coating, "change");
  (root.querySelector('[data-xp-field="f45"]') as HTMLElement).click();
  typeInto(root, '[data-xp-contact="name"]', "Игорь");
  typeInto(root, '[data-xp-contact="social"]', "@igor.belov");
  (root.querySelector("[data-xp-consent]") as HTMLElement).click();
}

const submitBody = (fn: ReturnType<typeof mockFetch>) => {
  const call = fn.mock.calls.find(([url]) => url.includes(`/fn/${STAND_SUBMIT_FN}`));
  return JSON.parse(call?.[1]?.body ?? "{}") as { contacts: { email?: string } };
};

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
  jest.restoreAllMocks();
});

describe("Б6: почта вошедшего покупателя", () => {
  it("вошёл: поле «Почта» заполнено почтой аккаунта и только для чтения", async () => {
    localStorage.setItem(TOKEN_KEY, "token-1");
    const fn = mockFetch({ status: 200, body: { success: true, data: { customer: { email: ACCOUNT_EMAIL } } } });
    const root = page();
    await mount(root);
    expect(emailInput(root).value).toBe(ACCOUNT_EMAIL);
    expect(emailInput(root).readOnly).toBe(true);
    const meCall = fn.mock.calls.find(([url]) => url.includes("/store/auth/me"));
    expect(meCall?.[0]).toBe(`${API}/store/auth/me`);
    expect(meCall?.[1]?.headers?.Authorization).toBe("Bearer token-1");
  });

  it("профиль без обёртки customer тоже читается", async () => {
    localStorage.setItem(TOKEN_KEY, "token-1");
    mockFetch({ status: 200, body: { success: true, data: { email: ACCOUNT_EMAIL } } });
    const root = page();
    await mount(root);
    expect(emailInput(root).value).toBe(ACCOUNT_EMAIL);
  });

  it("форма уходит без ввода почты, в отправке — почта аккаунта", async () => {
    localStorage.setItem(TOKEN_KEY, "token-1");
    const fn = mockFetch({ status: 200, body: { success: true, data: { customer: { email: ACCOUNT_EMAIL } } } });
    const root = page();
    await mount(root);
    fillWithoutEmail(root);
    (root.querySelector("[data-xp-submit]") as HTMLElement).click();
    await flush();
    expect(submitBody(fn).contacts.email).toBe(ACCOUNT_EMAIL);
  });

  it("гость: токена нет, профиль не запрашивается, почта вводится вручную", async () => {
    const fn = mockFetch({ status: 401, body: {} });
    const root = page();
    await mount(root);
    expect(fn.mock.calls.some(([url]) => url.includes("/store/auth/me"))).toBe(false);
    expect(emailInput(root).value).toBe("");
    expect(emailInput(root).readOnly).toBe(false);
  });

  it("токен недействителен (401): поле свободное, форма работает как у гостя", async () => {
    localStorage.setItem(TOKEN_KEY, "stale");
    mockFetch({ status: 401, body: { success: false } });
    const root = page();
    await mount(root);
    expect(emailInput(root).value).toBe("");
    expect(emailInput(root).readOnly).toBe(false);
  });

  it("сеть недоступна при запросе профиля: форма всё равно показана, почта свободная", async () => {
    localStorage.setItem(TOKEN_KEY, "token-1");
    mockFetch("network-error");
    const root = page();
    await mount(root);
    expect(emailInput(root).readOnly).toBe(false);
    expect((root.querySelector("[data-extension-purchase]") as HTMLElement).hidden).toBe(false);
  });
});
