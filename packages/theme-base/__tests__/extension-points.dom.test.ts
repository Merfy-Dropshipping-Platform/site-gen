/**
 * @jest-environment jsdom
 *
 * PR-19 «Три точки расширений на витрине» — поведенческие тесты
 * `mountExtensionPoint` (импортируется напрямую — та же функция, что
 * склеивается строкой в EXTENSION_POINTS_RUNTIME_SOURCE, см. комментарий в
 * runtime/extension-points.ts).
 */
import {
  mountExtensionPoint,
  extensionQueryStorageKey,
  captureQueryParams,
  substituteExtensionText,
  buildExtensionInputBody,
} from "../runtime/extension-points";

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function setConfig(shopId = "shop1", apiUrl = "https://gateway.test/api") {
  (window as any).__MERFY_CONFIG__ = { shopId, apiUrl };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.body.innerHTML = "";
  setConfig();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (window as any).__MERFY_CONFIG__;
  delete (window as any).fetch;
  delete (window as any).cartStore;
});

describe("чистые хелперы", () => {
  it("substituteExtensionText: подставляет {key} из view, отсутствующий ключ → пусто", () => {
    expect(
      substituteExtensionText("Баланс: {balance} — {missing}", {
        balance: 500,
      }),
    ).toBe("Баланс: 500 — ");
  });

  it("captureQueryParams + extensionQueryStorageKey: разбор query и ключ localStorage", () => {
    expect(captureQueryParams("?ref=XYZ&a=b%20c")).toEqual({
      ref: "XYZ",
      a: "b c",
    });
    expect(extensionQueryStorageKey("ref")).toBe("merfy:ext:query:ref");
  });

  it("buildExtensionInputBody: current побеждает, fromQuery — фолбэк, типы приводятся", () => {
    const schema = {
      enabled: "boolean",
      amount: "int?",
      ref: { type: "string", fromQuery: "ref" },
    };
    const body = buildExtensionInputBody(
      schema,
      { enabled: true, amount: "150" },
      { [extensionQueryStorageKey("ref")]: "XYZ" },
    );
    expect(body).toEqual({ enabled: true, amount: 150, ref: "XYZ" });
  });
});

