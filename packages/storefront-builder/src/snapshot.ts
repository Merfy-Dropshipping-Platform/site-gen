import {
  FONT_LIBRARY_HASH,
  type BuildInputs,
  type CodeAssets,
  type Entity,
  type RevisionPage,
  type ThemeState,
} from '@merfy/storefront-build';
import { z } from 'zod';
import { fetchBilling } from './billing';
import { NO_CODE, readShopCode, type CodeDeps } from './code';
import { fetchCounters, type CounterRequest } from './counters';
import { StorefrontBuilderError, errorText } from './errors';
import type { Log, LogFields } from './log';
import type { Call } from './rpc';
import { revisionPagesOf } from './revision-pages';
import type { Queryable } from './shop-state';
import type { ThemePins } from './theme-catalog';

// Снимок входов сборки (design.md блока 6, раздел 4, «Нет данных — нет выкладки»; входы — блок 4, src/inputs.ts).
// Сайт, политики, контакты и публикации — из базы sites; товары — у сервиса product (product.list, как у нынешней
// сборки, data-fetcher.ts). Сервис не ответил или ответил ошибкой — снимок «не получен» (data.status: failed), и сборка
// блока 4 падает до рендера: живой сайт не трогаем. Коллекции и касса — с секциями (раздел 4, «Свежесть»). Код секций
// (блок 7, code.ts) — из реестра storefront_section и сервиса extensions; не получен — снимок тоже «не получен».
// Счётчики мерчанта (блок 11, counters.ts) — у сборщика аналитики; не ответил — снимок тоже «не получен».

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
// home-seo-inject.ts). Не заполнено — пустая строка: сборка блока 4 такие теги не рисует. Логотип (branding.logoUrl) —
// картинка для соцсетей (блок 9); не загружен — пустая строка.
const SHOP_SQL = `SELECT id, tenant_id, name, theme_id, theme_version, status, public_url,
  COALESCE(branding->'seo'->>'description', '') AS description, COALESCE(branding->'seo'->>'title', '') AS seo_title,
  COALESCE(branding->'seo'->>'keywords', '') AS keywords, COALESCE(branding->>'logoUrl', '') AS logo_url,
  ${plain('updated_at')} AS updated_at
  FROM site WHERE id = $1 AND deleted_at IS NULL`;

const shopRowSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  name: z.string(),
  theme_id: z.string().nullable(),
  theme_version: z.string().nullable(),
  status: z.string(),
  public_url: z.string().nullable(),
  description: z.string(),
  seo_title: z.string(),
  keywords: z.string(),
  logo_url: z.string(),
  updated_at: z.string(),
});

export interface Shop {
  id: string;
  tenantId: string;
  name: string;
  themeId: string | null;
  // Закреплённая версия темы (блок 10, П10-1 Б). Пустое — сборка закрепит выпущенную (theme-catalog.ts, pinShop).
  themeVersion: string | null;
  status: string;
  publicUrl: string | null;
  description: string;
  seoTitle: string;
  keywords: string;
  logoUrl: string;
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
    themeVersion: row.theme_version,
    status: row.status,
    publicUrl: row.public_url,
    description: row.description,
    seoTitle: row.seo_title,
    keywords: row.keywords,
    logoUrl: row.logo_url,
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
// Блог записи вместо прежней категории (site-gen, миграция 0027): id и адрес блога.
const PUBLICATIONS_SQL = `SELECT p.id, p.title, p.slug, p.blog_id, b.handle AS blog_handle, p.excerpt, p.content,
  ${zoned('p.updated_at')} AS updated_at FROM publications p JOIN blogs b ON b.id = p.blog_id
  WHERE p.site_id = $1 AND p.status = 'published'`;

const policyRow = z.object({ id: z.string(), content: z.string().nullable(), updated_at: z.string() });
const contactsRow = z.object({ fields: z.json(), updated_at: z.string() });
const publicationRow = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  blog_id: z.string(),
  blog_handle: z.string(),
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
  const { id, title, slug, excerpt, content } = row;
  return {
    type: 'publication',
    id,
    updatedAt: row.updated_at,
    data: { title, slug, blogId: row.blog_id, blogHandle: row.blog_handle, excerpt, content },
  };
}

async function rowsOf<T>(db: Queryable, sql: string, siteId: string, schema: z.ZodType<T>): Promise<T[]> {
  return (await db.query(sql, [siteId])).rows.map((row) => schema.parse(row));
}

// Ключ текущей ревизии магазина (design.md блока 8, раздел 4): tokens — правки токенов в форме блока 1, settings —
// настройки не про вид. Ключа нет или он не объект — пустые правки: пустое не ломает. Ревизия — текущая
// (site.current_revision_id), как у нынешней сборки.
export const revisionKeySql = (key: 'tokens' | 'settings'): string =>
  `CASE WHEN jsonb_typeof(r.data->'${key}') = 'object' THEN r.data->'${key}' ELSE '{}'::jsonb END`;
// Свои страницы (часть 4, Р1-4-8) — ключ pages ревизии: список; не список — своих страниц нет.
const REVISION_SQL = `SELECT ${revisionKeySql('tokens')} AS tokens, ${revisionKeySql('settings')} AS settings,
  CASE WHEN jsonb_typeof(r.data->'pages') = 'array' THEN r.data->'pages' ELSE '[]'::jsonb END AS pages
  FROM site s LEFT JOIN site_revision r ON r.id = s.current_revision_id WHERE s.id = $1`;
const jsonObject = z.record(z.string(), z.json());
export type JsonObject = z.infer<typeof jsonObject>;
const revisionRow = z.object({ tokens: jsonObject, settings: jsonObject, pages: z.array(z.unknown()) });

