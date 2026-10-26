import { tokenOf } from '../customer-token';
import { EXT_POINT_ATTRIBUTE } from '../ext-points';
import { requestJson, type JsonRequest } from '../requests';
import { pageStorage, type KeyValue } from '../storage';
import type { StorefrontConfig } from '@merfy/storefront-config';
import type { CoreHandle, Json, SdkPart } from '../types';

// Часть records (блок 12 «Секций и SDK», место — 12б, Р12б-12; свой код — 12е, Р12е-3…Р12е-5): записи расширений
// покупательницы в месте data-ext-point «orders» — отдельным списком под заказами. Поведение и тексты —
// extension-orders.ts и extension-orders-view.ts theme-base; theme-base не импортируется: разметка — DOM и
// textContent, классы — только EXT_POINT_CLASSES.records. В превью конструктора блоков нет (Р12б-17).

const TEXTS = {
  back: '← Мои заказы',
  missing: 'Запись не найдена',
  failed: 'Не удалось загрузить. Обновите страницу.',
} as const;
const STATUS_TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const;
const KNOWN_TONES: readonly string[] = STATUS_TONES;
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;
const BUTTON_CLASSES =
  'inline-flex h-11 items-center justify-center rounded-button border border-primary-border bg-primary px-6 text-primary-foreground';
const LIST_CLASSES = 'flex flex-col gap-2 p-5 border border-border rounded-card text-foreground underline';
const ENTRY_CLASSES = 'flex flex-col gap-4';

// Точка карты расширений с orders.list и orders.get (findOrdersPoints theme-base).
interface OrdersPoint {
  readonly id: string;
  readonly list: string;
  readonly get: string;
}

interface RecordItem {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly tone: string | undefined;
  readonly date: string;
  readonly when: number;
}

interface LabeledRow {
  readonly label: string;
  readonly value: string;
}

type EntryBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'rows';
      readonly kind: 'pairs' | 'lines';
      readonly rows: readonly LabeledRow[];
      readonly total: LabeledRow | undefined;
    }
  | { readonly type: 'button'; readonly label: string; readonly url: string };

interface EntryView {
  readonly number: string;
  readonly title: string;
  readonly status: string | undefined;
  readonly tone: string | undefined;
  readonly date: string;
  readonly blocks: readonly EntryBlock[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// Данные успешного ответа шлюза: 2xx и success.
function okData(reply: { readonly status: number; readonly body: unknown }): unknown {
  if (reply.status < 200 || reply.status > 299) return undefined;
  const body = isRecord(reply.body) ? reply.body : null;
  return body !== null && body.success === true ? body.data : undefined;
}

// Тон статуса: незнакомое слово — нейтральный.
function toneOf(value: unknown): string {
  const tone = textOf(value);
  return tone !== null && KNOWN_TONES.includes(tone) ? tone : 'neutral';
}

function mapUrl(config: StorefrontConfig): string {
  return `${config.api.url}/store/extensions/storefront?store_id=${encodeURIComponent(config.shop.id)}`;
}

function fnUrl(config: StorefrontConfig, id: string, fn: string): string {
  const path = `/store/extensions/${encodeURIComponent(id)}/fn/${encodeURIComponent(fn)}`;
  return `${config.api.url}${path}?store_id=${encodeURIComponent(config.shop.id)}`;
}

// Запрос функции расширения — POST с телом и токеном покупательницы, как у orders и auth (часть 12е, Р12е-1).
function fnRequest(page: KeyValue, body: Json): JsonRequest {
  const token = tokenOf(page);
  return token === null ? { method: 'POST', body } : { method: 'POST', body, token };
}

// Карта расширений (Р12е-4): точки — по порядку ключей, у которых orders.list и orders.get — непустые строки.
async function ordersPointsOf(config: StorefrontConfig): Promise<readonly OrdersPoint[]> {
  const reply = await requestJson(mapUrl(config), { method: 'GET' });
  const data = okData(reply);
  if (!isRecord(data)) return [];
  return Object.entries(data).flatMap(([id, entry]) => {
    const orders = isRecord(entry) ? entry.orders : undefined;
    const list = isRecord(orders) ? textOf(orders.list) : null;
    const get = isRecord(orders) ? textOf(orders.get) : null;
    return list === null || get === null ? [] : [{ id, list, get }];
  });
}

// Строки одного расширения: неполные и с нечитаемой датой пропускаются, сбой расширения — строк нет.
function readListItems(data: unknown): readonly RecordItem[] {
  if (!isRecord(data) || !Array.isArray(data.items)) return [];
  return data.items.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const id = textOf(raw.id);
    const number = textOf(raw.number);
    const title = textOf(raw.title);
    const status = textOf(raw.status);
    const date = textOf(raw.date);
    const when = date === null ? Number.NaN : Date.parse(date);
    if (id === null || number === null || title === null || status === null || Number.isNaN(when)) return [];
    return [{ id, number, title, status, tone: textOf(raw.tone) ?? undefined, date: date ?? '', when }];
  });
}

