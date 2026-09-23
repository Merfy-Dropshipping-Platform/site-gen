/**
 * extension-points — общий клиентский рантайм трёх точек расширений витрины
 * (PR-19): «Корзина», «Оформление заказа», «Личный кабинет».
 *
 * ЧТО ЭТО. Ядро и шлюз параллельно вводят «расширения» (extensions) —
 * мерчант включает готовый модуль расширения, и он
 * появляется в трёх местах storefront БЕЗ единого слова о своём домене в
 * этом пакете (гард словаря — `src/__tests__/extension-vocabulary.spec.ts`).
 * Весь текст/состав приходит с бэка (`GET /store/extensions/storefront`);
 * этот файл только РИСУЕТ словарь описания и ходит по контракту.
 *
 * ПОЧЕМУ СТРОКОЙ (`EXTENSION_POINTS_RUNTIME_SOURCE`). Блоки theme-base
 * хёдрируются ТОЛЬКО через `<script is:inline set:html={…}>` — обычный
 * `<script>import …</script>` даёт на собранной витрине 404
 * (`/app/packages/…/X.astro?astro&type=script`, см. комментарий у
 * `VARIANT_CHIP_EQUALIZE_SOURCE` в `blocks/Product/Product.astro`). Копия
 * логики строкой рядом с TS-оригиналом расходится молча — здесь этого нет:
 * `EXTENSION_POINTS_RUNTIME_SOURCE` собран из `.toString()` РОВНО тех же
 * function-деклараций, что экспортированы ниже и исполняются в тестах
 * (`__tests__/extension-points.dom.test.ts`, `import { mountExtensionPoint }`
 * напрямую — без `new Function`). Один текст на рантайм и на проверку.
 *
 * Три точки:
 *   cart      — `CartTotals.astro`      `[data-ext-point="cart"]`
 *   checkout  — `CheckoutTotals.astro`  `[data-ext-point="checkout"]`
 *   account   — `AccountLayout.astro`   `[data-ext-point="account"]`
 * (`CheckoutSubmit` точки не несёт — только читает `extensionDiscountCents`
 * через событие `checkout:extension-discount-changed`, см. `total.ts`.)
 */

export type ExtensionPointKind = "cart" | "checkout" | "account";

export interface MountExtensionPointOptions {
  point: ExtensionPointKind;
  /** `store_id` контракта — обычно `window.__MERFY_CONFIG__.shopId`. */
  storeId: string;
  /** Нужен для `cart`/`checkout`; берётся из `localStorage['merfy:cartId']`. */
  cartId?: string;
  /** Нужен для `account`; берётся из `localStorage['merfy_customer_token']`. */
  authToken?: string;
  /** По умолчанию `window.__MERFY_CONFIG__.apiUrl`. */
  apiBase?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Чистые хелперы — экспортированы для юнит-тестов И встроены строкой в
 * EXTENSION_POINTS_RUNTIME_SOURCE (см. низ файла). ВСЕ — `function name(…)`
 * деклараций (не `const`/arrow): при конкатенации строк объявления
 * поднимаются (hoisting) в общую область видимости инжектированного скрипта.
 * ────────────────────────────────────────────────────────────────────────*/

/** `merfy:ext:query:<param>` — ключ localStorage для захваченного query-параметра. */
export function extensionQueryStorageKey(param: string): string {
  return "merfy:ext:query:" + param;
}

/** Разбор `location.search` в объект — без нового URLSearchParams (совместимо с inline-строкой). */
export function captureQueryParams(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!search) return out;
  const qs = search.charAt(0) === "?" ? search.slice(1) : search;
  if (!qs) return out;
  qs.split("&").forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf("=");
    const rawKey = idx === -1 ? pair : pair.slice(0, idx);
    const rawVal = idx === -1 ? "" : pair.slice(idx + 1).replace(/\+/g, " ");
    let key = "";
    let val = "";
    try {
      key = decodeURIComponent(rawKey);
    } catch {
      key = rawKey;
    }
    try {
      val = decodeURIComponent(rawVal);
    } catch {
      val = rawVal;
    }
    if (key) out[key] = val;
  });
  return out;
}

