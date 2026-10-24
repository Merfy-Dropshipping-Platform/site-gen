/**
 * @jest-environment jsdom
 *
 * Баг тестировщика 24.10, Б11: обязательное поле «Телефон» при неполном номере
 * («+7 900») показывало «Нужен телефон», будто поле пустое. Пустое поле — по-
 * прежнему «Нужен телефон»; неполный номер — «Проверьте номер: нужно не меньше
 * 10 цифр». Пакет форм отдаёт один текст на оба случая, различает их витрина.
 */
import { mountExtensionPurchase } from "../runtime/extension-purchase";
import {
  STAND_EXTENSION_ID,
  STAND_FORM_FN,
  STAND_PRODUCT_ID,
  STAND_STORE_ID,
  STAND_SUBMIT_FN,
  VERSTAK_FORM_VIEW,
} from "../stand/extension-purchase/stand-data";

const API = "https://gateway.test/api";
const SHORT_PHONE = "Проверьте номер: нужно не меньше 10 цифр";
const EMPTY_PHONE = "Нужен телефон";

const FORM_WITH_REQUIRED_PHONE = {
  ...VERSTAK_FORM_VIEW,
  form: {
    ...VERSTAK_FORM_VIEW.form,
    items: VERSTAK_FORM_VIEW.form.items.map((item) =>
      item.id === "c-phone" ? { ...item, required: true } : item,
    ),
  },
};

function mockFetch() {
  (window as unknown as { fetch: unknown }).fetch = jest.fn((url: string) => {
    const respond = (status: number, body: unknown) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (url.includes("/store/extensions/storefront")) {
      return respond(200, {
        [STAND_EXTENSION_ID]: { product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN } },
      });
    }
    return respond(201, { success: true, data: FORM_WITH_REQUIRED_PHONE });
  });
}

async function mounted(): Promise<HTMLElement> {
  mockFetch();
  const root = document.createElement("section");
  root.innerHTML =
    '<div data-product-actions></div><div class="xp" data-extension-purchase hidden></div>';
  document.body.appendChild(root);
  await mountExtensionPurchase(root, {
    productId: STAND_PRODUCT_ID,
    storeId: STAND_STORE_ID,
    apiBase: API,
  });
  return root;
}

function typePhone(root: HTMLElement, value: string): void {
  const input = root.querySelector('[data-xp-contact="phone"]') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Текст ошибки под полем «Телефон» после нажатия «отправить». */
function phoneError(root: HTMLElement): string {
  (root.querySelector("[data-xp-submit]") as HTMLElement).click();
  const field = root.querySelector('[data-xp-contact="phone"]')?.closest(".sf-f");
  return field?.querySelector(".err")?.textContent ?? "";
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
});

describe("Б11: текст ошибки телефона", () => {
  it("неполный номер — «Проверьте номер: нужно не меньше 10 цифр»", async () => {
    const root = await mounted();
    typePhone(root, "+7 900");
    expect(phoneError(root)).toBe(SHORT_PHONE);
  });

  it("пустое поле — «Нужен телефон»", async () => {
    const root = await mounted();
    expect(phoneError(root)).toBe(EMPTY_PHONE);
  });

  it("поле из пробелов — тоже «Нужен телефон»", async () => {
    const root = await mounted();
    typePhone(root, "   ");
    expect(phoneError(root)).toBe(EMPTY_PHONE);
  });

  it("полный номер ошибки не даёт", async () => {
    const root = await mounted();
    typePhone(root, "+7 900 123-45-67");
    expect(phoneError(root)).toBe("");
  });
});
