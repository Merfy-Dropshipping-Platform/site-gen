import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseChangelog } from '@merfy/storefront-build';
import {
  INDEXNOW_LIMIT,
  changedPaths,
  createIndexNow,
  shouldAnnounce,
  type AnnouncedInputs,
  type Pages,
  type PostJson,
} from '../src/indexnow';
import { previewSignal, previewVia } from '../src/preview';

// IndexNow и сигнал превью — без сети: разница манифестов, пачки по 10 000, сбой отправки не роняет сборку.
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const bodySchema = z.object({ host: z.string(), key: z.string(), urlList: z.array(z.string()) });

function page(path: string, hash: string): Pages[number] {
  const entity = { type: 'policy' as const, id: path };
  return {
    path,
    file: `${path.slice(1) || 'index'}.html`,
    hash,
    entity,
    deps: [],
    dataUpdatedAt: '2026-10-08T09:00:00.000Z',
  };
}

describe('IndexNow', () => {
  it('новые, изменённые и удалённые страницы — без неизменных', () => {
    const previous = [page('/', HASH_A), page('/about', HASH_A), page('/old', HASH_A)];
    const next = [page('/', HASH_B), page('/about', HASH_A), page('/new', HASH_A)];
    expect(changedPaths(previous, next)).toEqual(['/', '/new', '/old']);
    expect(changedPaths([], [page('/', HASH_A)])).toEqual(['/']);
  });

  it('адреса — от адреса магазина; больше 10 000 — несколькими запросами; ответ — в журнал', async () => {
    const posts: { url: string; body: z.infer<typeof bodySchema> }[] = [];
    const lines: Record<string, unknown>[] = [];
    const post: PostJson = (url, body) => {
      posts.push({ url, body: bodySchema.parse(JSON.parse(body)) });
      return Promise.resolve({ status: 202 });
    };
    const log = (msg: string, fields = {}) => void lines.push({ msg, ...fields });
    const announce = createIndexNow({ endpoint: 'https://indexnow.test/', key: 'key-12345678', log, post });
    const next = Array.from({ length: INDEXNOW_LIMIT + 1 }, (_, index) => page(`/p${index}`, HASH_A));
    await announce('https://shop.merfy.ru', [], next);
    expect(posts.map((post) => post.body.urlList.length)).toEqual([INDEXNOW_LIMIT, 1]);
    expect(posts[0]).toMatchObject({
      url: 'https://indexnow.test/',
      body: { host: 'shop.merfy.ru', key: 'key-12345678' },
    });
    expect(posts[0].body.urlList[0]).toBe('https://shop.merfy.ru/p0');
    expect(lines).toEqual([
      { msg: 'indexnow', host: 'shop.merfy.ru', urls: INDEXNOW_LIMIT, status: 202 },
      { msg: 'indexnow', host: 'shop.merfy.ru', urls: 1, status: 202 },
    ]);
  });

  it('сеть упала — строка indexnow-failed, без исключения', async () => {
    const lines: Record<string, unknown>[] = [];
    const log = (msg: string, fields = {}) => void lines.push({ msg, ...fields });
    const post: PostJson = () => Promise.reject(new Error('нет сети'));
    const announce = createIndexNow({ endpoint: 'https://indexnow.test/', key: 'key-12345678', log, post });
    await expect(announce('https://shop.merfy.ru', [], [page('/', HASH_A)])).resolves.toBeUndefined();
    expect(lines).toEqual([{ msg: 'indexnow-failed', host: 'shop.merfy.ru', urls: 1, error: 'нет сети' }]);
  });
});

describe('сигнал превью', () => {
  it('сущности — входы, которые меняет событие (блок 4); служебное событие — пусто', () => {
    expect(previewSignal('shop-name-change', 's1')).toEqual({ shopId: 's1', entities: ['site.name'] });
    expect(previewSignal('restart', 's1')).toEqual({ shopId: 's1', entities: [] });
  });

  it('отправка упала — строка preview-failed, без исключения', async () => {
    const lines: Record<string, unknown>[] = [];
    const log = (msg: string, fields = {}) => void lines.push({ msg, ...fields });
    const preview = previewVia(() => Promise.reject(new Error('брокер лежит')), log);
    await expect(preview({ shopId: 's1', entities: [] })).resolves.toBeUndefined();
    expect(lines).toEqual([{ msg: 'preview-failed', shopId: 's1', error: 'брокер лежит' }]);
  });
});

describe('shouldAnnounce (блок 10)', () => {
  const changelog = parseChangelog({
    v: 1,
    versions: [
      { version: '0.3.0', date: '2026-10-20', lines: [{ kind: 'fix', text: 'Заголовок товара — h1', search: true }] },
      {
        version: '0.2.0',
        date: '2026-10-15',
        lines: [{ kind: 'look', text: 'Кнопки круглее', tokens: ['radius-button'] }],
      },
      { version: '0.1.0', date: '2026-10-10', lines: [{ kind: 'look', text: 'Вид «Чистый»', tokens: [] }] },
    ],
  });
  const changelogs = new Map([['nova', changelog]]);
  const build = (version: string, renderHash = HASH_A): AnnouncedInputs => ({
    theme: { id: 'nova', version, contentHash: `sha256:${version.replaceAll('.', '').padStart(64, '0')}` },
    platform: { renderHash },
  });

  it('первая сборка — да', () => {
    expect(shouldAnnounce(changelogs, null, build('0.1.0'))).toBe(true);
  });

  it('правка мерчанта: тема и платформа те же — да', () => {
    expect(shouldAnnounce(changelogs, build('0.1.0'), build('0.1.0'))).toBe(true);
  });

  it('сменилась только платформа — нет', () => {
    expect(shouldAnnounce(changelogs, build('0.1.0'), build('0.1.0', HASH_B))).toBe(false);
  });

  it('тема поднялась, пометок «поисковикам» нет — нет', () => {
    expect(shouldAnnounce(changelogs, build('0.1.0'), build('0.2.0'))).toBe(false);
  });

  it('у версии между живой и новой пометка «поисковикам» — да', () => {
    expect(shouldAnnounce(changelogs, build('0.1.0'), build('0.3.0'))).toBe(true);
  });

  it('тема опустилась (откат) — нет', () => {
    expect(shouldAnnounce(changelogs, build('0.3.0'), build('0.2.0'))).toBe(false);
  });
});
