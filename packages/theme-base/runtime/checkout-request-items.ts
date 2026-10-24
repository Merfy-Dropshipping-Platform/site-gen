/**
 * checkout-request-items — оформление не принимает товары, которые продаются
 * по заявке (баг тестировщика Б16, спека 120 «Заявки»).
 *
 * ПРОБЛЕМА. Ответ «товар продаётся формой» живёт в сессии вкладки пять минут
 * (extension-sale.ts). Магазин перевёл товар на заявку, а он уже лежит в корзине:
 * до пяти минут оформление показывало его по цене каталога с активной «Оплатить»,
 * потом строка пропадала без объяснения.
 *
 * ЧТО ДЕЛАЕТ. На странице оформления:
 *   1. каждую строку корзины (локальную, серверную из cartStore и «Купить сейчас»)
 *      спрашивает у расширения заново, мимо кэша (`check(id, { fresh: true })`);
 *      пока идёт проверка, «Оплатить» не нажимается, но не дольше 3 с — дальше
 *      товар считается обычным (сервер всё равно откажет);
 *   2. найденные строки убирает отовсюду, где их читают блоки оформления, и
 *      показывает над составом заказа: «Товар «…» продаётся по заявке» со ссылкой
 *      «Оставить заявку» на страницу товара;
 *   3. забирает строки, которые корзина убрала раньше на других страницах
 *      (`rememberRequestItem`), и показывает их один раз;
 *   4. при отказе сервера (`PRODUCT_REQUIRES_REQUEST` или любая 4xx) кнопка
 *      оплаты зовёт `recheck()` — свежая проверка всех строк и то же сообщение.
 *
 * ГДЕ ЧИТАЮТ БЛОКИ. `window.__merfyCheckoutLines` = `{ notices, checking, recheck }`;
 * событие `checkout:lines-changed` на document сообщает об изменении. Само
 * сообщение рисует этот файл в каждый `[data-checkout-request-notice]`.
 *
 * Слов предметной области в файле нет: так работает любое расширение с точкой
 * `product` (решение Р8).
 */
import type { ExtensionSale } from "./extension-sale";

/** Строки, убранные корзиной на других страницах: ждут показа на оформлении. */
export const REQUEST_ITEMS_KEY = "merfy:request-items:v1";
/** На window: корзина убрала строку (на оформлении сообщение появляется сразу). */
export const REQUEST_ITEM_DROPPED_EVENT = "merfy:request-item-dropped";
/** На document: состав сообщений или признак проверки изменился. */
export const CHECKOUT_LINES_CHANGED_EVENT = "checkout:lines-changed";
/** Ключ на window: состояние для блоков оформления. */
export const CHECKOUT_LINES_WINDOW_KEY = "__merfyCheckoutLines";
/** Сколько оформление ждёт свежего ответа расширения. */
export const CHECKOUT_CHECK_WAIT_MS = 3000;

const NOTICE_SELECTOR = "[data-checkout-request-notice]";
const BUYNOW_SUFFIX = ":buynow";

export interface RequestItemNotice {
  productId: string;
  name: string;
  /** Страница товара: там форма заявки. */
  href: string;
}

/** Состояние, которое читают блоки «Сводка заказа» и «Кнопка оплаты». */
export interface CheckoutLinesState {
  notices: RequestItemNotice[];
  checking: boolean;
  /** Свежая проверка всех строк; `true` — нашлись новые товары «по заявке». */
  recheck(): Promise<boolean>;
  /** Снять подписки: страница оформления закрыта (переход без перезагрузки). */
  dispose(): void;
}

interface LineLike {
  productId?: unknown;
  name?: unknown;
  productName?: unknown;
  isBonus?: unknown;
}

interface CartStoreLike {
  getItems?: () => LineLike[];
  setLocalItems?: (items: LineLike[]) => void;
  removeItem?: (itemId: string) => unknown;
}