/** `{key}` → `String(view[key])`; отсутствующий/пустой ключ → ''. */
export function substituteExtensionText(
  text: string,
  view: Record<string, unknown> | null | undefined,
): string {
  if (!text) return "";
  return text.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = view ? view[key] : undefined;
    return v === undefined || v === null ? "" : String(v);
  });
}

/** `note.when` — ключ `view`, при пустом/0/undefined значении note не показывается. */
export function shouldShowExtensionNote(
  note: { text?: string; when?: string } | null | undefined,
  view: Record<string, unknown> | null | undefined,
): boolean {
  if (!note || !note.text) return false;
  if (note.when) {
    const v = view ? view[note.when] : undefined;
    if (!v) return false;
  }
  return true;
}

/**
 * Приведение типа поля `checkout.input` контракта. `type` приходит с бэка
 * произвольной строкой ("boolean" | "int" | "int?" | "string" | "string?" —
 * известные значения из контракта); неизвестное значение падает в `default`
 * и возвращается как есть.
 */
export function coerceExtensionInputValue(type: string, raw: unknown): unknown {
  switch (type) {
    case "boolean":
      return !!raw;
    case "int": {
      const n = parseInt(String(raw), 10);
      return isFinite(n) ? n : 0;
    }
    case "int?": {
      if (raw === "" || raw === undefined || raw === null) return undefined;
      const n = parseInt(String(raw), 10);
      return isFinite(n) ? n : undefined;
    }
    case "string":
      return raw === undefined || raw === null ? "" : String(raw);
    case "string?": {
      const s = raw === undefined || raw === null ? "" : String(raw);
      return s === "" ? undefined : s;
    }
    default:
      return raw;
  }
}

/** `&`/`<`/`>`/`"`/`'` → сущности — для текста, который идёт в `innerHTML`. */
export function escapeExtensionHtml(raw: unknown): string {
  const s = raw === undefined || raw === null ? "" : String(raw);
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export interface ExtensionCheckoutInputDescriptor {
  type?: string;
  fromQuery?: string;
}

/**
 * Тело `PUT …/extensions/:id` — по схеме `checkout.input` контракта.
 * `current` — то, что явно выставил покупатель (enabledKey/amount.key);
 * `capturedQuery` — карта `localStorage` (`merfy:ext:query:<param>` → значение)
 * для полей с `fromQuery`, если покупатель их ещё не трогал руками.
 */
export function buildExtensionInputBody(
  schema:
    | Record<string, string | ExtensionCheckoutInputDescriptor>
    | null
    | undefined,
  current: Record<string, unknown>,
  capturedQuery: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!schema) return out;
  Object.keys(schema).forEach((key) => {
    const desc = schema[key];
    const type = typeof desc === "string" ? desc : desc && desc.type;
    const fromQuery =
      typeof desc === "object" && desc ? desc.fromQuery : undefined;
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      out[key] = coerceExtensionInputValue(type || "string", current[key]);
      return;
    }
    if (fromQuery) {
      const stored = capturedQuery[extensionQueryStorageKey(fromQuery)];
      if (stored !== undefined) {
        out[key] = coerceExtensionInputValue(type || "string", stored);
      }
    }
  });
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
 * mountExtensionPoint — главная точка входа. Полностью самодостаточна (все
 * обращения — к function-декларациям выше, которые есть в области видимости
 * и здесь через обычный module scope, и в EXTENSION_POINTS_RUNTIME_SOURCE
 * через hoisting внутри одного склеенного скрипта).
 * ────────────────────────────────────────────────────────────────────────*/

interface StorefrontNoteConfig {
  from?: string;
  text: string;
  when?: string;
}
interface StorefrontControlConfig {
  kind: "toggle";
  key: string;
  label: string;
  enabledKey: string;
  amount?: { key: string; label: string; maxKey?: string };
  note?: string;
  unavailable: string;
}
interface StorefrontCartConfig {
  note?: StorefrontNoteConfig;
}
interface StorefrontCheckoutConfig {
  input?: Record<string, string | ExtensionCheckoutInputDescriptor>;
  control?: StorefrontControlConfig;
  note?: StorefrontNoteConfig;
}
interface StorefrontAccountField {
  key: string;
  label: string;
  kind: "number" | "tag" | "date" | "text";
}
interface StorefrontAccountConfig {
  title?: string;
  source: string;
  fields?: StorefrontAccountField[];
  list?: { source: string; columns: string[] };
  copy?: { key: string; label: string };
  form?: {
    fn: string;
    fields: Array<{
      key: string;
      input: "date" | "text" | "number" | "checkbox";
      label: string;
      required?: boolean;
    }>;
  };
}
interface StorefrontExtensionEntry {
  cart?: StorefrontCartConfig;
  checkout?: StorefrontCheckoutConfig;
  account?: StorefrontAccountConfig;
}
type StorefrontDescriptions = Record<string, StorefrontExtensionEntry>;

