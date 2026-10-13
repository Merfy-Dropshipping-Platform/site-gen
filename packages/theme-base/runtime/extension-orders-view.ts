/**
 * extension-orders-view — чистая часть точки `orders`: разбор ответов
 * расширения и разметка строкой. Вход → строка/данные, без DOM и сети
 * (RULES §3.8); сеть и DOM — в `extension-orders.ts`.
 *
 * Что приходит от расширения (SDK, `storefront.ts`): список записей
 * `{ items: [{ id, number, title, status, tone?, date }] }` и страница записи
 * `{ number, title, status, tone?, date, blocks }`; блоки — общие с письмами
 * (`blocks.ts`): `text`, `button`, `lines`, `pairs`. Ядро уже проверило ответ
 * схемой, но тема всё равно не доверяет: не то — запись или блок пропускаются.
 * Весь текст расширения экранируется, ссылка кнопки — только свой путь или https.
 *
 * Слов предметной области в файле нет: записи в «Моих заказах» может добавить
 * любое расширение (решение Р8).
 */
import { attribute, escapeHtml, isRecord, safeLink } from "./extension-call";

export const STATUS_TONES = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

/** Запись в списке «Моих заказов» — как в SDK (`OrdersListItem`). */
export interface OrdersListItem {
  id: string;
  number: string;
  title: string;
  status: string;
  tone?: StatusTone;
  /** ISO 8601: по ней запись встаёт среди заказов. */
  date: string;
}

/** Запись и расширение, которое её дало: по паре открывается страница записи. */
export interface RecordRow extends OrdersListItem {
  extensionId: string;
}

export interface OrdersPoint {
  extensionId: string;
  list: string;
  get: string;
}

export interface LineRow {
  label: string;
  value: string;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "button"; label: string; url: string }
  | { type: "lines"; rows: LineRow[]; total?: LineRow }
  | { type: "pairs"; rows: LineRow[] };

/** Страница записи — как в SDK (`OrdersEntryView`); блоки уже разобраны. */
export interface EntryView {
  number: string;
  title: string;
  status: string;
  tone?: StatusTone;
  date: string;
  blocks: ContentBlock[];
}

/** Что показать на странице записи: запись, «не найдена» или сбой. */
export type EntryResult =
  | { kind: "view"; view: EntryView }
  | { kind: "missing" }
  | { kind: "failed" };

export interface EntryTarget {
  extensionId: string;
  id: string;
}

/* ── Тексты темы: только общие слова «Моих заказов» ── */

const TEXTS = {
  back: "← Мои заказы",
  missing: "Запись не найдена",
  failed: "Не удалось загрузить. Обновите страницу.",
} as const;

const NEUTRAL_TONE: StatusTone = "neutral";
const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;
const RELATIVE_DAYS: ReadonlyMap<number, string> = new Map([
  [0, "сегодня"],
  [1, "вчера"],
]);
const DAY_MS = 86_400_000;
const PARAGRAPH_BREAK = /\n{2,}/;

/* ── Разбор: внешние данные — unknown, сразу сужаем ── */

const isText = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isTone = (value: unknown): value is StatusTone =>
  STATUS_TONES.some((tone) => tone === value);

const toneOf = (value: unknown): StatusTone | undefined =>
  isTone(value) ? value : undefined;

const isDate = (value: unknown): value is string =>
  isText(value) && !Number.isNaN(Date.parse(value));

function pointOf(extensionId: string, entry: unknown): OrdersPoint | null {
  const orders = isRecord(entry) ? entry.orders : undefined;
  if (!isRecord(orders)) return null;
  const { list, get } = orders;
  return isText(list) && isText(get) ? { extensionId, list, get } : null;
}

/** Все расширения карты, у которых точка `orders` называет функции списка и страницы. */
export function findOrdersPoints(map: unknown): OrdersPoint[] {
  if (!isRecord(map)) return [];
  const points = Object.entries(map).map(([id, entry]) => pointOf(id, entry));
  return points.filter((point): point is OrdersPoint => point !== null);
}

