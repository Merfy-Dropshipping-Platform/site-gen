import { randomUUID } from 'node:crypto';
import { parseBuildInputs } from '@merfy/storefront-build';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openRpc, type RpcClient } from '../../src/rpc';
import { PRODUCT_QUEUE, readSnapshot, type SnapshotDeps } from '../../src/snapshot';
import { codeDeps } from './builder';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertRevision, insertSite, openPool } from './stack';

// Снимок входов на настоящей базе sites и брокере: сайт, политики, контакты, публикации из базы; товары — у
// подставного сервиса product по RPC так, как отвечает Nest.
let db: Pool;
let rpc: RpcClient;
let products: FakeProducts;
const lines: string[] = [];

beforeAll(async () => {
  db = openPool();
  rpc = openRpc(STACK.rabbitmqUrl);
  products = await startFakeProducts();
});
afterAll(async () => {
  await products.close();
  await rpc.close();
  await db.end();
});

const THEME = { version: '0.0.1', contentHash: `sha256:${'a'.repeat(64)}` };
const deps = (): SnapshotDeps => ({
  db,
  products: { call: rpc.call, timeoutMs: 1_000, log: (message, fields) => lines.push(`${message} ${fields?.error}`) },
  code: codeDeps(db, () => undefined),
  counters: { call: rpc.call, timeoutMs: 1_000, log: (message, fields) => lines.push(`${message} ${fields?.error}`) },
  platform: {
    renderHash: `sha256:${'b'.repeat(64)}`,
    apiUrl: 'https://gateway.dev.merfy.ru/api',
    analyticsUrl: 'https://analytics.dev.merfy.ru',
  },
  themes: new Map([['nova', THEME]]),
  pins: {
    stateOf: (_themeId, version) => Promise.resolve(version === THEME.version ? THEME : null),
    released: () => Promise.resolve(THEME.version),
  },
  clock: () => new Date('2027-01-01T00:00:00.000Z'),
});

async function seedContent(siteId: string): Promise<void> {
  const at = '2026-10-07T08:00:00.000Z';
  await db.query(
    `INSERT INTO site_policy (id, site_id, type, content, created_at, updated_at) VALUES
    ($1, $3, 'refund', 'старый текст', $4, '2026-10-01T08:00:00.000Z'), ($2, $3, 'refund', 'новый текст', $4, $4)`,
    [randomUUID(), randomUUID(), siteId, at],
  );
  await db.query(`INSERT INTO site_contacts (id, site_id, fields, updated_at) VALUES ($1, $2, $3, $4)`, [
    randomUUID(),
    siteId,
    JSON.stringify([{ id: 'phone', label: 'Телефон', value: '+7 900', order: 0 }]),
    at,
  ]);
  const blogId = randomUUID();
  await db.query(
    `INSERT INTO blogs (id, site_id, organization_id, title, handle) VALUES ($1, $2, 'org', 'Новости', 'novosti')
    ON CONFLICT (site_id, handle) DO NOTHING`,
    [blogId, siteId],
  );
  const blog = await db.query<{ id: string }>(`SELECT id FROM blogs WHERE site_id = $1 AND handle = 'novosti'`, [
    siteId,
  ]);
  await db.query(
    `INSERT INTO publications (id, organization_id, site_id, blog_id, title, slug, status, updated_at)
    VALUES ($1, 'org', $2, $5, 'Как ухаживать за льном', 'linen', 'published', $3),
           ($4, 'org', $2, $5, 'Черновик', 'draft', 'draft', $3)`,
    [randomUUID(), siteId, at, randomUUID(), blog.rows[0].id],
  );
}