// Ревизия во входах сборки: правки токенов (блок 1), правки настроек темы — их читают секции с "uses": ["theme"] (часть
// 4 блока 1 «Секций и SDK»), и свои страницы мерчанта.
export interface RevisionInput {
  tokens: JsonObject;
  settings: JsonObject;
  pages: RevisionPage[];
}

// Ревизия из текущей ревизии магазина. Неверная своя страница — без неё, строка журнала page-invalid.
export async function readRevision(db: Queryable, siteId: string, log: Log): Promise<RevisionInput> {
  const row = (await rowsOf(db, REVISION_SQL, siteId, revisionRow)).at(0);
  if (row === undefined) return { tokens: {}, settings: {}, pages: [] };
  const invalid = (fields: LogFields): void => log('page-invalid', { shopId: siteId, ...fields });
  return { tokens: row.tokens, settings: row.settings, pages: revisionPagesOf(row.pages, invalid) };
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
  // Сборщик аналитики для конфига витрины (блок 11): ANALYTICS_COLLECTOR_URL без косой черты в конце.
  analyticsUrl: string;
}

export interface InputsParts {
  platform: Platform;
  theme: ThemeState & { id: string };
  shop: Shop;
  address: ShopAddress;
  year: number;
  entities: readonly Entity[];
  received: boolean;
  revision: RevisionInput;
  shell: BuildInputs['shell'];
  code: BuildInputs['code'];
}

// Тема магазина — только новой архитектуры: те, что записаны в theme-versions.json блока 4 и загружены сборщиком.
// Версия — из закрепления (блок 10); пустое — выпущенная версия, сам снимок закрепление не пишет (это делает сборка).
export async function themeOf(deps: SnapshotDeps, shop: Shop): Promise<ThemeState & { id: string }> {
  if (shop.themeId === null || !deps.themes.has(shop.themeId))
    throw new StorefrontBuilderError('shop-invalid', `тема ${shop.themeId} — не новой архитектуры`, {
      path: `site/${shop.id}`,
    });
  const version = shop.themeVersion ?? (await deps.pins.released(shop.themeId));
  const state = await deps.pins.stateOf(shop.themeId, version);
  if (state === null)
    throw new StorefrontBuilderError('renderer-missing', `версии ${version} нет в записи рисовальщиков`, {
      path: `site/${shop.id}`,
    });
  return { id: shop.themeId, ...state };
}

export interface SnapshotDeps {
  db: Queryable;
  products: ProductRequest;
  code: CodeDeps;
  counters: CounterRequest;
  platform: Platform;
  themes: ReadonlyMap<string, ThemeState>;
  // Версии тем и выпущенная версия (блок 10, theme-catalog.ts).
  pins: ThemePins;
  clock: () => Date;
}

export interface Snapshot {
  shop: Shop;
  address: ShopAddress;
  inputs: ReturnType<typeof buildInputsOf>;
  // Байты кода для сборки (блок 7): ядро и скрипты секций по отпечатку.
  assets: CodeAssets;
  // Включённые расширения и их версии (блок 10, задача 11): справка в манифест сборки.
  extensions: readonly { id: string; version: string }[];
}

// Снимок целиком: строка сайта, его сущности, товары и код секций разом. Магазина нет — ошибка shop-invalid.
export async function readSnapshot(deps: SnapshotDeps, siteId: string): Promise<Snapshot> {
  const shop = await readShop(deps.db, siteId);
  if (shop === null) throw new StorefrontBuilderError('shop-invalid', 'магазина нет', { path: `site/${siteId}` });
  const theme = await themeOf(deps, shop);
  const address = shopAddress(shop);
  // Оплата онлайн (часть 4, Р1-4-6) — тем же RPC-клиентом, что товары; billing не ответил — оплаты нет, данные получены.
  const [siteEntities, products, revision, shopCode, counters, billing] = await Promise.all([
    readSiteEntities(deps.db, siteId),
    fetchProducts(deps.products, shop),
    readRevision(deps.db, siteId, deps.products.log),
    readShopCode(deps.code, siteId),
    fetchCounters(deps.counters, shop),
    fetchBilling(deps.products, siteId),
  ]);
  const entities = [...siteEntities, ...(products ?? []), ...(counters ?? []), billing];
  const year = deps.clock().getUTCFullYear();
  const received = products !== null && shopCode !== null && counters !== null;
  const { shell, code, assets, extensions } = shopCode ?? NO_CODE;
  const parts = { platform: deps.platform, theme, shop, address, year, entities, received, revision, shell, code };
  return { shop, address, inputs: buildInputsOf(parts), assets, extensions };
}

// Входы сборки блока 4 одним объектом. Правки токенов мерчанта — из текущей ревизии (их пишет панель темы, блок 8).
// Настройки темы идут в ревизию входов: их читают секции с "uses": ["theme"] (часть 4 блока 1 «Секций и SDK»).
export const buildInputsOf = (parts: InputsParts) => ({
  platform: { renderHash: parts.platform.renderHash },
  theme: parts.theme,
  shell: parts.shell,
  // Версия библиотеки шрифтов (блок 12) — реестр этого образа.
  fonts: FONT_LIBRARY_HASH,
  code: parts.code,
  revision: parts.revision,
  site: {
    id: parts.shop.id,
    name: parts.shop.name,
    publicUrl: parts.address.url,
    description: parts.shop.description,
    seoTitle: parts.shop.seoTitle,
    keywords: parts.shop.keywords,
    logoUrl: parts.shop.logoUrl,
    updatedAt: parts.shop.updatedAt,
  },
  env: { apiUrl: parts.platform.apiUrl, analyticsUrl: parts.platform.analyticsUrl },
  year: parts.year,
  data: { status: parts.received ? 'received' : 'failed', entities: parts.entities },
});
