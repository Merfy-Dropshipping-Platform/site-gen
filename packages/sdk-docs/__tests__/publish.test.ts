import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BUCKET,
  DEFAULT_ENDPOINT,
  DocsPublishError,
  GENERATED_DIR,
  VERSIONS_KEY,
  clientFor,
  configFrom,
  contentTypeOf,
  keyOf,
  listFiles,
  mergeVersions,
  publishDocs,
  readDocsInfo,
  type DocsClient,
  type PublishConfig,
} from '../src/publish';

// Выгрузка документации (З2): ключи, Content-Type и слияние versions.json — на подменённом клиенте S3, без сети.
interface Put {
  key: string;
  body: string;
  type: string;
}

// Клиент-подмена: хранит объекты в памяти, команды читает по их input. Нет объекта — ошибка NoSuchKey, как у S3.
function fakeClient(stored: Record<string, string> = {}): { client: DocsClient; puts: Put[] } {
  const puts: Put[] = [];
  const send: DocsClient['send'] = (command) => {
    if (command instanceof PutObjectCommand) {
      const { Key = '', Body, ContentType = '' } = command.input;
      const body = typeof Body === 'string' ? Body : '';
      puts.push({ key: Key, body, type: ContentType });
      stored[Key] = body;
      return Promise.resolve({});
    }
    if (command instanceof GetObjectCommand) {
      const text = stored[command.input.Key ?? ''];
      if (text === undefined)
        return Promise.reject(
          new S3ServiceException({ name: 'NoSuchKey', $fault: 'client', $metadata: { httpStatusCode: 404 } }),
        );
      return Promise.resolve({ Body: { transformToString: () => Promise.resolve(text) } });
    }
    return Promise.reject(new Error('неожиданная команда'));
  };
  return { client: { send }, puts };
}

const CONFIG: PublishConfig = { bucket: 'merfy-docs', endpoint: 'https://minio.test', accessKey: 'a', secretKey: 's' };

describe('конфигурация выгрузки', () => {
  it('бакет и адрес — по умолчанию, ключи берутся из окружения', () => {
    expect(configFrom({ DOCS_S3_ACCESS_KEY: 'a', DOCS_S3_SECRET_KEY: 's' })).toEqual({
      bucket: DEFAULT_BUCKET,
      endpoint: DEFAULT_ENDPOINT,
      accessKey: 'a',
      secretKey: 's',
    });
    expect(DEFAULT_BUCKET).toBe('merfy-docs');
    expect(DEFAULT_ENDPOINT).toBe('https://minio.merfy.ru');
  });

  it('бакет и адрес можно задать окружением', () => {
    const env = {
      DOCS_S3_ACCESS_KEY: 'a',
      DOCS_S3_SECRET_KEY: 's',
      DOCS_S3_BUCKET: 'b',
      DOCS_S3_ENDPOINT: 'https://e',
    };
    expect(configFrom(env)).toMatchObject({ bucket: 'b', endpoint: 'https://e' });
  });

  it('без ключей — понятная ошибка с именами переменных, значения не печатаются', () => {
    expect(() => configFrom({})).toThrow('DOCS_S3_ACCESS_KEY, DOCS_S3_SECRET_KEY');
    expect(() => configFrom({ DOCS_S3_ACCESS_KEY: 'a', DOCS_S3_SECRET_KEY: '  ' })).toThrow(/DOCS_S3_SECRET_KEY\.$/);
    expect(() => configFrom({})).toThrow(DocsPublishError);
  });

  it('клиент — с адресом из конфигурации и адресацией по пути (forcePathStyle)', async () => {
    const client = clientFor(CONFIG);
    expect(client.config.forcePathStyle).toBe(true);
    expect((await client.config.endpoint?.())?.hostname).toBe('minio.test');
  });
});

describe('ключи и типы', () => {
  it('путь storefront-sdk/v<мажор>/<файл>, вложенные папки сохраняются', () => {
    expect(keyOf('v1', 'llms.txt')).toBe('storefront-sdk/v1/llms.txt');
    expect(keyOf('v1', 'template/section.json')).toBe('storefront-sdk/v1/template/section.json');
    expect(keyOf('v2', 'template\\AGENTS.md')).toBe('storefront-sdk/v2/template/AGENTS.md');
  });

  it('Content-Type по расширению', () => {
    expect(contentTypeOf('start.md')).toBe('text/markdown; charset=utf-8');
    expect(contentTypeOf('llms.txt')).toBe('text/plain; charset=utf-8');
    expect(contentTypeOf('docs.json')).toBe('application/json');
    expect(contentTypeOf('template/template.astro')).toBe('text/plain; charset=utf-8');
    expect(contentTypeOf('script.ts')).toBe('text/plain; charset=utf-8');
  });

  it('расширение без типа — ошибка, а не тихая выгрузка с чужим типом', () => {
    expect(() => contentTypeOf('image.png')).toThrow(DocsPublishError);
  });
});