/**
 * Точка входа рантайма. `el` — пустой `[data-ext-point]` контейнер; функция
 * тихо ничего не рисует при пустом `storeId`, упавшем запросе или отсутствии
 * включённых расширений для этой точки (без console.error).
 */
export function mountExtensionPoint(
  pointEl: HTMLElement | null | undefined,
  opts: MountExtensionPointOptions,
): Promise<void> {
  if (!pointEl || !opts || !opts.point) return Promise.resolve();
  const el: HTMLElement = pointEl;
  const point = opts.point;
  const storeId = opts.storeId || "";
  if (!storeId) return Promise.resolve();
  const w =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, any>)
      : ({} as Record<string, any>);
  const apiBase =
    opts.apiBase ||
    (w.__MERFY_CONFIG__ && w.__MERFY_CONFIG__.apiUrl) ||
    "https://gateway.merfy.ru/api";
  const cartId = opts.cartId || "";
  const authToken = opts.authToken || "";

  // fromQuery: захват query-параметров ТЕКУЩЕЙ страницы — работает на любой
  // странице сайта (не только на cart/checkout), потому что каждая точка при
  // монтировании прогоняет этот шаг. Захваченное живёт до перезаписи (сессия
  // покупателя может дойти до чекаута через несколько переходов).
  try {
    if (typeof location !== "undefined" && location.search) {
      const captured = captureQueryParams(location.search);
      Object.keys(captured).forEach((k) => {
        try {
          localStorage.setItem(extensionQueryStorageKey(k), captured[k]);
        } catch {
          /* localStorage недоступен (приватный режим) — молча пропускаем */
        }
      });
    }
  } catch {
    /* location недоступен в тестовом окружении без window — молча пропускаем */
  }

  function readCapturedQuery(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("merfy:ext:query:") === 0)
          out[k] = localStorage.getItem(k) || "";
      }
    } catch {
      /* noop */
    }
    return out;
  }

  function storefrontCacheKey(): string {
    return "merfy:ext:storefront:" + storeId;
  }

  function fetchStorefrontDescriptions(): Promise<StorefrontDescriptions> {
    try {
      const raw = sessionStorage.getItem(storefrontCacheKey());
      if (raw) {
        const parsed = JSON.parse(raw) as {
          at?: number;
          data?: StorefrontDescriptions;
        };
        if (
          parsed &&
          typeof parsed.at === "number" &&
          Date.now() - parsed.at < 60000 &&
          parsed.data
        ) {
          return Promise.resolve(parsed.data);
        }
      }
    } catch {
      /* повреждённый кэш — пойдём в сеть */
    }
    return fetch(
      apiBase +
        "/store/extensions/storefront?store_id=" +
        encodeURIComponent(storeId),
      {
        credentials: "omit",
      },
    )
      .then((r) => (r && r.ok ? r.json() : null))
      .then(
        (json: { success?: boolean; data?: StorefrontDescriptions } | null) => {
          const data = (json && json.success && json.data) || {};
          try {
            sessionStorage.setItem(
              storefrontCacheKey(),
              JSON.stringify({ at: Date.now(), data }),
            );
          } catch {
            /* noop */
          }
          return data;
        },
      )
      .catch(() => ({}) as StorefrontDescriptions);
  }

  function fetchCart(): Promise<{
    extensions?: Record<
      string,
      { input?: Record<string, unknown>; view?: Record<string, unknown> }
    >;
    extensionDiscountCents?: number;
  } | null> {
    if (!cartId) return Promise.resolve(null);
    return fetch(
      apiBase +
        "/store/carts/" +
        encodeURIComponent(cartId) +
        "?store_id=" +
        encodeURIComponent(storeId),
      { credentials: "include" },
    )
      .then((r) => (r && r.ok ? r.json() : null))
      .then((json: { data?: any } | null) => (json && json.data) || null)
      .catch(() => null);
  }

  function callFn(
    extensionId: string,
    name: string | undefined,
    body: Record<string, unknown>,
  ): Promise<any> {
    if (!name || !authToken) return Promise.resolve(null);
    return fetch(
      apiBase +
        "/store/extensions/" +
        encodeURIComponent(extensionId) +
        "/fn/" +
        encodeURIComponent(name) +
        "?store_id=" +
        encodeURIComponent(storeId),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + authToken,
        },
        credentials: "include",
        body: JSON.stringify(body || {}),
      },
    )
      .then((r) => (r && r.ok ? r.json() : null))
      .then((json: { data?: any } | null) => (json && json.data) || null)
      .catch(() => null);
  }

  function dispatchExtensionDiscount(cents: number): void {
    try {
      document.dispatchEvent(
        new CustomEvent("checkout:extension-discount-changed", {
          detail: { discountCents: cents || 0 },
        }),
      );
    } catch {
      /* noop */
    }
  }

  function renderCartPoint(
    descriptions: StorefrontDescriptions,
  ): Promise<void> {
    const entries = Object.keys(descriptions).filter(
      (id) => descriptions[id] && descriptions[id].cart,
    );
    if (!entries.length) return Promise.resolve();
    return fetchCart().then((cart) => {
      const views = (cart && cart.extensions) || {};
      let html = "";
      entries.forEach((id) => {
        const cfg = descriptions[id].cart as StorefrontCartConfig;
        const note = cfg.note;
        const view = (views[id] && views[id].view) || {};
        if (!note || !shouldShowExtensionNote(note, view)) return;
        const text = substituteExtensionText(note.text, view);
        if (!text) return;
        html +=
          '<div class="text-[length:var(--size-small)] text-[rgb(var(--color-muted))] [font-family:var(--font-body)]" data-ext-note data-ext-id="' +
          escapeExtensionHtml(id) +
          '">' +
          escapeExtensionHtml(text) +
          "</div>";
      });
      if (html) el.innerHTML = html;
    });
  }

  function renderCheckoutEntryHtml(
    id: string,
    cfg: StorefrontCheckoutConfig,
    ext:
      | { input?: Record<string, unknown>; view?: Record<string, unknown> }
      | undefined,
  ): string {
    const view = (ext && ext.view) || null;
    const input = (ext && ext.input) || {};
    let out =
      '<div class="flex flex-col gap-2" data-ext-entry data-ext-id="' +
      escapeExtensionHtml(id) +
      '">';
    if (cfg.note && view && shouldShowExtensionNote(cfg.note, view)) {
      const text = substituteExtensionText(cfg.note.text, view);
      if (text) {
        out +=
          '<div class="text-[length:var(--size-small)] text-[rgb(var(--color-muted))] [font-family:var(--font-body)]" data-ext-note>' +
          escapeExtensionHtml(text) +
          "</div>";
      }
    }
    const control = cfg.control;
    if (control) {
      if (!view) {
        out +=
          '<div class="text-[length:var(--size-small)] text-[rgb(var(--color-muted))] [font-family:var(--font-body)]" data-ext-unavailable>' +
          escapeExtensionHtml(control.unavailable || "") +
          "</div>";
      } else {
        const checked = !!input[control.enabledKey];
        out +=
          '<label class="flex items-center gap-2 text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]" data-ext-control>' +
          '<input type="checkbox" data-ext-toggle' +
          (checked ? " checked" : "") +
          " />" +
          "<span>" +
          escapeExtensionHtml(control.label || "") +
          "</span>" +
          "</label>";
        if (control.amount) {
          const amountVal = input[control.amount.key];
          const maxVal = control.amount.maxKey
            ? view[control.amount.maxKey]
            : undefined;
          out +=
            '<input type="number" inputmode="numeric" data-ext-amount placeholder="' +
            escapeExtensionHtml(control.amount.label || "") +
            '"' +
            (amountVal !== undefined && amountVal !== null
              ? ' value="' + escapeExtensionHtml(amountVal) + '"'
              : "") +
            (maxVal !== undefined && maxVal !== null
              ? ' max="' + escapeExtensionHtml(maxVal) + '"'
              : "") +
            (checked ? "" : " disabled") +
            ' class="text-[length:var(--size-body)] text-[rgb(var(--color-text))] bg-[rgb(var(--color-input-bg))] border border-[rgb(var(--color-input-border))] rounded-[var(--radius-input)] px-2 py-1" />';
        }
        if (control.note) {
          const noteText = substituteExtensionText(control.note, view);
          if (noteText) {
            out +=
              '<div class="text-[length:var(--size-tiny)] text-[rgb(var(--color-muted))] [font-family:var(--font-body)]" data-ext-control-note>' +
              escapeExtensionHtml(noteText) +
              "</div>";
          }
        }
      }
    }
    out += "</div>";
    return out;
  }

  function wireCheckoutEntry(
    wrap: Element,
    id: string,
    cfg: StorefrontCheckoutConfig,
    ext:
      | { input?: Record<string, unknown>; view?: Record<string, unknown> }
      | undefined,
    capturedQuery: Record<string, string>,
  ): void {
    const control = cfg.control;
    if (!control || !ext || !ext.view) return; // unavailable — нечего подключать
    // Приведение обязательно: без него querySelector падает на дефолтный
    // параметр generic (`Element`), и `.checked`/`.value` ниже не
    // скомпилируются (ts-jest реально это ловит — TS2339). ESLint здесь
    // ложно считает assertion лишним, потому что сам же `as` подсказывает
    // generic-выводу тип — без него подсказки нет.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const toggle = wrap.querySelector(
      "[data-ext-toggle]",
    ) as HTMLInputElement | null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const amount = wrap.querySelector(
      "[data-ext-amount]",
    ) as HTMLInputElement | null;
    if (!toggle) return;

    function submit(): void {
      if (!cartId) return;
      const current: Record<string, unknown> = {};
      current[control!.enabledKey] = toggle!.checked;
      if (control!.amount && amount && amount.value !== "") {
        current[control!.amount.key] = amount.value;
      }
      const body = buildExtensionInputBody(cfg.input, current, capturedQuery);
      fetch(
        apiBase +
          "/store/carts/" +
          encodeURIComponent(cartId) +
          "/extensions/" +
          encodeURIComponent(id) +
          "?store_id=" +
          encodeURIComponent(storeId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      )
        .then((r) => (r && r.ok ? r.json() : null))
        .then((json: { data?: any } | null) => {
          const data = json && json.data;
          if (!data) return;
          if (
            w.cartStore &&
            typeof w.cartStore.syncFromCartData === "function"
          ) {
            w.cartStore.syncFromCartData(data);
          }
          try {
            document.dispatchEvent(new CustomEvent("cart:updated"));
          } catch {
            /* noop */
          }
          dispatchExtensionDiscount(data.extensionDiscountCents || 0);
        })
        .catch(() => {
          /* тихо — заявка на рулях 4: без ошибок в консоли */
        });
    }

    toggle.addEventListener("change", () => {
      if (amount) amount.disabled = !toggle.checked;
      submit();
    });
    if (amount) {
      amount.addEventListener("change", () => {
        if (toggle.checked) submit();
      });
    }
  }

  function renderCheckoutPoint(
    descriptions: StorefrontDescriptions,
  ): Promise<void> {
    const entries = Object.keys(descriptions).filter(
      (id) => descriptions[id] && descriptions[id].checkout,
    );
    if (!entries.length) return Promise.resolve();
    return fetchCart().then((cart) => {
      const extensionsView = (cart && cart.extensions) || {};
      if (
        cart &&
        typeof cart.extensionDiscountCents === "number" &&
        cart.extensionDiscountCents > 0
      ) {
        dispatchExtensionDiscount(cart.extensionDiscountCents);
      }
      const capturedQuery = readCapturedQuery();
      let html = "";
      entries.forEach((id) => {
        html += renderCheckoutEntryHtml(
          id,
          descriptions[id].checkout as StorefrontCheckoutConfig,
          extensionsView[id],
        );
      });
      el.innerHTML = html;
      const wraps = el.querySelectorAll("[data-ext-entry]");
      entries.forEach((id, i) => {
        const wrap = wraps[i];
        if (!wrap) return;
        wireCheckoutEntry(
          wrap,
          id,
          descriptions[id].checkout as StorefrontCheckoutConfig,
          extensionsView[id],
          capturedQuery,
        );
      });
    });
  }

  function formatAccountFieldValue(
    raw: unknown,
    kind: StorefrontAccountField["kind"],
  ): string {
    if (raw === undefined || raw === null || raw === "") return "—";
    if (kind === "date") {
      const d = new Date(String(raw));
      if (!isNaN(d.getTime())) return d.toLocaleDateString("ru-RU");
    }
    return String(raw);
  }

  function renderAccountList(
    container: HTMLElement,
    extensionId: string,
    listCfg: { source: string; columns: string[] },
  ): void {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-ext-list", "");
    wrap.className = "flex flex-col gap-1 mt-2";
    const body = document.createElement("div");
    wrap.appendChild(body);
    const more = document.createElement("button");
    more.type = "button";
    more.setAttribute("data-ext-list-more", "");
    more.className =
      "self-start text-[length:var(--size-small)] text-[rgb(var(--color-accent))] [font-family:var(--font-body)]";
    more.textContent = "Показать ещё";
    more.hidden = true;
    wrap.appendChild(more);
    container.appendChild(wrap);

    let cursor: unknown;
    function renderRow(item: Record<string, unknown>): void {
      const row = document.createElement("div");
      row.className =
        "flex items-center gap-3 text-[length:var(--size-small)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]";
      row.setAttribute("data-ext-list-row", "");
      (listCfg.columns || []).forEach((col) => {
        const cell = document.createElement("span");
        cell.textContent =
          item && item[col] !== undefined && item[col] !== null
            ? String(item[col])
            : "";
        row.appendChild(cell);
      });
      body.appendChild(row);
    }

    function loadPage(): void {
      void callFn(
        extensionId,
        listCfg.source,
        cursor !== undefined ? { cursor } : {},
      ).then(
        (
          page: {
            items?: Record<string, unknown>[];
            cursor?: unknown;
            done?: boolean;
          } | null,
        ) => {
          const items = (page && page.items) || [];
          items.forEach(renderRow);
          cursor = page ? page.cursor : undefined;
          more.hidden = !page || page.done !== false;
        },
      );
    }
    more.addEventListener("click", loadPage);
    loadPage();
  }

  function renderAccountForm(
    container: HTMLElement,
    extensionId: string,
    formCfg: NonNullable<StorefrontAccountConfig["form"]>,
    onSuccess: () => void,
  ): void {
    const form = document.createElement("form");
    form.setAttribute("data-ext-form", "");
    form.className = "flex flex-col gap-2 mt-2";
    (formCfg.fields || []).forEach((f) => {
      const label = document.createElement("label");
      label.className =
        "flex flex-col gap-1 text-[length:var(--size-small)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]";
      const span = document.createElement("span");
      span.textContent = f.label || f.key;
      const input = document.createElement("input");
      input.type = f.input === "checkbox" ? "checkbox" : f.input || "text";
      input.setAttribute("data-ext-form-field", f.key);
      if (f.required) input.required = true;
      label.appendChild(span);
      label.appendChild(input);
      form.appendChild(label);
    });
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className =
      "self-start text-[length:var(--size-body)] text-[rgb(var(--color-button-text))] bg-[rgb(var(--color-button-bg))] rounded-[var(--radius-button)] px-4 py-2 [font-family:var(--font-body)]";
    submitBtn.textContent = "Сохранить";
    form.appendChild(submitBtn);
    container.appendChild(form);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const body: Record<string, unknown> = {};
      (formCfg.fields || []).forEach((f) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- см. комментарий у wireCheckoutEntry выше
        const input = form.querySelector(
          '[data-ext-form-field="' + f.key + '"]',
        ) as HTMLInputElement | null;
        if (!input) return;
        body[f.key] =
          f.input === "checkbox"
            ? input.checked
            : f.input === "number"
              ? Number(input.value)
              : input.value;
      });
      void callFn(extensionId, formCfg.fn, body).then(() => onSuccess());
    });
  }

  function renderAccountEntry(id: string, cfg: StorefrontAccountConfig): void {
    const container = document.createElement("div");
    container.setAttribute("data-ext-entry", "");
    container.setAttribute("data-ext-id", id);
    container.className = "flex flex-col gap-4";
    if (cfg.title) {
      const heading = document.createElement("h2");
      heading.className =
        "[font-family:var(--font-heading)] text-[length:var(--size-h3)] text-[rgb(var(--color-heading))]";
      heading.textContent = cfg.title;
      container.appendChild(heading);
    }
    const fieldsWrap = document.createElement("div");
    fieldsWrap.setAttribute("data-ext-fields", "");
    fieldsWrap.className = "flex flex-col gap-2";
    container.appendChild(fieldsWrap);
    el.appendChild(container);

    function renderFields(source: Record<string, unknown> | null): void {
      fieldsWrap.innerHTML = "";
      (cfg.fields || []).forEach((f) => {
        const row = document.createElement("div");
        row.className =
          "flex items-center justify-between text-[length:var(--size-body)] text-[rgb(var(--color-text))] [font-family:var(--font-body)]";
        const label = document.createElement("span");
        label.className = "text-[rgb(var(--color-muted))]";
        label.textContent = f.label || f.key;
        const value = document.createElement("span");
        value.setAttribute("data-ext-field", f.key);
        value.textContent = formatAccountFieldValue(
          source ? source[f.key] : undefined,
          f.kind,
        );
        row.appendChild(label);
        row.appendChild(value);
        fieldsWrap.appendChild(row);
      });
      if (cfg.copy) {
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.setAttribute("data-ext-copy", "");
        copyBtn.className =
          "self-start text-[length:var(--size-small)] text-[rgb(var(--color-accent))] [font-family:var(--font-body)]";
        copyBtn.textContent = cfg.copy.label || "Скопировать";
        copyBtn.addEventListener("click", () => {
          const val = source ? source[cfg.copy!.key] : undefined;
          if (
            val &&
            (navigator as any).clipboard &&
            (navigator as any).clipboard.writeText
          ) {
            (navigator as any).clipboard.writeText(String(val)).catch(() => {});
          }
        });
        fieldsWrap.appendChild(copyBtn);
      }
    }

    function loadSource(): Promise<Record<string, unknown> | null> {
      return callFn(id, cfg.source, {}).then(
        (source: Record<string, unknown> | null) => {
          renderFields(source || {});
          return source;
        },
      );
    }

    void loadSource();
    if (cfg.list) renderAccountList(container, id, cfg.list);
    if (cfg.form)
      renderAccountForm(container, id, cfg.form, () => {
        void loadSource();
      });
  }

  function renderAccountPoint(descriptions: StorefrontDescriptions): void {
    if (!authToken) return;
    const entries = Object.keys(descriptions).filter(
      (id) => descriptions[id] && descriptions[id].account,
    );
    if (!entries.length) return;
    entries.forEach((id) =>
      renderAccountEntry(
        id,
        descriptions[id].account as StorefrontAccountConfig,
      ),
    );
  }

  return fetchStorefrontDescriptions().then((descriptions) => {
    if (!descriptions || !Object.keys(descriptions).length) return;
    if (point === "cart") return renderCartPoint(descriptions);
    if (point === "checkout") return renderCheckoutPoint(descriptions);
    if (point === "account") return renderAccountPoint(descriptions);
  });
}

/**
 * Строковый рантайм для `<script is:inline set:html={…}>`. Склеен из
 * `.toString()` тех же function-деклараций, что выше — если поменять логику
 * здесь через правку функции, строка обновится сама (никакой второй копии).
 * `window.mountExtensionPoint` — единственная точка входа для блоков.
 */
export const EXTENSION_POINTS_RUNTIME_SOURCE = `
${extensionQueryStorageKey.toString()}
${captureQueryParams.toString()}
${substituteExtensionText.toString()}
${shouldShowExtensionNote.toString()}
${coerceExtensionInputValue.toString()}
${escapeExtensionHtml.toString()}
${buildExtensionInputBody.toString()}
${mountExtensionPoint.toString()}
if (typeof window !== 'undefined') { window.mountExtensionPoint = mountExtensionPoint; }
`.trim();