describe('снимок входов', () => {
  it('сайт, последняя политика каждого вида, контакты, опубликованные статьи и товары — входы блока 4', async () => {
    const site = await insertSite(db, { name: 'Шарфы и пледы', publicUrl: 'https://scarf.dev.merfy.ru/' });
    await seedContent(site.id);
    products.products.set(site.id, [{ id: 'p-1', name: 'Шарф', price: 2500, available: true }]);
    const snapshot = await readSnapshot(deps(), site.id);
    expect(snapshot.address).toEqual({ url: 'https://scarf.dev.merfy.ru', label: 'scarf' });
    const inputs = parseBuildInputs(snapshot.inputs);
    expect(inputs.site).toMatchObject({ name: 'Шарфы и пледы', updatedAt: '2026-10-08T09:00:00.000Z' });
    expect(inputs.year).toBe(2027);
    expect(inputs.data.entities.map((entity) => `${entity.type}:${entity.id}`)).toEqual([
      'policy:refund',
      'contacts:main',
      'publication:' + inputs.data.entities[2].id,
      // Блок 8 «Секций и SDK», часть 8а: блог статьи — своей сущностью.
      'blog:' + inputs.data.entities[3].id,
      'product:p-1',
      // Оплата онлайн (часть 4, Р1-4-6): подставной billing — не подключена, сущность всё равно есть.
      'billing:main',
    ]);
    expect(inputs.data.entities[0]).toMatchObject({ data: { content: 'новый текст' } });
  });

  // SEO главной — из настроек магазина (branding.seo): заполненное — во входах, незаполненное — пустая строка.
  it('SEO мерчанта: заголовок, описание и ключевые слова из branding.seo; не заполнено — пусто', async () => {
    const filled = await insertSite(db);
    const seo = { title: 'Шарфы изо льна', description: 'Льняные шарфы', keywords: 'шарфы, лён' };
    await db.query('UPDATE site SET branding = $2 WHERE id = $1', [filled.id, JSON.stringify({ seo })]);
    const plain = await insertSite(db);
    const site = async (siteId: string) => parseBuildInputs((await readSnapshot(deps(), siteId)).inputs).site;
    expect(await site(filled.id)).toMatchObject({
      seoTitle: seo.title,
      description: seo.description,
      keywords: seo.keywords,
    });
    expect(await site(plain.id)).toMatchObject({ seoTitle: '', description: '', keywords: '' });
  });

  // Блок 9: логотип магазина из брендинга (branding.logoUrl) — во входах, из него картинка для соцсетей.
  it('логотип — из branding.logoUrl; не загружен — пустая строка', async () => {
    const withLogo = await insertSite(db);
    const logoUrl = 'https://s3.merfy.ru/merfy/branding/logo-1.png';
    await db.query('UPDATE site SET branding = $2 WHERE id = $1', [withLogo.id, JSON.stringify({ logoUrl })]);
    const plain = await insertSite(db);
    const site = async (siteId: string) => parseBuildInputs((await readSnapshot(deps(), siteId)).inputs).site;
    expect(await site(withLogo.id)).toMatchObject({ logoUrl });
    expect(await site(plain.id)).toMatchObject({ logoUrl: '' });
  });

  // Блок 8: правки токенов мерчанта — из текущей ревизии (ключ tokens). Нет ревизии или ключа — пустые правки.
  it('правки токенов — из текущей ревизии; нет ревизии, ключа или он не объект — {}', async () => {
    const edited = await insertSite(db);
    const tokens = { schemes: { 'scheme-1': { primary: '#16a34a' } } };
    await insertRevision(db, edited.id, { pages: [], tokens, settings: { 'cart-type': 'page' } });
    const plain = await insertSite(db);
    const broken = await insertSite(db);
    await insertRevision(db, broken.id, { tokens: ['не объект'] });
    const revision = async (siteId: string) => parseBuildInputs((await readSnapshot(deps(), siteId)).inputs).revision;
    // Часть 4: в ревизии входов ещё настройки темы и свои страницы (readRevision).
    expect(await revision(edited.id)).toEqual({ tokens, settings: { 'cart-type': 'page' }, pages: [] });
    expect(await revision(plain.id)).toEqual({ tokens: {}, settings: {}, pages: [] });
    expect(await revision(broken.id)).toEqual({ tokens: {}, settings: {}, pages: [] });
  });

  it.each(['fail', 'error', 'silent'] as const)('товары: %s — снимок не получен, сборки не будет', async (answer) => {
    const site = await insertSite(db);
    products.answers.set(site.id, answer);
    const snapshot = await readSnapshot(deps(), site.id);
    expect(snapshot.inputs.data.status).toBe('failed');
    expect(() => parseBuildInputs(snapshot.inputs)).toThrow(/не получен/);
    expect(lines.at(-1)).toMatch(/^products-failed /);
  });

  it('магазина нет, тема нынешняя, адреса нет — shop-invalid', async () => {
    const old = await insertSite(db, { themeId: 'rose' });
    const noAddress = await insertSite(db, { publicUrl: null });
    await expect(readSnapshot(deps(), randomUUID())).rejects.toMatchObject({ code: 'shop-invalid' });
    await expect(readSnapshot(deps(), old.id)).rejects.toThrow(/тема rose — не новой архитектуры/);
    await expect(readSnapshot(deps(), noAddress.id)).rejects.toThrow(/нет адреса/);
  });

  it('очередь сервиса товаров — product-service_queue, как у нынешней сборки', () => {
    expect(PRODUCT_QUEUE).toBe('product-service_queue');
  });
});

