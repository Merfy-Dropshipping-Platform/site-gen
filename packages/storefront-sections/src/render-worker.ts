import { Buffer } from 'node:buffer';
import { writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { PageList } from '@merfy/storefront-build';
import { z } from 'zod';
import { loadTemplate } from './module-loader';
import { renderTemplate, type TemplateComponent } from './trial-render';

// Процесс рендера секций (render.ts; блок 2 «Секций и SDK», «Решил сам» п. 2). Запросы — строки JSON на stdin: первая —
// ключ процесса, дальше { id, hash, module?, settings }; module приходит один раз на hash, загруженный шаблон хранится
// по hash. Ответы — рамками в дескриптор 3: строка «<ключ> <id> <байт>\n» и ровно столько байт JSON — { ready: true }
// (id 0), { html } или { error, denied }. Ключа у модуля секции нет: подделать ответ записью в дескриптор он не может.
// Запись в дескриптор сохранена до первого модуля секции — модуль её не подменит.
const write = writeSync;
const CHANNEL = 3;
const PAUSE = new Int32Array(new SharedArrayBuffer(4));

// Значения настроек: секции и каждого блока. blocks и preview — часть 3; в запросе старой формы их нет: блоков нет,
// режим — витрина.
const valuesSchema = z.record(z.string(), z.json());
// Часть 4 (Р1-4-3, Р1-4-4, Р1-4-6): деревья меню по id настройки, настройки темы, данные магазина. Схемы — здесь же:
// процесс рендера собран в один файл и пакеты сборки во время работы не загружает. Нет ключа — пусто.
const menuLeafSchema = z.strictObject({ label: z.string(), url: z.string(), items: z.tuple([]) });
const menuMiddleSchema = z.strictObject({ label: z.string(), url: z.string(), items: z.array(menuLeafSchema) });
const menuItemSchema = z.strictObject({ label: z.string(), url: z.string(), items: z.array(menuMiddleSchema) });
const menuTreeSchema = z.strictObject({ title: z.string(), items: z.array(menuItemSchema) });
const shopSchema = z.strictObject({
  name: z.string(),
  contacts: z.strictObject({
    phone: z.string(),
    email: z.string(),
    fields: z.array(z.strictObject({ label: z.string(), value: z.string() })),
  }),
  policies: z.array(z.strictObject({ type: z.string(), title: z.string(), url: z.string() })),
  payments: z.strictObject({ online: z.boolean() }),
  // Блок 11, часть 11а: адрес каталога или null; в запросе старой формы ключа нет.
  catalogUrl: z.string().nullable().default(null),
});
const EMPTY_SHOP = {
  name: '',
  contacts: { phone: '', email: '', fields: [] },
  policies: [],
  payments: { online: false },
  catalogUrl: null,
};
// Блок 7, часть 7а: страница, на которой стоит секция; у страницы 404 адреса нет. Нет ключа — главная.
// Блок 8, часть 8б: запись страницы шаблона — публичные поля записи; у страницы без записи — null.
const pageSchema = z.strictObject({
  id: z.string(),
  path: z.string().nullable(),
  record: z.record(z.string(), z.json()).nullable().default(null),
  // Блок 11, часть 11а: список страницы (page.list) — карточки, номера, выбранное; у страницы без списка — null.
  list: z
    .custom<PageList | null>(() => true)
    .nullable()
    .default(null),
});
const HOME_PAGE = { id: 'home', path: '/', record: null, list: null };
const requestSchema = z.strictObject({
  id: z.number().int().positive(),
  hash: z.string().min(1),
  module: z.string().optional(),
  settings: valuesSchema,
  blocks: z.array(z.strictObject({ id: z.string(), type: z.string(), settings: valuesSchema })).default([]),
  preview: z.boolean().default(false),
  menus: z.record(z.string(), menuTreeSchema).default({}),
  theme: valuesSchema.default({}),
  shop: shopSchema.default(EMPTY_SHOP),
  page: pageSchema.default(HOME_PAGE),
  // Блок 8, часть 8г: записи полей с записями по id настройки — публичные поля записи или null; нет ключа — {}.
  records: z.record(z.string(), z.record(z.string(), z.json()).nullable()).default({}),
});

const templates = new Map<string, Promise<TemplateComponent>>();

// Канал занят (EAGAIN) — короткая пауза и та же запись ещё раз.
function writeChunk(bytes: Buffer, offset: number): number {
  try {
    return write(CHANNEL, bytes, offset);
  } catch (error) {
    if (Reflect.get(Object(error), 'code') !== 'EAGAIN') throw error;
    Atomics.wait(PAUSE, 0, 0, 5);
    return 0;
  }
}

function writeAll(bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeChunk(bytes, offset);
}

function send(key: string, id: number, answer: object): void {
  const payload = Buffer.from(JSON.stringify(answer), 'utf8');
  writeAll(Buffer.from(`${key} ${id} ${payload.length}\n`, 'utf8'));
  writeAll(payload);
}

// Отказ модели разрешений Node — ERR_ACCESS_DENIED у ошибки или у её причины (fetch).
function denied(error: unknown): boolean {
  const cause: unknown = Reflect.get(Object(error), 'cause');
  return [Reflect.get(Object(error), 'code'), Reflect.get(Object(cause), 'code')].includes('ERR_ACCESS_DENIED');
}

function requestOf(line: string) {
  try {
    return requestSchema.safeParse(JSON.parse(line));
  } catch {
    return null;
  }
}

async function answerTo(line: string): Promise<{ id: number; answer: object }> {
  const parsed = requestOf(line);
  if (parsed === null || !parsed.success) return { id: 0, answer: { error: 'запрос не по форме', denied: false } };
  const { id, hash, module, settings, blocks, preview, menus, theme, shop, page, records } = parsed.data;
  try {
    if (module !== undefined && !templates.has(hash)) templates.set(hash, loadTemplate(module));
    const template = templates.get(hash);
    if (template === undefined) return { id, answer: { error: `модуля ${hash} в процессе нет`, denied: false } };
    // Блок 11: list — PageList или undefined (null процесса — «списка нет»).
    const props = {
      settings,
      blocks,
      preview,
      menus,
      theme,
      shop,
      page: { ...page, list: page.list ?? undefined },
      records,
    };
    return { id, answer: { html: await renderTemplate(await template, props) } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { id, answer: { error: message, denied: denied(error) } };
  }
}

let key: string | null = null;
let queue = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  if (key === null) {
    key = line;
    send(key, 0, { ready: true });
    return;
  }
  const current = key;
  queue = queue.then(async () => {
    const { id, answer } = await answerTo(line);
    send(current, id, answer);
  });
});
