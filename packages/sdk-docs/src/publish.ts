import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { PACKAGE_DIR, SDK_VERSION } from './meta';

// Выгрузка текстов документации в хранилище (раздел «Документация», задача З2): generated/ → бакет MinIO, папка
// storefront-sdk/v<мажор SDK>/, затем storefront-sdk/versions.json — список мажоров и текущая версия документации.
// Модуль не входит в index.ts: aws-sdk нужен только скрипту выгрузки (scripts/publish.ts) и тестам.
export const SECTION = 'storefront-sdk';
export const SECTION_TITLE = 'Витринный SDK';
export const DEFAULT_BUCKET = 'merfy-docs';
export const DEFAULT_ENDPOINT = 'https://minio.merfy.ru';
export const VERSIONS_KEY = `${SECTION}/versions.json`;
export const GENERATED_DIR: string = join(PACKAGE_DIR, 'generated');

// Ошибка выгрузки с готовым текстом для человека: скрипт печатает её и выходит с кодом 1.
export class DocsPublishError extends Error {}

export interface PublishConfig {
  bucket: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
}

export type Env = Readonly<Record<string, string | undefined>>;

const valueOf = (env: Env, name: string): string => env[name]?.trim() ?? '';

// Бакет и адрес — по умолчанию прод-хранилище; ключей по умолчанию нет: без них выгрузка не начинается.
export function configFrom(env: Env): PublishConfig {
  const accessKey = valueOf(env, 'DOCS_S3_ACCESS_KEY');
  const secretKey = valueOf(env, 'DOCS_S3_SECRET_KEY');
  const missing = [accessKey === '' ? 'DOCS_S3_ACCESS_KEY' : '', secretKey === '' ? 'DOCS_S3_SECRET_KEY' : ''].filter(
    (name) => name !== '',
  );
  if (missing.length > 0) throw new DocsPublishError(`Не заданы ключи хранилища документации: ${missing.join(', ')}.`);
  return {
    bucket: valueOf(env, 'DOCS_S3_BUCKET') || DEFAULT_BUCKET,
    endpoint: valueOf(env, 'DOCS_S3_ENDPOINT') || DEFAULT_ENDPOINT,
    accessKey,
    secretKey,
  };
}

export const clientFor = (config: PublishConfig): S3Client =>
  new S3Client({
    endpoint: config.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.astro': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
};

export function contentTypeOf(path: string): string {
  const type = CONTENT_TYPES[extname(path)];
  if (type === undefined) throw new DocsPublishError(`Файл ${path}: для такого расширения не задан Content-Type.`);
  return type;
}

export const majorOf = (sdk: number): string => `v${sdk}`;

// Ключ объекта: storefront-sdk/v1/<путь>; вложенные папки (template/…) сохраняются.
export const keyOf = (major: string, path: string): string => `${SECTION}/${major}/${path.split('\\').join('/')}`;

// Файлы папки по относительным путям с «/», по алфавиту.
export async function listFiles(dir: string): Promise<string[]> {
  const all = await readdir(dir, { recursive: true, encoding: 'utf8' });
  const kinds = await Promise.all(all.map(async (path) => (await stat(join(dir, path))).isFile()));
  return all
    .filter((_, index) => kinds[index] === true)
    .map((path) => relative(dir, join(dir, path)).split('\\').join('/'))
    .sort();
}

const docsInfoSchema = z.object({
  sdk: z.number(),
  version: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DocsInfo = z.infer<typeof docsInfoSchema>;

// Версия, дата и мажор SDK документации — из docs.json, который записала генерация: выгружается ровно то, что лежит в
// generated/. Мажор другой, чем в meta.ts, — генерацию забыли: выгрузка не начинается.
export async function readDocsInfo(dir: string): Promise<DocsInfo> {
  const parsed = docsInfoSchema.safeParse(JSON.parse(await readFile(join(dir, 'docs.json'), 'utf8')));
  if (!parsed.success) throw new DocsPublishError('generated/docs.json не по форме: запусти pnpm generate.');
  if (parsed.data.sdk !== SDK_VERSION)
    throw new DocsPublishError(
      `generated/docs.json: SDK ${parsed.data.sdk}, в коде ${SDK_VERSION}; запусти pnpm generate.`,
    );
  return parsed.data;
}

const versionEntrySchema = z.looseObject({
  major: z.string().regex(/^v\d+$/),
  version: z.string(),
  date: z.string(),
});
const versionsFileSchema = z.looseObject({ versions: z.array(versionEntrySchema) });
export type VersionEntry = { major: string; version: string; date: string };
export interface VersionsFile {
  section: string;
  title: string;
  current: string;
  versions: VersionEntry[];
}

const majorNumber = (major: string): number => Number(major.slice(1));

// Запись своего мажора обновляется или добавляется, записи других мажоров остаются как были; current — наибольший мажор.
export function mergeVersions(existing: unknown, entry: VersionEntry): VersionsFile {
  let known: z.infer<typeof versionEntrySchema>[] = [];
  if (existing !== null) {
    const parsed = versionsFileSchema.safeParse(existing);
    if (!parsed.success) throw new DocsPublishError(`${VERSIONS_KEY} в хранилище не по форме: не перезаписываю.`);
    known = parsed.data.versions;
  }
  const own = known.some((item) => item.major === entry.major);
  const versions = own ? known.map((item) => (item.major === entry.major ? entry : item)) : [...known, entry];
  const current = versions.reduce(
    (best, item) => (majorNumber(item.major) > majorNumber(best) ? item.major : best),
    entry.major,
  );
  return { section: SECTION, title: SECTION_TITLE, current, versions };
}

// Клиент, который нужен выгрузке: S3Client подходит, в тестах его заменяет объект с одной функцией send.
export interface DocsClient {
  send: (
    command: PutObjectCommand | GetObjectCommand,
  ) => Promise<{ Body?: { transformToString: (encoding?: string) => Promise<string> } }>;
}

const isMissing = (error: unknown): boolean =>
  error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404);

// Текущий versions.json или null, если его ещё нет.
export async function readVersions(client: DocsClient, bucket: string): Promise<unknown> {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: VERSIONS_KEY }));
    return JSON.parse((await response.Body?.transformToString('utf8')) ?? 'null');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

const put = async (client: DocsClient, bucket: string, key: string, body: string, type: string): Promise<void> => {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type }));
};

export interface PublishResult {
  keys: string[];
  versions: VersionsFile;
}

// Сначала все файлы мажора, потом versions.json: список версий не ссылается на папку, которой ещё нет.
export async function publishDocs(
  client: DocsClient,
  config: PublishConfig,
  dir: string = GENERATED_DIR,
): Promise<PublishResult> {
  const info = await readDocsInfo(dir);
  const major = majorOf(info.sdk);
  const keys: string[] = [];
  for (const path of await listFiles(dir)) {
    const key = keyOf(major, path);
    await put(client, config.bucket, key, await readFile(join(dir, path), 'utf8'), contentTypeOf(path));
    keys.push(key);
  }
  const versions = mergeVersions(await readVersions(client, config.bucket), {
    major,
    version: info.version,
    date: info.date,
  });
  await put(client, config.bucket, VERSIONS_KEY, `${JSON.stringify(versions, null, 2)}\n`, contentTypeOf(VERSIONS_KEY));
  return { keys, versions };
}