type RecordHeader = Omit<OrdersListItem, "id">;

function headerOf(value: Record<string, unknown>): RecordHeader | null {
  const { number, title, status, tone, date } = value;
  const complete = isText(number) && isText(title) && isText(status);
  if (!complete || !isDate(date)) return null;
  return { number, title, status, tone: toneOf(tone), date };
}

function listItemOf(value: unknown): OrdersListItem | null {
  if (!isRecord(value) || !isText(value.id)) return null;
  const header = headerOf(value);
  return header === null ? null : { id: value.id, ...header };
}

/** Записи из ответа функции списка; неверные пропускаются. */
export function readListItems(data: unknown): OrdersListItem[] {
  const items = isRecord(data) ? data.items : undefined;
  if (!Array.isArray(items)) return [];
  const parsed = items.map(listItemOf);
  return parsed.filter((item): item is OrdersListItem => item !== null);
}

const isLineRow = (value: unknown): value is LineRow =>
  isRecord(value) && isText(value.label) && typeof value.value === "string";

const isLineRows = (value: unknown): value is LineRow[] =>
  Array.isArray(value) && value.length > 0 && value.every(isLineRow);

const BLOCK_SHAPES: Record<
  ContentBlock["type"],
  (block: Record<string, unknown>) => boolean
> = {
  text: (block) => isText(block.text),
  button: (block) => isText(block.label) && safeLink(block.url) !== null,
  lines: (block) =>
    isLineRows(block.rows) &&
    (block.total === undefined || isLineRow(block.total)),
  pairs: (block) => isLineRows(block.rows),
};

const hasShape = (type: unknown): type is ContentBlock["type"] =>
  typeof type === "string" &&
  Object.prototype.hasOwnProperty.call(BLOCK_SHAPES, type);

function isContentBlock(value: unknown): value is ContentBlock {
  if (!isRecord(value) || !hasShape(value.type)) return false;
  return BLOCK_SHAPES[value.type](value);
}

/** Страница записи из ответа функции; не та форма — `null`. Неизвестный блок пропускается. */
export function readEntryView(data: unknown): EntryView | null {
  if (!isRecord(data) || !Array.isArray(data.blocks)) return null;
  const header = headerOf(data);
  if (header === null) return null;
  return { ...header, blocks: data.blocks.filter(isContentBlock) };
}

/* ── Адрес страницы записи ── */

/** `/account/entry?ext=<расширение>&id=<запись>` — путь страницы берёт тема. */
export function entryHref(entryPath: string, row: RecordRow): string {
  const query = new URLSearchParams({ ext: row.extensionId, id: row.id });
  return `${entryPath}?${query.toString()}`;
}

/** Расширение и запись из адреса страницы; чего-то нет — `null`. */
export function entryTargetOf(search: string): EntryTarget | null {
  const params = new URLSearchParams(search);
  const extensionId = params.get("ext") ?? "";
  const id = params.get("id") ?? "";
  return extensionId !== "" && id !== "" ? { extensionId, id } : null;
}

/* ── Дата и порядок ── */

const pad = (value: number): string => String(value).padStart(2, "0");

const dayNumber = (date: Date): number =>
  Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );

