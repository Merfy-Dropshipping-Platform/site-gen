import type { Entity, ThemeState } from '@merfy/storefront-build';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log } from './log';
import type { Call } from './rpc';
import type { Queryable } from './shop-state';

// Снимок входов сборки (design.md блока 6, раздел 4, «Нет данных — нет выкладки»; входы — блок 4, src/inputs.ts).
// Сайт, политики, контакты и публикации — из базы sites; товары — у сервиса product (product.list, как у нынешней
// сборки, data-fetcher.ts). Сервис не ответил или ответил ошибкой — снимок «не получен» (data.status: failed), и сборка
// блока 4 падает до рендера: живой сайт не трогаем. Коллекции и касса — с секциями (раздел 4, «Свежесть»).

export const PRODUCT_QUEUE = 'product-service_queue';
const PRODUCT_LIST = 'product.list';
// product.list не отдаёт дату правки товара. Дата нужна только карте сайта страниц товаров — их нет до секций; пока
// она одна для всех товаров, и ключ сборки меняет только правка самих данных.
export const PRODUCT_UPDATED_AT = '1970-01-01T00:00:00.000Z';
// Дата в формате входов: UTC с миллисекундами (блок 4). Колонки site, site_policy, site_contacts — без пояса (пишутся в
// UTC), publications — с поясом.
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const plain = (column: string): string => `to_char(${column}, ${ISO})`;
const zoned = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', ${ISO})`;

// SEO главной — из настроек магазина (branding.seo: title, description, keywords, как у нынешних тем —
// home-seo-inject.ts). Не заполнено — пустая строка: сборка блока 4 такие теги не рисует.
const SHOP_SQL = `SELECT id, tenant_id, name, theme_id, status, public_url,
  COALESCE(branding->'seo'->>'description', '') AS description, COALESCE(branding->'seo'->>'title', '') AS seo_title,
  COALESCE(branding->'seo'->>'keywords', '') AS keywords, ${plain('updated_at')} AS updated_at
  FROM site WHERE id = $1 AND deleted_at IS NULL`;

const shopRowSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  theme_id: z.string().nullable(),
  status: z.string(),
  public_url: z.string().nullable(),
  description: z.string(),
  seo_title: z.string(),
  keywords: z.string(),
  updated_at: z.string(),
});

export interface Shop {
  id: string;
  tenantId: string;
  name: string;
  themeId: string | null;
  status: string;
  publicUrl: string | null;
  description: string;
  seoTitle: string;
  keywords: string;
  updatedAt: string;
}

export async function readShop(db: Queryable, siteId: string): Promise<Shop | null> {
  const rows = (await db.query(SHOP_SQL, [siteId])).rows.map((row) => shopRowSchema.parse(row));
  if (rows.length === 0) return null;
  const [row] = rows;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    themeId: row.theme_id,
    status: row.status,
    publicUrl: row.public_url,
    description: row.description,
    seoTitle: row.seo_title,
    keywords: row.keywords,
    updatedAt: row.updated_at,
  };
}

export interface ShopAddress {
  url: string;
  // Метка хоста — первая часть имени: по ней раздача (блок 5) находит указатель магазина.
  label: string;
}

// Адрес магазина: public_url бывает и без схемы («abc.merfy.ru»). Магазин отдаётся только по https.
export function shopAddress(shop: Pick<Shop, 'id' | 'publicUrl'>): ShopAddress {
  if (shop.publicUrl === null || shop.publicUrl === '')
    throw new StorefrontBuilderError('shop-invalid', 'у магазина нет адреса', { path: `site/${shop.id}` });
  const withScheme = shop.publicUrl.includes('://') ? shop.publicUrl : `https://${shop.publicUrl}`;
  const host = new URL(withScheme).hostname;
  return { url: `https://${host}`, label: host.split('.')[0] };
}

