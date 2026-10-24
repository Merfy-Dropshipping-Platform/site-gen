/**
 * extension-sale — какие товары продаются через форму расширения, а не корзиной.
 *
 * ЗАЧЕМ. Страница товара скрывает «В корзину» и показывает форму расширения
 * (`extension-purchase.ts`). Но тот же товар лежит и на карточках каталога, и
 * там кнопка «В корзину» оставалась: товар уходил в корзину и в оформление
 * (баги тестировщика 24.10, Б1/Б2). Здесь — проверка карточек и корзины.
 *
 * ОТКУДА ВИТРИНА ЗНАЕТ. Ядро этого не хранит («продаётся формой или корзиной» —
 * данные расширения). Тот же путь, что у страницы товара: карта расширений
 * (`GET /store/extensions/storefront`) называет функцию формы точки `product`;
 * для товара расширения она отдаёт форму, для остальных — пусто. Нет точки в
 * карте — запросов по товарам нет вовсе.
 *
 * ТИШИНА. Нет конфига магазина, нет точки, сеть или ошибка — товар считается
 * обычным: кнопка остаётся, как будто фичи нет. Сбой не запоминается.
 *
 * ЦЕНА ВОПРОСА. Функция формы вызывается по разу на товар (не больше четырёх
 * разом); ответ живёт в сессии вкладки пять минут, поэтому следующая страница
 * каталога прячет кнопки сразу, без запросов и без мигания.
 *
 * Слов предметной области в файле нет: так работает любое расширение с точкой
 * `product` (решение Р8).
 */
import {
  callFunction,
  fetchStorefrontMap,
  findProductPoint,
  isRecord,
  replyData,
  type ExtensionChannel,
  type PurchasePoint,
} from "./extension-call";

const CACHE_KEY = "merfy:extension-sale:v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PARALLEL = 4;
const SCAN_DELAY_MS = 50;
const WINDOW_KEY = "__merfyExtensionSale";
const CHECKED_ATTRIBUTE = "data-extension-sale-checked";
const WATCHED_ATTRIBUTE = "data-extension-sale-watched";
/**
 * «В корзину» на карточке: `[data-add-to-cart]` (satin, секции, страница товара)
 * или `[data-quick-add-id]` (блок «Каталог» flux, rose, bloom, vanilla — у них
 * свой обработчик клика, id товара лежит в самой кнопке).
 */
const BUTTON_SELECTOR = "[data-add-to-cart][data-product-id], [data-quick-add-id]";
const STEPPER_SELECTOR = "[data-qa-stepper]";
/** Сколько клик ждёт ответа расширения: дольше — товар считается обычным. */
const ANSWER_WAIT_MS = 3000;

export interface ExtensionSale {
  /** Ответ уже известен: `true` — товар продаётся формой; `undefined` — ещё не спрашивали. */
  known(productId: string): boolean | undefined;
  /** Есть кого спросить: конфиг магазина на странице и id товара. Нет — ждать ответа нечего. */
  canAsk(productId: string): boolean;
  /** Спросить расширение (один раз на товар); сбой — `false` без запоминания. */
  check(productId: string): Promise<boolean>;
}

interface SessionCache {
  storeId: string;
  at: number;
  ids: Record<string, boolean>;
}