function readRow(raw: unknown): LabeledRow | null {
  if (!isRecord(raw)) return null;
  const label = textOf(raw.label);
  const value = textOf(raw.value);
  return label === null || value === null ? null : { label, value };
}

const readRows = (raw: unknown): readonly LabeledRow[] =>
  Array.isArray(raw)
    ? raw.flatMap((one) => {
        const row = readRow(one);
        return row === null ? [] : [row];
      })
    : [];

function readBlock(raw: unknown): readonly EntryBlock[] {
  if (!isRecord(raw)) return [];
  if (raw.type === 'text') {
    const text = textOf(raw.text);
    return text === null ? [] : [{ type: 'text', text }];
  }
  if (raw.type === 'button') {
    const label = textOf(raw.label);
    const url = textOf(raw.url);
    return label === null || url === null ? [] : [{ type: 'button', label, url }];
  }
  if (raw.type === 'pairs' || raw.type === 'lines') {
    const rows = readRows(raw.rows);
    if (rows.length === 0) return [];
    const total = raw.type === 'lines' ? readRow(raw.total) : null;
    return [{ type: 'rows', kind: raw.type, rows, total: total ?? undefined }];
  }
  return []; // неизвестный блок — пропуск (video и другие — в части 12д)
}

// Запись по форме (readEntryView theme-base): неполная — null.
function readEntryView(data: unknown): EntryView | null {
  if (!isRecord(data)) return null;
  const number = textOf(data.number);
  const title = textOf(data.title);
  if (number === null || title === null) return null;
  const blocks = Array.isArray(data.blocks) ? data.blocks.flatMap(readBlock) : [];
  return {
    number,
    title,
    status: textOf(data.status) ?? undefined,
    tone: textOf(data.tone) ?? undefined,
    date: textOf(data.date) ?? '',
    blocks,
  };
}

// formatWhen: «сегодня, ЧЧ:ММ», «вчера, ЧЧ:ММ» по календарным дням часов покупателя; иначе «Д месяца», другой год —
// «Д месяца ГГГГ»; дата не читается — ''.
function formatWhen(date: string, now: Date): string {
  const when = new Date(date);
  if (date === '' || Number.isNaN(when.getTime())) return '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const midnight = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (midnight(when) === midnight(now)) return `сегодня, ${time}`;
  if (midnight(when) === midnight(yesterday)) return `вчера, ${time}`;
  const day = `${when.getDate()} ${MONTHS[when.getMonth()]}`;
  return when.getFullYear() === now.getFullYear() ? day : `${day} ${when.getFullYear()}`;
}

// safeLink: строка без пробелов, обратной косой и управляющих знаков; свой путь (не //) или https:// — иначе null.
function safeLink(url: string): string | null {
  if (/\s/.test(url) || url.includes('\\')) return null;
  const control = [...url].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (control) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return url.startsWith('https://') ? url : null;
}

function textNode(tag: string, className: string | null, text: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== null) node.className = className;
  node.textContent = text;
  return node;
}

// Строка списка: ссылка на страницу записи с номером, датой и статусом.
function rowOf(point: OrdersPoint, item: RecordItem): HTMLAnchorElement {
  const row = document.createElement('a');
  row.className = LIST_CLASSES;
  row.setAttribute('data-date', item.date);
  row.href = `${location.pathname}?ext=${encodeURIComponent(point.id)}&id=${encodeURIComponent(item.id)}`;
  row.append(
    textNode('span', 'text-sm', `${item.number} · ${item.title}`),
    textNode('span', 'text-sm', formatWhen(item.date, new Date())),
  );
  const status = textNode('span', 'text-sm', item.status);
  status.setAttribute('data-tone', toneOf(item.tone));
  row.append(status);
  return row;
}

async function rowsOf(config: StorefrontConfig, page: KeyValue, point: OrdersPoint): Promise<readonly RecordItem[]> {
  const reply = await requestJson(fnUrl(config, point.id, point.list), fnRequest(page, {}));
  return readListItems(okData(reply));
}

// Список (renderRows theme-base): строки всех точек вместе, новые сверху.
async function renderRows(
  config: StorefrontConfig,
  page: KeyValue,
  places: readonly HTMLElement[],
  points: readonly OrdersPoint[],
): Promise<void> {
  const lists = await Promise.all(points.map((point) => rowsOf(config, page, point)));
  const withPoints = lists.flatMap((items, index) => items.map((item) => [points[index], item] as const));
  const sorted = withPoints.sort((one, two) => two[1].when - one[1].when);
  for (const place of places) for (const [point, item] of sorted) place.append(rowOf(point, item));
}

function backLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'underline text-sm';
  link.href = location.pathname;
  link.textContent = TEXTS.back;
  return link;
}

function rowLine(row: LabeledRow, heading: boolean): HTMLElement {
  const line = document.createElement('div');
  line.className = heading ? 'flex gap-2 text-sm font-heading weight-heading' : 'flex gap-2 text-sm';
  line.append(textNode('span', null, row.label), textNode('span', null, row.value));
  return line;
}

// Текст-блок: абзац на часть между пустыми строками, строка текста — span (переносы строк не съедаются).
function textBlock(text: string): readonly HTMLElement[] {
  return text.split(/\n{2,}/).map((part) => {
    const paragraph = document.createElement('p');
    paragraph.className = 'text-base m-0';
    for (const line of part.split('\n')) paragraph.append(textNode('span', null, line));
    return paragraph;
  });
}

function blockNodes(block: EntryBlock): readonly HTMLElement[] {
  if (block.type === 'text') return textBlock(block.text);
  if (block.type === 'button') {
    const url = safeLink(block.url);
    if (url === null) return [];
    const button = document.createElement('a');
    button.className = BUTTON_CLASSES;
    button.href = url;
    button.textContent = block.label;
    return [button];
  }
  const table = document.createElement('div');
  table.className = 'flex flex-col gap-2';
  for (const row of block.rows) table.append(rowLine(row, false));
  if (block.total !== undefined) table.append(rowLine(block.total, true));
  return [table];
}

// Запись (renderEntry theme-base): номер и статус, заголовок с датой, блоки.
function entryNodes(view: EntryView): readonly HTMLElement[] {
  const entry = document.createElement('div');
  entry.className = ENTRY_CLASSES;
  const head = document.createElement('div');
  head.className = 'flex gap-2';
  head.append(textNode('p', 'font-heading weight-heading text-heading m-0', view.number));
  const status = textNode('span', 'text-sm', view.status ?? '');
  status.setAttribute('data-tone', toneOf(view.tone));
  head.append(status);
  entry.append(head);
  const when = formatWhen(view.date, new Date());
  entry.append(textNode('p', 'text-base m-0', when === '' ? view.title : `${view.title} · ${when}`));
  for (const block of view.blocks) entry.append(...blockNodes(block));
  return [entry];
}

function messageOf(text: string): readonly HTMLElement[] {
  return [textNode('p', 'text-base m-0', text)];
}

// Страница записи: ?ext= есть — запись одного расширения; первым всегда «← Мои заказы».
async function renderEntry(
  config: StorefrontConfig,
  page: KeyValue,
  places: readonly HTMLElement[],
  points: readonly OrdersPoint[],
  ext: string,
  id: string,
): Promise<void> {
  const point = points.find((one) => one.id === ext);
  const view = point === undefined || id === '' ? 'missing' : await entryOf(config, page, point, id);
  const body = view === 'missing' || view === 'failed' ? messageOf(TEXTS[view]) : entryNodes(view);
  for (const place of places) place.append(backLink(), ...body);
}

async function entryOf(
  config: StorefrontConfig,
  page: KeyValue,
  point: OrdersPoint,
  id: string,
): Promise<EntryView | 'missing' | 'failed'> {
  const reply = await requestJson(fnUrl(config, point.id, point.get), fnRequest(page, { id }));
  const data = okData(reply);
  if (data === undefined) return 'failed';
  if (data === null) return 'missing';
  const view = readEntryView(data);
  return view === null ? 'failed' : view;
}

// Список или запись — по адресу страницы (Р12е-5): список заказов — разметка другой секции, часть его не трогает.
async function showRecords(config: StorefrontConfig, page: KeyValue, places: readonly HTMLElement[]): Promise<void> {
  const points = await ordersPointsOf(config);
  if (points.length === 0) return;
  const params = new URLSearchParams(location.search);
  const ext = params.get('ext') ?? '';
  const id = params.get('id') ?? '';
  if (ext === '') await renderRows(config, page, places, points);
  else await renderEntry(config, page, places, points, ext, id);
}

export const records: SdkPart<'records', Readonly<Record<string, never>>> = {
  name: 'records',
  create: (core): Readonly<Record<string, never>> => {
    CORES.set(EMPTY_API, core);
    return EMPTY_API;
  },
  attach: (api, host): void => {
    if (host.mode === 'preview') return;
    const core = CORES.get(api);
    const config = core?.config ?? null;
    if (core === undefined || config === null) return;
    const places = [...host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="orders"]`)];
    if (places.length === 0) return;
    void showRecords(config, pageStorage(window, core.mode), places);
  },
};

const EMPTY_API: Readonly<Record<string, never>> = Object.freeze({});
const CORES = new WeakMap<Readonly<Record<string, never>>, CoreHandle>();
