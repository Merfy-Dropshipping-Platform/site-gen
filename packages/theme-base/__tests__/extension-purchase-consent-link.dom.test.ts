/**
 * @jest-environment jsdom
 *
 * Баг тестировщика 24.10, Б12: галочка «Даю согласие на обработку персональных
 * данных и файлов» была без ссылки. Теперь слова «обработку персональных
 * данных» ведут на политику конфиденциальности магазина — адрес берётся из
 * того же глобала `__MERFY_POLICY_URLS__`, что у юридической строки чекаута
 * (его ставят сборка витрины и превью). Политика не заполнена или адрес чужой —
 * ссылки нет, текст прежний.
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

const CONSENT = "Даю согласие на обработку персональных данных и файлов";

function mockFetch() {
  (window as unknown as { fetch: unknown }).fetch = jest.fn((url: string) => {
    const respond = (status: number, body: unknown) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (url.includes("/store/extensions/storefront")) {
      return respond(200, {
        [STAND_EXTENSION_ID]: { product: { form: STAND_FORM_FN, submit: STAND_SUBMIT_FN } },
      });
    }
    return respond(201, { success: true, data: VERSTAK_FORM_VIEW });
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
    apiBase: "https://gateway.test/api",
  });
  return root;
}

const consentLabel = (root: HTMLElement): HTMLElement =>
  (root.querySelector("[data-xp-consent]") as HTMLElement).closest("label") as HTMLElement;

const setPolicies = (value: unknown): void => {
  (window as unknown as Record<string, unknown>).__MERFY_POLICY_URLS__ = value;
};

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  delete (window as unknown as Record<string, unknown>).__MERFY_POLICY_URLS__;
});

afterEach(() => {
  delete (window as unknown as { fetch?: unknown }).fetch;
});

describe("Б12: ссылка на политику в согласии", () => {
  it("политика заполнена: «обработку персональных данных» — ссылка на неё", async () => {
    setPolicies({ privacy: "/legal/privacy", tos: "/legal/terms" });
    const root = await mounted();
    const link = consentLabel(root).querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/legal/privacy");
    expect(link.textContent).toBe("обработку персональных данных");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
    expect(consentLabel(root).textContent).toBe(CONSENT);
  });

  it("нажатие на ссылку не переключает галочку", async () => {
    setPolicies({ privacy: "/legal/privacy" });
    const root = await mounted();
    const link = consentLabel(root).querySelector("a") as HTMLAnchorElement;
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect((root.querySelector("[data-xp-consent]") as HTMLInputElement).checked).toBe(false);
  });

  it("в превью конструктора (iframe) переход по ссылке гасится, на витрине — нет", async () => {
    setPolicies({ privacy: "/legal/privacy" });
    const root = await mounted();
    const link = consentLabel(root).querySelector("a") as HTMLAnchorElement;
    const click = () => {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click()).toBe(false);
    const realTop = Object.getOwnPropertyDescriptor(window, "top");
    Object.defineProperty(window, "top", { value: {}, configurable: true });
    try {
      expect(click()).toBe(true);
    } finally {
      if (realTop) Object.defineProperty(window, "top", realTop);
      else delete (window as unknown as Record<string, unknown>).top;
    }
  });

  it("политики нет: текст без ссылки, как раньше", async () => {
    const root = await mounted();
    expect(consentLabel(root).querySelector("a")).toBeNull();
    expect(consentLabel(root).textContent).toBe(CONSENT);
  });

  it("политика конфиденциальности не заполнена (есть только другие): ссылки нет", async () => {
    setPolicies({ tos: "/legal/terms" });
    const root = await mounted();
    expect(consentLabel(root).querySelector("a")).toBeNull();
  });

  it("чужой адрес не принимается: ссылки нет", async () => {
    setPolicies({ privacy: "https://evil.example/privacy" });
    const root = await mounted();
    expect(consentLabel(root).querySelector("a")).toBeNull();
    setPolicies({ privacy: "//evil.example/privacy" });
    const second = await mounted();
    expect(consentLabel(second).querySelector("a")).toBeNull();
  });
});
