import { randomUUID } from 'node:crypto';
import { parseBuildInputs } from '@merfy/storefront-build';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openRpc, type RpcClient } from '../../src/rpc';
import { PRODUCT_QUEUE, readSnapshot, type SnapshotDeps } from '../../src/snapshot';
import { startFakeProducts, type FakeProducts } from './fake-product';
import { STACK, insertSite, openPool } from './stack';

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
  platform: { renderHash: `sha256:${'b'.repeat(64)}`, apiUrl: 'https://gateway.dev.merfy.ru/api' },
  themes: new Map([['nova', THEME]]),
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
  await db.query(
    `INSERT INTO publications (id, organization_id, site_id, title, slug, status, updated_at)
    VALUES ($1, 'org', $2, 'Как ухаживать за льном', 'linen', 'published', $3),
           ($4, 'org', $2, 'Черновик', 'draft', 'draft', $3)`,
    [randomUUID(), siteId, at, randomUUID()],
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
      'product:p-1',
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