export interface CheckoutGuardDeps {
  sale: ExtensionSale;
  /** Префикс темы (`rose`, `bloom`, …): ключ `<тема>:buynow`. */
  themeKey: string;
  /** Тот же префикс страницы товара, что строит корзина: `/products`. */
  productPathPrefix: string;
  /** Строки локальной корзины темы. */
  getLines: () => LineLike[];
  /** Убрать из локальной корзины все строки этих товаров. */
  removeProducts: (productIds: ReadonlySet<string>) => void;
  /** Сколько ждать ответа расширения; по умолчанию 3 с. */
  waitMs?: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Адрес страницы товара — так же, как его строит корзина (`${prefix}/${productId}`). */
export function requestItemHref(productPathPrefix: string, productId: string): string {
  return `${productPathPrefix}/${productId}`;
}

function readRemembered(win: Window): RequestItemNotice[] {
  try {
    const parsed: unknown = JSON.parse(win.sessionStorage.getItem(REQUEST_ITEMS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RequestItemNotice =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RequestItemNotice).productId === "string" &&
        typeof (entry as RequestItemNotice).name === "string" &&
        typeof (entry as RequestItemNotice).href === "string",
    );
  } catch {
    // Хранилище закрыто или запись битая: помнить нечего.
    return [];
  }
}

/**
 * Корзина убрала строку товара «по заявке» — запоминаем название и адрес, чтобы
 * оформление объяснило это покупателю. Один товар — одна запись.
 */
export function rememberRequestItem(win: Window, notice: RequestItemNotice): void {
  const kept = readRemembered(win).filter((entry) => entry.productId !== notice.productId);
  try {
    win.sessionStorage.setItem(REQUEST_ITEMS_KEY, JSON.stringify([...kept, notice]));
  } catch {
    // Хранилище закрыто: сообщение на оформлении не появится, строка всё равно убрана.
  }
  win.dispatchEvent(new CustomEvent(REQUEST_ITEM_DROPPED_EVENT, { detail: notice }));
}

/** Запомненные строки забираются один раз: после чтения запись удаляется. */
export function takeRememberedRequestItems(win: Window): RequestItemNotice[] {
  const list = readRemembered(win);
  try {
    win.sessionStorage.removeItem(REQUEST_ITEMS_KEY);
  } catch {
    // Хранилище закрыто: показать повторно нечем.
  }
  return list;
}

const BOX_STYLE =
  "font-family:var(--font-body);font-size:var(--size-small);color:rgb(var(--color-text));" +
  "background:rgb(var(--color-input-bg));border-radius:8px;padding:12px 16px;margin-bottom:16px;";
const LINK_STYLE =
  "color:inherit;text-decoration:underline;text-underline-offset:2px;margin-left:4px;";

/** Сообщения → в каждое место под них на странице (текст — через textContent). */
export function renderRequestNotices(doc: Document, notices: readonly RequestItemNotice[]): void {
  doc.querySelectorAll<HTMLElement>(NOTICE_SELECTOR).forEach((container) => {
    container.replaceChildren();
    container.hidden = notices.length === 0;
    if (notices.length === 0) return;
    container.setAttribute("role", "status");
    const box = doc.createElement("div");
    box.setAttribute("style", BOX_STYLE);
    for (const notice of notices) {
      const line = doc.createElement("p");
      line.setAttribute("data-request-notice-line", notice.productId);
      line.append(`Товар «${notice.name}» продаётся по заявке.`);
      const link = doc.createElement("a");
      link.setAttribute("href", notice.href);
      link.setAttribute("style", LINK_STYLE);
      link.textContent = "Оставить заявку";
      line.append(link);
      box.append(line);
    }
    container.append(box);
  });
}

function storeOf(win: Window): CartStoreLike | null {
  const store = (win as unknown as { cartStore?: CartStoreLike }).cartStore;
  return store !== undefined && store !== null ? store : null;
}

/** Товар «Купить сейчас»: в `<тема>:buynow` лежит одна строка. */
function buyNowProductId(win: Window, themeKey: string): string {
  try {
    const parsed: unknown = JSON.parse(win.sessionStorage.getItem(`${themeKey}${BUYNOW_SUFFIX}`) ?? "null");
    return typeof parsed === "object" && parsed !== null ? text((parsed as LineLike).productId) : "";
  } catch {
    return "";
  }
}

export function createCheckoutGuard(win: Window, doc: Document, deps: CheckoutGuardDeps): CheckoutLinesState {
  const waitMs = deps.waitMs ?? CHECKOUT_CHECK_WAIT_MS;
  const notices = new Map<string, RequestItemNotice>();
  /** Товары, уже отправленные на проверку на этой странице оформления. */
  const asked = new Set<string>();
  /** Товары «по заявке»: их строки убираем отовсюду, и сколько бы раз источники ни пополнялись. */
  const removed = new Set<string>();
  /** Серверные строки, на удаление которых уже отправлен запрос: не повторять при сбое. */
  const requested = new Set<string>();
  const names = new Map<string, string>();
  let inFlight = 0;

  const state: CheckoutLinesState = {
    notices: [],
    checking: false,
    recheck: () => recheck(),
    dispose: () => {
      win.removeEventListener(REQUEST_ITEM_DROPPED_EVENT, absorb);
      doc.removeEventListener("cart:updated", scan);
    },
  };

  const publish = (): void => {
    state.notices = [...notices.values()];
    state.checking = inFlight > 0;
    renderRequestNotices(doc, state.notices);
    doc.dispatchEvent(new CustomEvent(CHECKOUT_LINES_CHANGED_EVENT));
  };

  /** Все товары, которые сейчас лежат в корзине: локальная, серверная, «Купить сейчас». */
  const collect = (): Set<string> => {
    const found = new Set<string>();
    const add = (line: LineLike): void => {
      const productId = text(line.productId);
      if (productId === "" || line.isBonus === true) return;
      found.add(productId);
      const name = text(line.name) || text(line.productName);
      if (name !== "") names.set(productId, name);
    };
    deps.getLines().forEach(add);
    storeOf(win)?.getItems?.().forEach(add);
    const buyNow = buyNowProductId(win, deps.themeKey);
    if (buyNow !== "") found.add(buyNow);
    return found;
  };

  /** Убрать строки найденных товаров из всех источников, которые читает оформление. */
  const purge = (): void => {
    if (removed.size === 0) return;
    deps.removeProducts(removed);
    try {
      const key = `${deps.themeKey}${BUYNOW_SUFFIX}`;
      if (removed.has(buyNowProductId(win, deps.themeKey))) win.sessionStorage.removeItem(key);
    } catch {
      // Хранилище закрыто: «Купить сейчас» тогда и не прочиталось.
    }
    const store = storeOf(win);
    const items = store?.getItems?.() ?? [];
    const hits = items.filter((line) => removed.has(text(line.productId)));
    if (store === null || hits.length === 0) return;
    if (typeof store.setLocalItems === "function") {
      store.setLocalItems(items.filter((line) => !removed.has(text(line.productId))));
      return;
    }
    // Темы без setLocalItems держат серверную корзину: убираем строки на сервере.
    for (const line of hits) {
      const id = text((line as { id?: unknown }).id);
      if (id === "" || requested.has(id) || typeof store.removeItem !== "function") continue;
      requested.add(id);
      void Promise.resolve(store.removeItem(id)).catch(() => undefined);
    }
  };

  const markFound = (productId: string, fallbackName?: string): void => {
    if (notices.has(productId)) return;
    removed.add(productId);
    notices.set(productId, {
      productId,
      name: names.get(productId) ?? (fallbackName || "Товар"),
      href: requestItemHref(deps.productPathPrefix, productId),
    });
    purge();
    // Локальная корзина изменилась без cartStore: сводка и итог перечитывают её по этому событию.
    doc.dispatchEvent(new CustomEvent("cart:updated"));
    publish();
  };

  /** Спрашивает расширение мимо кэша; ждёт не дольше `waitMs`, поздний ответ тоже применяется. */
  const verify = async (productIds: string[]): Promise<void> => {
    const ask = productIds.filter((id) => deps.sale.canAsk(id));
    if (ask.length === 0) return;
    inFlight += 1;
    publish();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const answers = ask.map((id) =>
        deps.sale.check(id, { fresh: true }).then(
          (found) => {
            if (found) markFound(id);
          },
          () => undefined,
        ),
      );
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, waitMs);
      });
      await Promise.race([Promise.all(answers), deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      inFlight -= 1;
      publish();
    }
  };

  /** Новые товары в корзине (серверная пришла позже локальной) проверяются тоже. */
  const scan = (): void => {
    // Серверная корзина могла дозагрузиться и вернуть уже найденный товар.
    purge();
    const fresh = [...collect()].filter((id) => !asked.has(id) && !removed.has(id));
    fresh.forEach((id) => asked.add(id));
    if (fresh.length > 0) void verify(fresh);
  };

  /** Строки, убранные корзиной на других страницах. */
  const absorb = (): void => {
    for (const notice of takeRememberedRequestItems(win)) {
      if (notices.has(notice.productId)) continue;
      removed.add(notice.productId);
      asked.add(notice.productId);
      notices.set(notice.productId, notice);
    }
    if (notices.size > 0) {
      purge();
      doc.dispatchEvent(new CustomEvent("cart:updated"));
    }
    publish();
  };

  async function recheck(): Promise<boolean> {
    const before = notices.size;
    const all = [...collect()].filter((id) => !removed.has(id));
    all.forEach((id) => asked.add(id));
    await verify(all);
    return notices.size > before;
  }

  win.addEventListener(REQUEST_ITEM_DROPPED_EVENT, absorb);
  doc.addEventListener("cart:updated", scan);
  absorb();
  scan();
  return state;
}

const GUARDS = new WeakMap<Document, { body: HTMLElement | null; state: CheckoutLinesState }>();

/** Страница оформления: блок сводки или кнопка оплаты на странице. */
const isCheckoutPage = (doc: Document): boolean =>
  doc.querySelector("[data-checkout-summary], [data-block='checkout-submit']") !== null;

/**
 * Включает проверку на странице оформления. Повторный вызов на той же странице
 * ничего не делает; после перехода (новый `body`) состояние начинается заново.
 * В превью конструктора (iframe) не включается: это просмотр мерчанта, корзину
 * он трогать не должен.
 */
export function installCheckoutRequestItems(
  win: Window,
  doc: Document,
  deps: CheckoutGuardDeps,
): CheckoutLinesState | null {
  if (win.self !== win.top || !isCheckoutPage(doc)) return null;
  const installed = GUARDS.get(doc);
  if (installed !== undefined && installed.body === doc.body) return installed.state;
  installed?.state.dispose();
  const guard = createCheckoutGuard(win, doc, deps);
  GUARDS.set(doc, { body: doc.body, state: guard });
  (win as unknown as Record<string, unknown>)[CHECKOUT_LINES_WINDOW_KEY] = guard;
  return guard;
}