const POLICIES_SQL = `SELECT DISTINCT ON (type) type::text AS id, content, ${plain('updated_at')} AS updated_at
  FROM site_policy WHERE site_id = $1 ORDER BY type, updated_at DESC`;
const CONTACTS_SQL = `SELECT fields, ${plain('updated_at')} AS updated_at FROM site_contacts WHERE site_id = $1`;
const PUBLICATIONS_SQL = `SELECT id, title, slug, category::text AS category, excerpt, content,
  ${zoned('updated_at')} AS updated_at FROM publications WHERE site_id = $1 AND status = 'published'`;

const policyRow = z.object({ id: z.string(), content: z.string().nullable(), updated_at: z.string() });
const contactsRow = z.object({ fields: z.json(), updated_at: z.string() });
const publicationRow = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  category: z.string(),
  excerpt: z.string().nullable(),
  content: z.string(),
  updated_at: z.string(),
});

const policyEntity = (row: z.infer<typeof policyRow>): Entity => ({
  type: 'policy',
  id: row.id,
  updatedAt: row.updated_at,
  data: { content: row.content ?? '' },
});

const contactsEntity = (row: z.infer<typeof contactsRow>): Entity => ({
  type: 'contacts',
  id: 'main',
  updatedAt: row.updated_at,
  data: { fields: row.fields },
});

function publicationEntity(row: z.infer<typeof publicationRow>): Entity {
  const { id, title, slug, category, excerpt, content } = row;
  return { type: 'publication', id, updatedAt: row.updated_at, data: { title, slug, category, excerpt, content } };
}

async function rowsOf<T>(db: Queryable, sql: string, siteId: string, schema: z.ZodType<T>): Promise<T[]> {
  return (await db.query(sql, [siteId])).rows.map((row) => schema.parse(row));
}

// Ключ текущей ревизии магазина (design.md блока 8, раздел 4): tokens — правки токенов в форме блока 1, settings —
// настройки не про вид. Ключа нет или он не объект — пустые правки: пустое не ломает. Ревизия — текущая
// (site.current_revision_id), как у нынешней сборки.
export const revisionKeySql = (key: 'tokens' | 'settings'): string =>
  `CASE WHEN jsonb_typeof(r.data->'${key}') = 'object' THEN r.data->'${key}' ELSE '{}'::jsonb END`;
const REVISION_SQL = `SELECT ${revisionKeySql('tokens')} AS tokens FROM site s
  LEFT JOIN site_revision r ON r.id = s.current_revision_id WHERE s.id = $1`;
const jsonObject = z.record(z.string(), z.json());
export type JsonObject = z.infer<typeof jsonObject>;

// Правки токенов мерчанта из текущей ревизии: во входы сборки (revision.tokens блока 4).
export async function readRevisionTokens(db: Queryable, siteId: string): Promise<JsonObject> {
  const rows = await rowsOf(db, REVISION_SQL, siteId, z.object({ tokens: jsonObject }));
  return rows[0]?.tokens ?? {};
}

// Сущности магазина из базы sites: политики, контакты, опубликованные статьи блога.
export async function readSiteEntities(db: Queryable, siteId: string): Promise<Entity[]> {
  const [policies, contacts, publications] = await Promise.all([
    rowsOf(db, POLICIES_SQL, siteId, policyRow),
    rowsOf(db, CONTACTS_SQL, siteId, contactsRow),
    rowsOf(db, PUBLICATIONS_SQL, siteId, publicationRow),
  ]);
  return [...policies.map(policyEntity), ...contacts.map(contactsEntity), ...publications.map(publicationEntity)];
}

const productSchema = z.record(z.string(), z.json()).and(z.object({ id: z.string().min(1) }));
const productListSchema = z.object({ success: z.boolean(), data: z.array(productSchema).optional() });

const productEntity = (product: z.infer<typeof productSchema>): Entity => ({
  type: 'product',
  id: product.id,
  updatedAt: PRODUCT_UPDATED_AT,
  data: product,
});