describe('versions.json', () => {
  const entry = { major: 'v1', version: '1.19.0', date: '2026-10-30' };

  it('файла нет — создаётся с одним мажором, он текущий', () => {
    expect(mergeVersions(null, entry)).toEqual({
      section: 'storefront-sdk',
      title: 'Витринный SDK',
      current: 'v1',
      versions: [entry],
    });
  });

  it('запись своего мажора обновляется, чужие остаются как были', () => {
    const other = { major: 'v2', version: '2.0.1', date: '2027-01-10', note: 'не трогать' };
    const old = { major: 'v1', version: '1.18.0', date: '2026-10-29' };
    const merged = mergeVersions({ versions: [old, other] }, entry);
    expect(merged.versions).toEqual([entry, other]);
    expect(merged.current).toBe('v2');
  });

  it('новый мажор добавляется в конец, current — наибольший мажор по числу, а не по тексту', () => {
    const existing = { versions: [{ major: 'v9', version: '9.0.0', date: '2026-01-01' }] };
    const merged = mergeVersions(existing, { major: 'v10', version: '10.0.0', date: '2027-01-01' });
    expect(merged.versions.map((item) => item.major)).toEqual(['v9', 'v10']);
    expect(merged.current).toBe('v10');
  });

  it('файл в хранилище не по форме — ошибка, чужие мажоры не затираются', () => {
    expect(() => mergeVersions({ versions: 'нет' }, entry)).toThrow(DocsPublishError);
    expect(() => mergeVersions({ versions: [{ major: '1' }] }, entry)).toThrow(VERSIONS_KEY);
  });
});

describe('выгрузка папки', () => {
  let dir = '';

  const write = async (path: string, text: string): Promise<void> => {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sdk-docs-publish-'));
    await write('docs.json', JSON.stringify({ sdk: 1, version: '1.19.0', date: '2026-10-30', files: [] }));
    await write('llms.txt', '# Merfy\n');
    await write('start.md', '# Начать\n');
    await write('template/section.json', '{}\n');
    await write('template/template.astro', '<div />\n');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('все файлы, включая вложенные, по алфавиту', async () => {
    expect(await listFiles(dir)).toEqual([
      'docs.json',
      'llms.txt',
      'start.md',
      'template/section.json',
      'template/template.astro',
    ]);
  });

  it('файлы — в storefront-sdk/v1/ со своими типами, versions.json — последним', async () => {
    const { client, puts } = fakeClient();
    const result = await publishDocs(client, CONFIG, dir);
    expect(puts.map((item) => item.key)).toEqual([
      'storefront-sdk/v1/docs.json',
      'storefront-sdk/v1/llms.txt',
      'storefront-sdk/v1/start.md',
      'storefront-sdk/v1/template/section.json',
      'storefront-sdk/v1/template/template.astro',
      VERSIONS_KEY,
    ]);
    expect(puts.map((item) => item.type)).toEqual([
      'application/json',
      'text/plain; charset=utf-8',
      'text/markdown; charset=utf-8',
      'application/json',
      'text/plain; charset=utf-8',
      'application/json',
    ]);
    expect(result.keys).toHaveLength(5);
    expect(JSON.parse(puts.at(-1)?.body ?? '')).toEqual({
      section: 'storefront-sdk',
      title: 'Витринный SDK',
      current: 'v1',
      versions: [{ major: 'v1', version: '1.19.0', date: '2026-10-30' }],
    });
  });

  it('повторная выгрузка и чужой мажор: v1 обновляется, v2 не меняется', async () => {
    const v2 = { major: 'v2', version: '2.0.0', date: '2027-02-01' };
    const stored = {
      [VERSIONS_KEY]: JSON.stringify({ versions: [{ major: 'v1', version: '1.0.0', date: '2026-01-01' }, v2] }),
    };
    const { client } = fakeClient(stored);
    await publishDocs(client, CONFIG, dir);
    expect(JSON.parse(stored[VERSIONS_KEY] ?? '')).toMatchObject({
      current: 'v2',
      versions: [{ major: 'v1', version: '1.19.0', date: '2026-10-30' }, v2],
    });
  });

  it('docs.json другого мажора SDK — выгрузка не начинается, ничего не записано', async () => {
    await write('docs.json', JSON.stringify({ sdk: 2, version: '2.0.0', date: '2026-10-30' }));
    const { client, puts } = fakeClient();
    await expect(publishDocs(client, CONFIG, dir)).rejects.toThrow('запусти pnpm generate');
    expect(puts).toEqual([]);
  });

  it('docs.json не по форме — ошибка с подсказкой', async () => {
    await write('docs.json', JSON.stringify({ sdk: 1 }));
    await expect(readDocsInfo(dir)).rejects.toThrow('не по форме');
  });
});

describe('настоящая папка generated/', () => {
  it('выгружается целиком: у каждого файла известен тип, мажор — v1', async () => {
    const { client, puts } = fakeClient();
    await publishDocs(client, CONFIG, GENERATED_DIR);
    const keys = puts.map((item) => item.key);
    expect(keys).toContain('storefront-sdk/v1/llms.txt');
    expect(keys).toContain('storefront-sdk/v1/anatomy.md');
    expect(keys).toContain('storefront-sdk/v1/template/AGENTS.md');
    expect(keys.at(-1)).toBe(VERSIONS_KEY);
  });
});