interface ConfigWindow {
  __MERFY_CONFIG__?: { apiUrl?: unknown; apiBase?: unknown; shopId?: unknown; storeId?: unknown };
  __MERFY_SITE_ID__?: unknown;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Магазин и шлюз из конфига страницы; нет любого из двух — `null` (ничего не спрашиваем). */
function channelOf(win: Window): ExtensionChannel | null {
  const holder = win as unknown as ConfigWindow;
  const config = holder.__MERFY_CONFIG__ ?? {};
  const storeId = text(config.shopId) || text(config.storeId) || text(holder.__MERFY_SITE_ID__);
  const apiBase = (text(config.apiUrl) || text(config.apiBase)).replace(/\/+$/, "");
  return storeId !== "" && apiBase !== "" ? { storeId, apiBase } : null;
}

function readSession(win: Window, storeId: string): Record<string, boolean> {
  try {
    const raw = win.sessionStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (!isRecord(parsed) || parsed.storeId !== storeId) return {};
    const fresh = typeof parsed.at === "number" && Date.now() - parsed.at < CACHE_TTL_MS;
    return fresh && isRecord(parsed.ids) ? (parsed.ids as Record<string, boolean>) : {};
  } catch {
    // Хранилище закрыто или запись битая: спросим заново.
    return {};
  }
}

function writeSession(win: Window, storeId: string, ids: Record<string, boolean>): void {
  const entry: SessionCache = { storeId, at: Date.now(), ids };
  try {
    win.sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Хранилище закрыто: ответ живёт только на этой странице.
  }
}

/**
 * Не больше `limit` задач разом; остальные ждут своей очереди. Обобщённая
 * стрелка `<T>(…) =>` здесь нельзя: сборка секций читает .ts с разметкой JSX и
 * принимает `<T>` за тег — поэтому именованная функция.
 */
function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const release = (): void => {
    active -= 1;
    waiting.shift()?.();
  };
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** Ответ функции формы: товар расширения — форма (`{form}`), остальные — пусто. */
const isFormReply = (data: unknown): boolean => isRecord(data) && isRecord(data.form);

export function createExtensionSale(win: Window): ExtensionSale {
  const memory = new Map<string, boolean>();
  const asked = new Map<string, Promise<boolean>>();
  const limited = createLimiter(MAX_PARALLEL);
  let pointOnce: Promise<PurchasePoint | null> | null = null;

  const known = (productId: string): boolean | undefined => {
    const hit = memory.get(productId);
    if (hit !== undefined) return hit;
    const channel = channelOf(win);
    if (channel === null) return undefined;
    const stored = readSession(win, channel.storeId)[productId];
    if (typeof stored === "boolean") memory.set(productId, stored);
    return typeof stored === "boolean" ? stored : undefined;
  };

  const remember = (channel: ExtensionChannel, productId: string, value: boolean): void => {
    memory.set(productId, value);
    writeSession(win, channel.storeId, {
      ...readSession(win, channel.storeId),
      [productId]: value,
    });
  };

  const pointOf = (channel: ExtensionChannel): Promise<PurchasePoint | null> => {
    pointOnce ??= fetchStorefrontMap(channel).then(findProductPoint);
    return pointOnce;
  };

  async function ask(channel: ExtensionChannel, productId: string): Promise<boolean> {
    const point = await pointOf(channel);
    if (point === null) return false;
    const reply = await callFunction(
      channel,
      { extensionId: point.extensionId, name: point.form },
      { productId },
    );
    if (reply === null) return false;
    const data = replyData(reply);
    // Не 2xx или без обёртки успеха — это сбой, а не «товар обычный».
    if (data === undefined) return false;
    const value = isFormReply(data);
    remember(channel, productId, value);
    return value;
  }

  const check = (productId: string): Promise<boolean> => {
    const hit = known(productId);
    if (hit !== undefined) return Promise.resolve(hit);
    const channel = channelOf(win);
    if (channel === null || productId === "") return Promise.resolve(false);
    const pending = asked.get(productId);
    if (pending !== undefined) return pending;
    const started = limited(() => ask(channel, productId))
      .catch(() => false)
      .finally(() => asked.delete(productId));
    asked.set(productId, started);
    return started;
  };

  const canAsk = (productId: string): boolean =>
    productId !== "" && channelOf(win) !== null;

  return { known, canAsk, check };
}

/** Один объект на окно: кэш и карта общие для каталога и корзины. */
export function extensionSaleOf(win: Window = window): ExtensionSale {
  const holder = win as unknown as Record<string, unknown>;
  const existing = holder[WINDOW_KEY] as ExtensionSale | undefined;
  if (existing !== undefined) return existing;
  const created = createExtensionSale(win);
  holder[WINDOW_KEY] = created;
  return created;
}

/** hidden и display:none !important: у карточек тем есть flex-классы и показ при наведении. */
function hideElement(element: HTMLElement): void {
  element.hidden = true;
  element.style.setProperty("display", "none", "important");
}

/** Кнопка товара расширения и счётчик количества рядом с ней. */
function hideButton(button: HTMLElement): void {
  hideElement(button);
  button.parentElement
    ?.querySelectorAll<HTMLElement>(`:scope > ${STEPPER_SELECTOR}`)
    .forEach(hideElement);
}

function buttonsOf(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(BUTTON_SELECTOR));
}

