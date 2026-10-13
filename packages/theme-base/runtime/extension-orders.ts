/**
 * extension-orders — записи расширений в «Моих заказах» покупателя и
 * страница записи (точка `orders` карты `GET /store/extensions/storefront`).
 *
 * ЧТО ЭТО. Расширение может добавить в «Мои заказы» свои записи: функция
 * `list` отдаёт строки (номер, заголовок, статус, дата), функция `get` —
 * страницу записи общими блоками, теми же, что у писем. Тема ставит строки
 * среди заказов по дате, а страницу записи рисует без пункта меню. Покупателя
 * ядро берёт из сессии: токен из localStorage уходит заголовком (канал —
 * `extension-call.ts`). Весь текст записи приходит от расширения; здесь только
 * общие слова «Моих заказов». Слов предметной области в файле нет (Р8).
 *
 * ПОЧЕМУ ЕЩЁ И СТРОКА. Секция «Заказы» тем хёдрируется только через
 * `<script is:inline set:html>` (module-скрипт секции на собранной витрине
 * даёт 404, см. `extension-points.ts`), поэтому скрипт
 * `scripts/build-orders-runtime.mjs` собирает этот модуль esbuild-ом в строку
 * `extension-orders.runtime.ts` с глобалом `window.__merfyExtensionOrders`.
 * Страница записи — обычная страница темы и импортирует модуль напрямую.
 *
 * ТИШИНА В СПИСКЕ. Нет точки, сбой сети или неверный ответ одного расширения —
 * его строк нет, заказы магазина показываются как раньше.
 */
import {
  callFunction,
  fetchStorefrontMap,
  replyData,
  type ExtensionChannel,
} from "./extension-call";
import {
  entryHref,
  entryTargetOf,
  findOrdersPoints,
  readEntryView,
  readListItems,
  renderEntryHtml,
  renderRowHtml,
  sortNewestFirst,
  timeOf,
  type EntryResult,
  type EntryTarget,
  type OrdersPoint,
  type RecordRow,
} from "./extension-orders-view";

export interface RecordRowsOptions extends ExtensionChannel {
  /** Путь страницы записи: `/account/entry`. */
  entryPath: string;
}

export interface RecordEntryOptions extends ExtensionChannel {
  /** Куда ведёт «← Мои заказы»: `/account/orders`. */
  ordersPath: string;
  /** `location.search` страницы записи: `?ext=…&id=…`. */
  search: string;
}

const DATE_ATTRIBUTE = "data-date";
const MISSING: EntryResult = { kind: "missing" };
const FAILED: EntryResult = { kind: "failed" };

/* ── Сеть ── */

async function loadPointRows(
  channel: ExtensionChannel,
  point: OrdersPoint,
): Promise<RecordRow[]> {
  const reply = await callFunction(
    channel,
    { extensionId: point.extensionId, name: point.list },
    {},
  );
  const items = readListItems(replyData(reply));
  return items.map((item) => ({ ...item, extensionId: point.extensionId }));
}

/** Записи всех расширений с точкой `orders`, новые сверху. */
export async function loadRecordRows(
  channel: ExtensionChannel,
): Promise<RecordRow[]> {
  const points = findOrdersPoints(await fetchStorefrontMap(channel));
  const lists = await Promise.all(
    points.map((point) => loadPointRows(channel, point)),
  );
  return sortNewestFirst(lists.flat());
}

/** Страница записи: `null` от расширения — «не найдена», сбой и неверный ответ — «не удалось». */
export async function loadEntry(
  channel: ExtensionChannel,
  target: EntryTarget,
): Promise<EntryResult> {
  const points = findOrdersPoints(await fetchStorefrontMap(channel));
  const point = points.find((item) => item.extensionId === target.extensionId);
  if (point === undefined) return MISSING;
  const reply = await callFunction(
    channel,
    { extensionId: point.extensionId, name: point.get },
    { id: target.id },
  );
  const data = replyData(reply);
  if (data === null) return MISSING;
  const view = readEntryView(data);
  return view === null ? FAILED : { kind: "view", view };
}

/* ── DOM ── */

function rowElement(row: RecordRow, entryPath: string, now: Date): Element {
  const holder = document.createElement("div");
  holder.innerHTML = renderRowHtml(row, entryHref(entryPath, row), now);
  return holder.firstElementChild ?? holder;
}

/** Ставит строку перед первой более старой строкой списка (у строк заказов тоже есть `data-date`). */
function insertByDate(list: HTMLElement, element: Element): void {
  const time = timeOf(element.getAttribute(DATE_ATTRIBUTE));
  const older = Array.from(list.children).find(
    (child) => timeOf(child.getAttribute(DATE_ATTRIBUTE)) < time,
  );
  list.insertBefore(element, older ?? null);
}

/**
 * Список «Моих заказов»: дописывает строки записей расширений среди строк
 * заказов по дате. Возвращает, сколько строк добавлено, — тема по нему
 * прячет «пока нет заказов».
 */
export async function mountRecordRows(
  list: HTMLElement,
  options: RecordRowsOptions,
): Promise<number> {
  const rows = await loadRecordRows(options);
  const now = new Date();
  rows.forEach((row) =>
    insertByDate(list, rowElement(row, options.entryPath, now)),
  );
  return rows.length;
}

/** Страница записи: читает `?ext=…&id=…`, спрашивает расширение и рисует блоки в `root`. */
export async function mountRecordEntry(
  root: HTMLElement,
  options: RecordEntryOptions,
): Promise<void> {
  const target = entryTargetOf(options.search);
  const result = target === null ? MISSING : await loadEntry(options, target);
  root.innerHTML = renderEntryHtml(result, options.ordersPath, new Date());
}