describe("mountExtensionPoint — общее", () => {
  it("без storeId — ничего не делает (fetch не вызывается)", async () => {
    const fetchMock = jest.fn();
    (window as any).fetch = fetchMock;
    const el = document.createElement("div");
    await mountExtensionPoint(el, { point: "cart", storeId: "" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.innerHTML).toBe("");
  });

  it("без включённых расширений для точки — el остаётся пустым", async () => {
    const fetchMock = jest.fn((_url?: string) =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      }),
    );
    (window as any).fetch = fetchMock;
    const el = document.createElement("div");
    await mountExtensionPoint(el, { point: "cart", storeId: "shop1" });
    expect(el.innerHTML).toBe("");
    expect(el.children.length).toBe(0);
  });

  it("упавший запрос описаний — тихо, без исключений, el пуст", async () => {
    (window as any).fetch = jest.fn((_url?: string) =>
      Promise.reject(new Error("network down")),
    );
    const el = document.createElement("div");
    await expect(
      mountExtensionPoint(el, { point: "cart", storeId: "shop1" }),
    ).resolves.toBeUndefined();
    expect(el.innerHTML).toBe("");
  });

  it("запрос описаний кладёт GET на /store/extensions/storefront?store_id=<id>, кэш sessionStorage 60с", async () => {
    const fetchMock = jest.fn((_url?: string) =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      }),
    );
    (window as any).fetch = fetchMock;
    const el = document.createElement("div");
    await mountExtensionPoint(el, { point: "cart", storeId: "shop1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe(
      "https://gateway.test/api/store/extensions/storefront?store_id=shop1",
    );

    // второй монт той же точки в течение 60с — кэш, fetch НЕ вызывается снова
    const el2 = document.createElement("div");
    await mountExtensionPoint(el2, { point: "checkout", storeId: "shop1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("точка cart — note с подстановкой", () => {
  const descriptions = {
    ext1: {
      cart: {
        note: {
          from: "view",
          text: "Начислим {points} бонусов",
          when: "points",
        },
      },
    },
  };

  function fetchImpl(url: string) {
    if (/\/store\/extensions\/storefront/.test(url)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: descriptions }),
      });
    }
    if (/\/store\/carts\/cart_1/.test(url)) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: { extensions: { ext1: { view: { points: 42 } } } },
        }),
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  }

  it("рендерит note с подставленным значением из view корзины", async () => {
    (window as any).fetch = jest.fn(fetchImpl);
    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "cart",
      storeId: "shop1",
      cartId: "cart_1",
    });
    await flush();
    expect(el.textContent).toContain("Начислим 42 бонусов");
  });

  it("when-ключ пустой/0 в view — note не рендерится", async () => {
    (window as any).fetch = jest.fn((url: string) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: { extensions: { ext1: { view: { points: 0 } } } },
        }),
      });
    });
    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "cart",
      storeId: "shop1",
      cartId: "cart_1",
    });
    await flush();
    expect(el.innerHTML).toBe("");
  });

  it("нет cartId (корзина не создана) — el пуст, без запроса корзины", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      throw new Error("не должен ходить в корзину без cartId");
    });
    (window as any).fetch = fetchMock;
    const el = document.createElement("div");
    await mountExtensionPoint(el, { point: "cart", storeId: "shop1" });
    await flush();
    expect(el.innerHTML).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("точка checkout — control", () => {
  const descriptions = {
    ext1: {
      checkout: {
        input: { useBonus: "boolean", points: "int?" },
        control: {
          kind: "toggle",
          key: "bonus",
          label: "Списать бонусы",
          enabledKey: "useBonus",
          amount: {
            key: "points",
            label: "Сколько бонусов",
            maxKey: "maxRedeem",
          },
          unavailable: "Войдите, чтобы списать бонусы",
        },
      },
    },
  };

  it("control шлёт PUT .../extensions/:id?store_id=<id> с корректным телом", async () => {
    const fetchMock = jest.fn((url: string, init?: any) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      if (/\/store\/carts\/cart_1\?/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              extensions: { ext1: { input: {}, view: { maxRedeem: 300 } } },
            },
          }),
        });
      }
      if (
        /\/store\/carts\/cart_1\/extensions\/ext1\?store_id=shop1$/.test(url) &&
        init?.method === "PUT"
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { extensionDiscountCents: 5000 } }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    const syncFromCartData = jest.fn();
    (window as any).cartStore = { syncFromCartData };

    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "checkout",
      storeId: "shop1",
      cartId: "cart_1",
    });
    await flush();

    const toggle = el.querySelector("[data-ext-toggle]") as HTMLInputElement;
    expect(toggle).toBeTruthy();
    const amount = el.querySelector("[data-ext-amount]") as HTMLInputElement;
    amount.value = "120";
    toggle.checked = true;

    let discountDetail: any = null;
    document.addEventListener(
      "checkout:extension-discount-changed",
      (e: any) => {
        discountDetail = e.detail;
      },
    );
    toggle.dispatchEvent(new Event("change"));
    await flush();

    const putCall = fetchMock.mock.calls.find(
      (c) =>
        /\/extensions\/ext1\?store_id=shop1$/.test(String(c[0])) &&
        c[1]?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall![1].body)).toEqual({
      useBonus: true,
      points: 120,
    });
    expect(syncFromCartData).toHaveBeenCalledWith({
      extensionDiscountCents: 5000,
    });
    expect(discountDetail).toEqual({ discountCents: 5000 });
  });

  it("без view для расширения (гость/не инициализирована) — control-а нет, показан unavailable", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      if (/\/store\/carts\/cart_1/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { extensions: {} } }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;
    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "checkout",
      storeId: "shop1",
      cartId: "cart_1",
    });
    await flush();

    expect(el.querySelector("[data-ext-toggle]")).toBeNull();
    const unavailable = el.querySelector("[data-ext-unavailable]");
    expect(unavailable).toBeTruthy();
    expect(unavailable!.textContent).toBe("Войдите, чтобы списать бонусы");
  });

  it("персистентная extensionDiscountCents с сервера — событие летит сразу при монтировании", async () => {
    (window as any).fetch = jest.fn((url: string) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            extensions: {
              ext1: { input: { useBonus: true }, view: { maxRedeem: 300 } },
            },
            extensionDiscountCents: 7000,
          },
        }),
      });
    });
    let discountDetail: any = null;
    document.addEventListener(
      "checkout:extension-discount-changed",
      (e: any) => {
        discountDetail = e.detail;
      },
    );
    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "checkout",
      storeId: "shop1",
      cartId: "cart_1",
    });
    await flush();
    expect(discountDetail).toEqual({ discountCents: 7000 });
    // и стартовое состояние тумблера уже отражает input с сервера
    const toggle = el.querySelector("[data-ext-toggle]") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });
});