describe('снимок входов: коллекции и блоги (блок 8 «Секций и SDK», часть 8а)', () => {
  it.each(['fail', 'error', 'silent'] as const)(
    'коллекции: %s — снимок не получен, сборки не будет',
    async (answer) => {
      const site = await insertSite(db);
      products.collectionAnswers.set(site.id, answer);
      const snapshot = await readSnapshot(deps(), site.id);
      expect(snapshot.inputs.data.status).toBe('failed');
      expect(lines.at(-1)).toMatch(/^collections-failed /);
    },
  );

  it('коллекция, блог и товар во входах — только публичные поля, цена в копейках', async () => {
    const site = await insertSite(db);
    await seedContent(site.id);
    products.products.set(site.id, [{ id: 'p-1', name: 'Шарф', price: 2500, costPrice: 900, available: true }]);
    products.collections.set(site.id, [
      {
        id: 'c-1',
        name: 'Кашемир',
        slug: 'kashemir',
        description: null,
        images: [],
        metaTitle: null,
        metaDescription: null,
        updatedAt: '2026-10-20T10:00:00.000Z',
        productIds: ['p-1'],
      },
    ]);
    const inputs = parseBuildInputs((await readSnapshot(deps(), site.id)).inputs);
    const ofType = (type: string) => inputs.data.entities.filter((entity) => entity.type === type);
    expect(ofType('collection')).toEqual([
      {
        type: 'collection',
        id: 'c-1',
        updatedAt: '2026-10-20T10:00:00.000Z',
        data: {
          title: 'Кашемир',
          handle: 'kashemir',
          description: '',
          images: [],
          productIds: ['p-1'],
          seo: { title: '', description: '' },
        },
      },
    ]);
    expect(ofType('blog').map((entity) => entity.data)).toEqual([{ title: 'Новости', handle: 'novosti' }]);
    expect(ofType('publication')[0].data).toMatchObject({ slug: 'linen', publishedAt: null, cover: null });
    expect(ofType('product')[0].data).toMatchObject({ title: 'Шарф', price: 250000 });
    expect(ofType('product')[0].data).not.toHaveProperty('costPrice');
  });
});

// Блок 10, часть 10а (Р10а-19): блоки «Оформления заказа» — из Puck-документа page-checkout ревизии; в ревизию входов
// идут строки четырёх типов с props-объектом, остальные — без них.
describe('снимок входов: блоки «Оформления заказа» (блок 10 «Секций и SDK», часть 10а)', () => {
  it('checkout: строки четырёх типов с props — в blocks; другой тип — без него; пустой документ — blocks: []', async () => {
    const header = { type: 'CheckoutHeader', props: { colorScheme: 'scheme-2' } };
    const summary = { type: 'CheckoutSummary', props: {} };
    const site = await insertSite(db);
    await insertRevision(db, site.id, {
      tokens: {},
      pages: [],
      pagesData: { 'page-checkout': { content: [header, { type: 'Footer', props: {} }, summary] } },
    });
    const empty = await insertSite(db);
    await insertRevision(db, empty.id, { tokens: {}, pages: [], pagesData: { 'page-checkout': { content: [] } } });
    const revision = async (siteId: string) => parseBuildInputs((await readSnapshot(deps(), siteId)).inputs).revision;
    expect(await revision(site.id)).toEqual({
      tokens: {},
      settings: {},
      pages: [],
      checkout: { blocks: [header, summary] },
    });
    expect(await revision(empty.id)).toEqual({ tokens: {}, settings: {}, pages: [], checkout: { blocks: [] } });
  });

  it('запрос ревизии читает pagesData страницы page-checkout', async () => {
    const site = await insertSite(db);
    const spy = vi.spyOn(db, 'query');
    await readSnapshot(deps(), site.id);
    expect(spy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('page-checkout');
    spy.mockRestore();
  });
});
