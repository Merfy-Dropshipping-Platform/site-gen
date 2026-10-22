import { Buffer } from 'node:buffer';
import { writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
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

const requestSchema = z.strictObject({
  id: z.number().int().positive(),
  hash: z.string().min(1),
  module: z.string().optional(),
  settings: z.record(z.string(), z.union([z.string(), z.boolean()])),
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
  const { id, hash, module, settings } = parsed.data;
  try {
    if (module !== undefined && !templates.has(hash)) templates.set(hash, loadTemplate(module));
    const template = templates.get(hash);
    if (template === undefined) return { id, answer: { error: `модуля ${hash} в процессе нет`, denied: false } };
    return { id, answer: { html: await renderTemplate(await template, settings) } };
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
