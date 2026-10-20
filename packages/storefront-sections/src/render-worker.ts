import { createInterface } from 'node:readline';
import { z } from 'zod';
import { loadTemplate } from './module-loader';
import { renderTemplate, type TemplateComponent } from './trial-render';

// Процесс рендера секций (render.ts): строки JSON на stdin и stdout. Первая строка ответа — {"ready":true}. Запрос —
// { id, hash, module?, settings }: module приходит один раз на hash, загруженный шаблон хранится по hash. Ответ —
// { id, html } или { id, error }. Запросы — по очереди, в порядке прихода.
const requestSchema = z.strictObject({
  id: z.number().int(),
  hash: z.string().min(1),
  module: z.string().optional(),
  settings: z.record(z.string(), z.union([z.string(), z.boolean()])),
});

const templates = new Map<string, Promise<TemplateComponent>>();

function requestOf(line: string) {
  try {
    return requestSchema.safeParse(JSON.parse(line));
  } catch {
    return null;
  }
}

async function answerTo(line: string): Promise<object> {
  const parsed = requestOf(line);
  if (parsed === null || !parsed.success) return { id: -1, error: 'запрос не по форме' };
  const { id, hash, module, settings } = parsed.data;
  try {
    if (module !== undefined && !templates.has(hash)) templates.set(hash, loadTemplate(module));
    const template = templates.get(hash);
    if (template === undefined) return { id, error: `модуля ${hash} в процессе нет` };
    return { id, html: await renderTemplate(await template, settings) };
  } catch (error) {
    return { id, error: error instanceof Error ? error.message : String(error) };
  }
}

let queue = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  queue = queue.then(async () => {
    process.stdout.write(`${JSON.stringify(await answerTo(line))}\n`);
  });
});
process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
