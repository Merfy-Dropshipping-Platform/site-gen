import { CUSTOMER_TOKEN_KEY } from '../customer-token';
import { EXT_POINT_ATTRIBUTE } from '../ext-points';
import { pageStorage } from '../storage';
import type { ExtensionPoints, StorefrontConfig } from '@merfy/storefront-config';
import type { CoreHandle, InstanceHost, SdkPart } from '../types';
import { cartIdOf } from './cart';

// Часть points (блок 12 «Секций и SDK», часть 12б, Р12б-15): блоки включённых расширений в местах data-ext-point
// «cart» и «account» — поведение theme-base (renderCartPoint и renderAccountPoint), но разметка — только классы
// словаря EXT_POINT_CLASSES.points: theme-base в бандл не входит (Р12б-15). Описания мест — из конфига страницы
// (config.extPoints): их вписывает сборка (блок 15, часть 15д). В превью конструктора блоков нет — данных
// магазина и покупателя там нет (Р12б-17). Своих методов для секций нет: api — пустой замороженный объект.
export const points: SdkPart<'points', Readonly<Record<string, never>>> = {
  name: 'points',
  create: (core): Readonly<Record<string, never>> => {
    CORES.set(EMPTY_API, core);
    return EMPTY_API;
  },
  attach: (api, host): void => {
    if (host.mode === 'preview') return;
    const core = CORES.get(api);
    if (core !== undefined) attachPoints(core, host);
  },
};

const EMPTY_API: Readonly<Record<string, never>> = Object.freeze({});
const CORES = new WeakMap<Readonly<Record<string, never>>, CoreHandle>();

const CART_EVENTS = ['merfy:cart:add', 'merfy:cart:change', 'merfy:cart:remove'] as const;
const BUTTON_CLASSES =
  'inline-flex h-11 w-full items-center justify-center rounded-button border border-primary-border bg-primary px-6 text-primary-foreground';

// Описания мест — типы конфига страницы (часть 15д, Р15д-1): сборка вписала и проверила их схемой.
type NoteSpec = NonNullable<ExtensionPoints['cart']>['note'];
type AccountSpec = NonNullable<ExtensionPoints['account']>;
type Descriptions = NonNullable<StorefrontConfig['extPoints']>;
type Values = Readonly<Record<string, unknown>>;

interface ShopApi {
  readonly url: string;
  readonly storeId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const textOf = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
};

const shopApiOf = (core: CoreHandle): ShopApi | null => {
  const config = core.config;
  if (config === null) return null;
  return { url: config.api.url, storeId: config.shop.id };
};

async function readJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { credentials: 'omit', ...init });
  return response.ok ? await response.json() : null;
}

const dataOf = (reply: unknown): Values | null => {
  if (!isRecord(reply) || reply.success !== true || !isRecord(reply.data)) return null;
  return reply.data;
};

// Описания мест из конфига страницы (часть 15д, Р15д-1; было — запрос карты расширений шлюза, Р12б-14).
const descriptionsOf = (core: CoreHandle): Descriptions => core.config?.extPoints ?? {};

// Вид корзины расширения: GET /store/carts/<id>?store_id=, id — из хранилища страницы части cart.
async function cartViewsOf(api: ShopApi, host: InstanceHost): Promise<Values> {
  const cartId = cartIdOf(pageStorage(window, host.mode));
  if (cartId === null) return {};
  const url = `${api.url}/store/carts/${encodeURIComponent(cartId)}?store_id=${encodeURIComponent(api.storeId)}`;
  const data = dataOf(await readJson(url, { credentials: 'include' }));
  const extensions = data === null ? undefined : data.extensions;
  if (!isRecord(extensions)) return {};
  return Object.fromEntries(
    Object.entries(extensions).map(([id, entry]) => [id, isRecord(entry) && isRecord(entry.view) ? entry.view : {}]),
  );
}

const noteShown = (note: NoteSpec, view: Values): boolean =>
  note.when === undefined || Boolean(view[note.when]);

const noteText = (note: NoteSpec, view: Values): string =>
  note.text.replace(/\{(\w+)\}/g, (_match, key: string) => textOf(view[key]));

function blockOf(id: string, className: string): HTMLElement {
  const block = document.createElement('div');
  block.setAttribute('data-ext-id', id);
  block.className = className;
  return block;
}

function paintCartNotes(place: HTMLElement, notes: ReadonlyMap<string, NoteSpec>, views: Values): void {
  place.replaceChildren();
  for (const [id, note] of notes) {
    const view = isRecord(views[id]) ? views[id] : {};
    if (!noteShown(note, view)) continue;
    const block = blockOf(id, 'text-sm');
    block.textContent = noteText(note, view);
    place.append(block);
  }
}

// Заметка появляется после каждого изменения корзины (события части cart), пока секция жива.
function attachCart(
  core: CoreHandle,
  host: InstanceHost,
  places: readonly HTMLElement[],
  notes: ReadonlyMap<string, NoteSpec>,
): void {
  if (notes.size === 0) return;
  const draw = (): void => {
    const api = shopApiOf(core);
    if (api !== null)
      void cartViewsOf(api, host)
        .then((views) => places.forEach((place) => paintCartNotes(place, notes, views)))
        .catch(() => undefined); // сбой запроса корзины — место остаётся пустым
  };
  draw();
  for (const name of CART_EVENTS) host.element.addEventListener(name, draw, { signal: host.signal });
}