export interface ProductRequest {
  call: Call;
  timeoutMs: number;
  log: Log;
}

// Товары магазина. null — не получены: сервис молчит, ответил ошибкой или неуспехом; причина — в журнале.
export async function fetchProducts(request: ProductRequest, shop: Shop): Promise<Entity[] | null> {
  const data = { tenantId: shop.tenantId, siteId: shop.id };
  try {
    const answer = productListSchema.parse(await request.call(PRODUCT_QUEUE, PRODUCT_LIST, data, request.timeoutMs));
    if (!answer.success) throw new StorefrontBuilderError('rpc-failed', 'product.list: success = false');
    return (answer.data ?? []).map(productEntity);
  } catch (error) {
    request.log('products-failed', { shopId: shop.id, error: errorText(error) });
    return null;
  }
}

export interface Platform {
  renderHash: string;
  apiUrl: string;
}

export interface InputsParts {
  platform: Platform;
  theme: ThemeState & { id: string };
  shop: Shop;
  address: ShopAddress;
  year: number;
  entities: readonly Entity[];
  received: boolean;
  tokens: JsonObject;
}

// Тема магазина — только новой архитектуры: те, что записаны в theme-versions.json блока 4 и загружены сборщиком.
export function themeOf(themes: ReadonlyMap<string, ThemeState>, shop: Shop): ThemeState & { id: string } {
  const state = themes.get(shop.themeId ?? '');
  if (state === undefined || shop.themeId === null)
    throw new StorefrontBuilderError('shop-invalid', `тема ${shop.themeId} — не новой архитектуры`, {
      path: `site/${shop.id}`,
    });
  return { id: shop.themeId, version: state.version, contentHash: state.contentHash };
}

export interface SnapshotDeps {
  db: Queryable;
  products: ProductRequest;
  platform: Platform;
  themes: ReadonlyMap<string, ThemeState>;
  clock: () => Date;
}

export interface Snapshot {
  shop: Shop;
  address: ShopAddress;
  inputs: ReturnType<typeof buildInputsOf>;
}

// Снимок целиком: строка сайта, его сущности и товары разом. Магазина нет — ошибка shop-invalid.
export async function readSnapshot(deps: SnapshotDeps, siteId: string): Promise<Snapshot> {
  const shop = await readShop(deps.db, siteId);
  if (shop === null) throw new StorefrontBuilderError('shop-invalid', 'магазина нет', { path: `site/${siteId}` });
  const theme = themeOf(deps.themes, shop);
  const address = shopAddress(shop);
  const [siteEntities, products, tokens] = await Promise.all([
    readSiteEntities(deps.db, siteId),
    fetchProducts(deps.products, shop),
    readRevisionTokens(deps.db, siteId),
  ]);
  const entities = [...siteEntities, ...(products ?? [])];
  const year = deps.clock().getUTCFullYear();
  const parts = { platform: deps.platform, theme, shop, address, year, entities, received: products !== null, tokens };
  return { shop, address, inputs: buildInputsOf(parts) };
}

// Входы сборки блока 4 одним объектом. Правки токенов мерчанта — из текущей ревизии (их пишет панель темы, блок 8).
// Настройки не про вид в живую сборку не идут: в конфиге v1 их нет, читатель появится с секциями (блок 8, раздел 4).
export const buildInputsOf = (parts: InputsParts) => ({
  platform: { renderHash: parts.platform.renderHash },
  theme: parts.theme,
  shell: null,
  revision: { tokens: parts.tokens },
  site: {
    id: parts.shop.id,
    name: parts.shop.name,
    publicUrl: parts.address.url,
    description: parts.shop.description,
    seoTitle: parts.shop.seoTitle,
    keywords: parts.shop.keywords,
    updatedAt: parts.shop.updatedAt,
  },
  env: { apiUrl: parts.platform.apiUrl },
  year: parts.year,
  data: { status: parts.received ? 'received' : 'failed', entities: parts.entities },
});