describe("точка account", () => {
  const descriptions = {
    ext1: {
      account: {
        title: "Бонусная программа",
        source: "profile",
        fields: [{ key: "balance", label: "Баланс", kind: "number" }],
        copy: { key: "referralLink", label: "Скопировать ссылку" },
        form: {
          fn: "redeemCode",
          fields: [
            { key: "code", input: "text", label: "Код", required: true },
          ],
        },
      },
    },
  };

  it("без authToken (гость) — ничего не рендерится, fn не вызывается", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      throw new Error("fn не должен вызываться без токена");
    });
    (window as any).fetch = fetchMock;
    const el = document.createElement("div");
    await mountExtensionPoint(el, { point: "account", storeId: "shop1" });
    await flush();
    expect(el.innerHTML).toBe("");
  });

  it("источник данных запрашивается через fn/<source> с Bearer, поля рендерятся", async () => {
    const fetchMock = jest.fn((url: string, init?: any) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      if (/\/store\/extensions\/ext1\/fn\/profile\?store_id=shop1$/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { balance: 500, referralLink: "https://ref.test/x" },
          }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;

    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "account",
      storeId: "shop1",
      authToken: "tok_abc",
    });
    await flush();

    const sourceCall = fetchMock.mock.calls.find((c) =>
      /\/fn\/profile\?/.test(String(c[0])),
    );
    expect(sourceCall![1].headers.Authorization).toBe("Bearer tok_abc");
    const field = el.querySelector('[data-ext-field="balance"]');
    expect(field!.textContent).toBe("500");
  });

  it("форма кабинета шлёт POST fn/<form.fn> с полями формы и перечитывает source", async () => {
    let profileCalls = 0;
    const fetchMock = jest.fn((url: string, init?: any) => {
      if (/\/store\/extensions\/storefront/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, data: descriptions }),
        });
      }
      if (/\/fn\/profile\?/.test(url)) {
        profileCalls += 1;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { balance: profileCalls === 1 ? 500 : 650 },
          }),
        });
      }
      if (/\/fn\/redeemCode\?/.test(url)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { ok: true } }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    (window as any).fetch = fetchMock;

    const el = document.createElement("div");
    await mountExtensionPoint(el, {
      point: "account",
      storeId: "shop1",
      authToken: "tok_abc",
    });
    await flush();

    const codeInput = el.querySelector(
      '[data-ext-form-field="code"]',
    ) as HTMLInputElement;
    codeInput.value = "SUMMER2026";
    const form = el.querySelector("[data-ext-form]") as HTMLFormElement;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await flush();

    const fnCall = fetchMock.mock.calls.find((c) =>
      /\/fn\/redeemCode\?store_id=shop1$/.test(String(c[0])),
    );
    expect(fnCall).toBeTruthy();
    expect(JSON.parse(fnCall![1].body)).toEqual({ code: "SUMMER2026" });
    // после успеха source перечитан
    expect(profileCalls).toBe(2);
    expect(el.querySelector('[data-ext-field="balance"]')!.textContent).toBe(
      "650",
    );
  });
});

describe("fromQuery — захват параметра на любой странице", () => {
  it("сохраняет query-параметр в localStorage при монтировании точки", async () => {
    (window as any).fetch = jest.fn((_url?: string) =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      }),
    );
    (window as any).history.replaceState(null, "", "/?ref=FRIEND42");
    const el = document.createElement("div");
    await mountExtensionPoint(el, { point: "account", storeId: "shop1" });
    expect(localStorage.getItem(extensionQueryStorageKey("ref"))).toBe(
      "FRIEND42",
    );
  });
});
