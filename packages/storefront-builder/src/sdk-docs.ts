import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { DrawAnswer } from './draw';
import type { Log } from './log';
import { jsonAnswer } from './stand-preview';

// Документация SDK для ИИ (блок 14 «Секций и SDK», Р14-15): файлы packages/sdk-docs/generated/ образа читаются при
// старте; адрес API прода из docs.json в текстах заменяется адресом API контура (STOREFRONT_API_URL) — ИИ на dev
// читает адреса dev. Отдаются только файлы из списка docs.json: путь из запроса с ними сверяется как строка.
export interface SdkDocs {
  answer: (file: string | null) => DrawAnswer;
}

const DOCS_JSON = 'docs.json';
const docsJsonSchema = z.object({ api: z.string().url(), files: z.array(z.string().min(1)) });
type DocsJson = z.infer<typeof docsJsonSchema>;

const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.astro': 'text/plain; charset=utf-8',
  '.schema.json': 'application/schema+json',
  '.json': 'application/json; charset=utf-8',
};

const NO_DOC = 'такого файла документации нет: оглавление — llms.txt';

const notFound = (): DrawAnswer => jsonAnswer(404, { ok: false, error: { code: 'doc-not-found', message: NO_DOC } });

// Тип файла — по расширению; section.schema.json — схема, остальные .json — данные.
function contentType(path: string): string {
  if (path.endsWith('.schema.json')) return CONTENT_TYPES['.schema.json'];
  const dot = path.lastIndexOf('.');
  const type = dot === -1 ? '' : CONTENT_TYPES[path.slice(dot)];
  return type ?? CONTENT_TYPES['.txt'];
}

// Адрес контура — с одной косой чертой в конце: так же записан адрес прода в docs.json.
function normalizeApiUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/`;
}

const EMPTY_DOCS: SdkDocs = { answer: () => notFound() };

// root — корень site-gen (ROOT в main.ts); apiUrl — STOREFRONT_API_URL. Нет docs.json — строка журнала
// sdk-docs-missing (dir) и 404 на все файлы: сборщик работает и без документации.
export async function loadSdkDocs(root: string, apiUrl: string, log: Log): Promise<SdkDocs> {
  const dir = join(root, 'packages', 'sdk-docs', 'generated');
  const raw = await readFile(join(dir, DOCS_JSON), 'utf-8').catch(() => null);
  const parsed = parseDocsJson(raw);
  if (parsed === null) {
    log('sdk-docs-missing', { dir });
    return EMPTY_DOCS;
  }
  const files = await readFiles(dir, parsed, normalizeApiUrl(apiUrl));
  return { answer: (file) => answerOf(files, file) };
}

// docs.json — вход из образа (JSON, а не доверенный код): разбираем схемой, битый файл — как отсутствующий.
function parseDocsJson(raw: string | null): DocsJson | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = docsJsonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Файлы из списка docs.json — с заменённым адресом прода на адрес контура.
async function readFiles(dir: string, docs: DocsJson, apiUrl: string): Promise<Map<string, DrawAnswer>> {
  const files = new Map<string, DrawAnswer>();
  for (const path of docs.files) {
    const text = await readFile(join(dir, path), 'utf-8').catch(() => null);
    if (text === null) continue;
    const body = text.split(docs.api).join(apiUrl);
    files.set(path, { status: 200, body, headers: { 'Content-Type': contentType(path), 'Cache-Control': 'no-store' } });
  }
  return files;
}

function answerOf(files: Map<string, DrawAnswer>, file: string | null): DrawAnswer {
  if (file === null) return notFound();
  return files.get(file) ?? notFound();
}