/** «сегодня, 07:46», «вчера, 16:20», «2 октября», «2 октября 2025» — по часам покупателя. */
export function formatWhen(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const relative = RELATIVE_DAYS.get(dayNumber(now) - dayNumber(date));
  if (relative !== undefined)
    return `${relative}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear()
    ? day
    : `${day} ${date.getFullYear()}`;
}

/** Время для сравнения; дата не читается — самая старая. */
export const timeOf = (iso: string | null): number => {
  const time = Date.parse(iso ?? "");
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/** Новые сверху, как заказы в «Моих заказах». */
export function sortNewestFirst(rows: readonly RecordRow[]): RecordRow[] {
  return [...rows].sort(
    (left, right) => timeOf(right.date) - timeOf(left.date),
  );
}

/* ── Разметка (строки; всё от расширения экранируется) ── */

const badgeHtml = (status: string, tone: StatusTone | undefined): string =>
  `<span class="xo-badge"${attribute("data-tone", tone ?? NEUTRAL_TONE)}>${escapeHtml(status)}</span>`;

/** Строка записи в списке заказов: номер и заголовок, дата, статус справа. */
export function renderRowHtml(row: RecordRow, href: string, now: Date): string {
  return (
    `<a class="xo-row"${attribute("href", href)}${attribute("data-date", row.date)}>` +
    '<span class="xo-row-main">' +
    `<span class="xo-row-title">${escapeHtml(`${row.number} · ${row.title}`)}</span>` +
    `<span class="xo-row-date">${escapeHtml(formatWhen(row.date, now))}</span>` +
    "</span>" +
    badgeHtml(row.status, row.tone) +
    "</a>"
  );
}

const linesOf = (text: string): string =>
  text
    .split("\n")
    .map((line) => `<span class="xo-line">${escapeHtml(line)}</span>`)
    .join("");

function textHtml(text: string): string {
  const paragraphs = text.split(PARAGRAPH_BREAK);
  return paragraphs
    .map((part) => `<p class="xo-text">${linesOf(part)}</p>`)
    .join("");
}

const lineRowHtml = (row: LineRow, look: string): string =>
  `<div class="${look}"><span class="xo-label">${linesOf(row.label)}</span><span class="xo-value">${escapeHtml(row.value)}</span></div>`;

function linesHtml(rows: LineRow[], total: LineRow | undefined): string {
  const body = rows.map((row) => lineRowHtml(row, "xo-lines-row")).join("");
  const sum = total === undefined ? "" : lineRowHtml(total, "xo-lines-total");
  return `<div class="xo-lines">${body}${sum}</div>`;
}

const pairsHtml = (rows: LineRow[]): string =>
  `<div class="xo-pairs">${rows.map((row) => lineRowHtml(row, "xo-pair")).join("")}</div>`;

const buttonHtml = (label: string, url: string): string =>
  `<a class="xo-button"${attribute("href", url)}>${escapeHtml(label)}</a>`;

/** Один блок; набор типов закрыт — `switch` по типу проверяет компилятор. */
function blockHtml(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return textHtml(block.text);
    case "button":
      return buttonHtml(block.label, block.url);
    case "lines":
      return linesHtml(block.rows, block.total);
    case "pairs":
      return pairsHtml(block.rows);
  }
}

const backHtml = (ordersPath: string): string =>
  `<a class="xo-back"${attribute("href", ordersPath)}>${escapeHtml(TEXTS.back)}</a>`;

function viewHtml(view: EntryView, now: Date): string {
  const meta = `${view.title} · ${formatWhen(view.date, now)}`;
  return (
    '<div class="xo-head">' +
    `<h1 class="xo-number">${escapeHtml(view.number)}</h1>` +
    badgeHtml(view.status, view.tone) +
    "</div>" +
    `<div class="xo-meta">${escapeHtml(meta)}</div>` +
    `<div class="xo-blocks">${view.blocks.map(blockHtml).join("")}</div>`
  );
}

const STATE_HTML: Record<Exclude<EntryResult["kind"], "view">, string> = {
  missing: `<p class="xo-state">${escapeHtml(TEXTS.missing)}</p>`,
  failed: `<p class="xo-state">${escapeHtml(TEXTS.failed)}</p>`,
};

/** Страница записи целиком: «← Мои заказы», шапка, блоки — или текст состояния. */
export function renderEntryHtml(
  result: EntryResult,
  ordersPath: string,
  now: Date,
): string {
  const body =
    result.kind === "view"
      ? viewHtml(result.view, now)
      : STATE_HTML[result.kind];
  return `${backHtml(ordersPath)}${body}`;
}