/** Товар кнопки: `data-product-id`, а у кнопки блока «Каталог» — `data-quick-add-id`. */
const productIdOf = (button: HTMLElement): string =>
  button.dataset.productId || button.dataset.quickAddId || "";

/** Ответ расширения, но не дольше `ms`: тишина — как «товар обычный». */
function answerWithin(answer: Promise<boolean>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const settle = (value: boolean): void => {
      clearTimeout(timer);
      resolve(value);
    };
    answer.then(settle, () => settle(false));
  });
}

/** Страница → объект, который отвечает за её кнопки: один обработчик клика на страницу. */
const gates = new WeakMap<Document, ExtensionSale>();
/** Идёт повтор клика, который мы задержали: его пропускаем без проверки. */
let replaying = false;

/**
 * Клик по «В корзину» товара, о котором расширение ещё не ответило, ждёт
 * ответа (короткий запрос) и только потом доходит до обработчика темы: обычный
 * товар — повтором клика, товар расширения — не доходит вовсе, кнопка прячется.
 * Обработчик стоит на document в фазе перехвата, поэтому он раньше любого
 * обработчика темы — и корзины ядра, и инлайн-скрипта блока «Каталог».
 * Ответ известен или спросить некого (нет конфига магазина) — клик не задерживается.
 */
function installClickGate(doc: Document, sale: ExtensionSale, hideFor: (id: string) => void): void {
  const installed = gates.has(doc);
  gates.set(doc, sale);
  if (installed) return;
  doc.addEventListener(
    "click",
    (event) => {
      if (replaying) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLElement>(BUTTON_SELECTOR);
      const current = gates.get(doc);
      if (button === null || current === undefined) return;
      const productId = productIdOf(button);
      const hit = current.known(productId);
      if (hit === false || (hit === undefined && !current.canAsk(productId))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (hit === true) {
        hideFor(productId);
        return;
      }
      void answerWithin(current.check(productId), ANSWER_WAIT_MS).then((found) => {
        if (found) {
          hideFor(productId);
          return;
        }
        // Кнопку могли убрать (перерисовка списка): повторять клик некуда.
        if (!button.isConnected) return;
        replaying = true;
        try {
          button.click();
        } finally {
          replaying = false;
        }
      });
    },
    true,
  );
}

/**
 * Прячет «В корзину» у товаров расширения на всей странице и следит за новыми
 * карточками (каталог дорисовывается гидрацией, список — «Смотреть ещё»), а клик
 * по кнопке непроверенного товара задерживает до ответа расширения.
 */
export function watchExtensionSaleButtons(doc: Document, sale: ExtensionSale): void {
  const hideFor = (productId: string): void => {
    buttonsOf(doc)
      .filter((button) => productIdOf(button) === productId)
      .forEach(hideButton);
  };
  installClickGate(doc, sale, hideFor);
  const scan = (): void => {
    for (const button of buttonsOf(doc)) {
      const productId = productIdOf(button);
      const hit = sale.known(productId);
      if (hit === true) {
        hideButton(button);
        continue;
      }
      if (hit === false || button.hasAttribute(CHECKED_ATTRIBUTE)) continue;
      button.setAttribute(CHECKED_ATTRIBUTE, "");
      void sale.check(productId).then((found) => {
        if (found) hideFor(productId);
      });
    }
  };
  scan();
  if (typeof MutationObserver === "undefined" || doc.body === null) return;
  // Один наблюдатель на body: после перехода между страницами body новый, флага на нём нет.
  if (doc.body.hasAttribute(WATCHED_ATTRIBUTE)) return;
  doc.body.setAttribute(WATCHED_ATTRIBUTE, "");
  let timer: ReturnType<typeof setTimeout> | null = null;
  new MutationObserver(() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(scan, SCAN_DELAY_MS);
  }).observe(doc.body, { childList: true, subtree: true });
}