// Функция расширения — POST /store/extensions/<id>/fn/<имя> с токеном покупательницы; нет токена или имени — null.
async function callFn(api: ShopApi, id: string, name: string | undefined, body: Values): Promise<Values | null> {
  if (name === undefined || name === '') return null;
  const token = localStorage.getItem(CUSTOMER_TOKEN_KEY);
  if (token === null || token === '') return null;
  const tail = `${encodeURIComponent(id)}/fn/${encodeURIComponent(name)}`;
  const url = `${api.url}/store/extensions/${tail}?store_id=${encodeURIComponent(api.storeId)}`;
  return dataOf(
    await readJson(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
  );
}

const fieldValueOf = (raw: unknown, kind: string | undefined): string => {
  const text = textOf(raw);
  if (text === '') return '—';
  if (kind === 'date' && !Number.isNaN(Date.parse(text))) return new Date(text).toLocaleDateString('ru-RU');
  return text;
};

function fieldRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'flex gap-2 text-sm';
  const key = document.createElement('span');
  key.textContent = label;
  const data = document.createElement('span');
  data.textContent = value;
  row.append(key, data);
  return row;
}

function appendFields(fields: HTMLElement, spec: AccountSpec, source: Values): void {
  for (const field of spec.fields ?? [])
    fields.append(fieldRow(field.label ?? field.key, fieldValueOf(source[field.key], field.kind)));
}

function appendCopy(fields: HTMLElement, spec: AccountSpec, source: Values): void {
  const copy = spec.copy;
  if (copy === undefined) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'underline text-sm';
  button.textContent = copy.label ?? 'Скопировать';
  button.addEventListener('click', () => void navigator.clipboard?.writeText(textOf(source[copy.key])));
  fields.append(button);
}

function appendList(api: ShopApi, container: HTMLElement, id: string, spec: NonNullable<AccountSpec['list']>): void {
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'underline text-sm';
  more.textContent = 'Показать ещё';
  const body = document.createElement('div');
  body.className = 'flex flex-col gap-2';
  let cursor: unknown;
  const loadPage = (): void => {
    void callFn(api, id, spec.source, cursor === undefined ? {} : { cursor }).then((reply) => {
      const page = isRecord(reply) ? reply : {};
      const items = Array.isArray(page.items) ? page.items : [];
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'flex gap-2 text-sm';
        for (const column of spec.columns)
          row.append(fieldRow(column, textOf(isRecord(item) ? item[column] : undefined)));
        body.append(row);
      }
      cursor = page.cursor;
      more.hidden = page.done !== false;
    });
  };
  more.addEventListener('click', loadPage);
  loadPage();
  container.append(body, more);
}

function appendForm(
  api: ShopApi,
  container: HTMLElement,
  id: string,
  spec: NonNullable<AccountSpec['form']>,
  saved: () => void,
): void {
  const form = document.createElement('form');
  form.className = 'flex flex-col gap-2';
  for (const field of spec.fields ?? []) {
    const input = document.createElement('input');
    input.type = field.input === 'checkbox' ? 'checkbox' : (field.input ?? 'text');
    input.required = field.required === true;
    form.append(fieldRow(field.label ?? field.key, ''), input);
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = BUTTON_CLASSES;
  submit.textContent = 'Сохранить';
  form.append(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void callFn(api, id, spec.fn, {}).then(saved);
  });
  container.append(form);
}

// Кабинет (В12-2 А): поля, копирование, список и форма расширения — как renderAccountEntry theme-base.
function attachAccount(api: ShopApi, place: HTMLElement, id: string, spec: AccountSpec): void {
  if (localStorage.getItem(CUSTOMER_TOKEN_KEY) === null) return;
  const block = blockOf(id, 'flex flex-col gap-4 border border-border rounded-card bg-background p-5');
  if (spec.title !== undefined) {
    const heading = document.createElement('h2');
    heading.className = 'font-heading weight-heading text-heading';
    heading.textContent = spec.title;
    block.append(heading);
  }
  const fields = document.createElement('div');
  fields.className = 'flex flex-col gap-2';
  block.append(fields);
  const loadSource = (): void => {
    void callFn(api, id, spec.source, {}).then((source) => {
      fields.replaceChildren();
      const values = source ?? {};
      appendFields(fields, spec, values);
      appendCopy(fields, spec, values);
    });
  };
  loadSource();
  if (spec.list !== undefined) appendList(api, block, id, spec.list);
  if (spec.form !== undefined) appendForm(api, block, id, spec.form, loadSource);
  place.append(block);
}

function attachAccounts(api: ShopApi, places: readonly HTMLElement[], descriptions: Descriptions): void {
  const accounts = Object.entries(descriptions).flatMap(([id, description]) => {
    const account = description.account;
    return account === undefined ? [] : [[id, account] as const];
  });
  if (accounts.length === 0) return;
  for (const place of places) for (const [id, account] of accounts) attachAccount(api, place, id, account);
}

function attachPoints(core: CoreHandle, host: InstanceHost): void {
  const api = shopApiOf(core);
  if (api === null) return;
  const carts = [...host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="cart"]`)];
  const accounts = [...host.element.querySelectorAll<HTMLElement>(`[${EXT_POINT_ATTRIBUTE}="account"]`)];
  if (carts.length === 0 && accounts.length === 0) return;
  const descriptions = descriptionsOf(core);
  const notes = new Map(
    Object.entries(descriptions).flatMap(([id, description]) => {
      const note = description.cart?.note;
      return note === undefined ? [] : [[id, note] as const];
    }),
  );
  if (carts.length > 0) attachCart(core, host, carts, notes);
  attachAccounts(api, accounts, descriptions);
}
