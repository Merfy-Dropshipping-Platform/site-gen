import {
  FONT_LIBRARY_HASH,
  type BlogData,
  type BuildInputs,
  type CodeAssets,
  type Entity,
  type PublicationData,
  type RevisionPage,
  type ThemeState,
} from '@merfy/storefront-build';
import { cleanArticleHtml } from '@merfy/storefront-sections';
import { z } from 'zod';
import { fetchBilling } from './billing';
import { COLLECTIONS_PATTERN, collectionEntityOf, productEntityOf } from './catalog';
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
// блока 4 падает до рендера: выложенную сборку не трогаем. Коллекции — у того же сервиса (блок 8 «Секций и SDK», часть
// 8а, product.collections.storefront), касса — у billing; во входы — только публичные поля каталога (catalog.ts). Код секций
// (блок 7, code.ts) — из реестра storefront_section и сервиса extensions; не получен — снимок тоже «не получен».
// Счётчики мерчанта (блок 11, counters.ts) — у сборщика аналитики; не ответил — снимок тоже «не получен».

export const PRODUCT_QUEUE = 'product-service_queue';
const PRODUCT_LIST = 'product.list';
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
// Блог записи вместо прежней категории (site-gen, миграция 0027): id и адрес блога. Блок 8 «Секций и SDK», часть 8а:
// SEO, обложка и дата публикации статьи; блоги магазина — своей сущностью.
const PUBLICATIONS_SQL = `SELECT p.id, p.title, p.slug, p.blog_id, b.handle AS blog_handle, p.excerpt, p.content,
  p.seo_title, p.seo_description, p.cover_image_url, ${zoned('p.published_at')} AS published_at,
  ${zoned('p.updated_at')} AS updated_at FROM publications p JOIN blogs b ON b.id = p.blog_id
  WHERE p.site_id = $1 AND p.status = 'published'`;
const BLOGS_SQL = `SELECT id, title, handle, ${zoned('updated_at')} AS updated_at FROM blogs WHERE site_id = $1`;

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
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  published_at: z.string().nullable(),
  updated_at: z.string(),
});
const blogRow = z.object({ id: z.string(), title: z.string(), handle: z.string(), updated_at: z.string() });

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

// Текст статьи — очищенный списком «Записи блога» пяти тем (Р8а-13): сырой HTML во входы сборки не попадает.
function publicationEntity(row: z.infer<typeof publicationRow>): Entity {
  const { id, title, slug, excerpt } = row;
  const data: PublicationData = {
    title,
    slug,
    blogId: row.blog_id,
    blogHandle: row.blog_handle,
    excerpt,
    content: cleanArticleHtml(row.content),
    publishedAt: row.published_at,
    cover: row.cover_image_url || null,
    seo: { title: row.seo_title ?? '', description: row.seo_description ?? '' },
  };
  return { type: 'publication', id, updatedAt: row.updated_at, data };
}

function blogEntity(row: z.infer<typeof blogRow>): Entity {
  const data: BlogData = { title: row.title, handle: row.handle };
  return { type: 'blog', id: row.id, updatedAt: row.updated_at, data };
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
  const [policies, contacts, publications, blogs] = await Promise.all([
    rowsOf(db, POLICIES_SQL, siteId, policyRow),
    rowsOf(db, CONTACTS_SQL, siteId, contactsRow),
    rowsOf(db, PUBLICATIONS_SQL, siteId, publicationRow),
    rowsOf(db, BLOGS_SQL, siteId, blogRow),
  ]);
  return [
    ...policies.map(policyEntity),
    ...contacts.map(contactsEntity),
    ...publications.map(publicationEntity),
    ...blogs.map(blogEntity),
  ];
}

const listSchema = z.object({ success: z.boolean(), data: z.array(z.unknown()).optional() });
const itemIdSchema = z.object({ id: z.string() });

export interface ProductRequest {
  call: Call;
  timeoutMs: number;
  log: Log;
}

// Список каталога у сервиса product (блок 8 «Секций и SDK», часть 8а): шаблон RPC, строки журнала, разбор элемента.
interface CatalogList {
  pattern: string;
  failed: string;
  invalid: string;
  entityOf: (raw: unknown) => Entity | null;
}
const PRODUCTS: CatalogList = {
  pattern: PRODUCT_LIST,
  failed: 'products-failed',
  invalid: 'product-invalid',
  entityOf: productEntityOf,
};
const COLLECTIONS: CatalogList = {
  pattern: COLLECTIONS_PATTERN,
  failed: 'collections-failed',
  invalid: 'collection-invalid',
  entityOf: collectionEntityOf,
};

function idOf(raw: unknown): string {
  const parsed = itemIdSchema.safeParse(raw);
  return parsed.success ? parsed.data.id : '';
}

// Список магазина. null — не получен: сервис молчит, ответил ошибкой, неуспехом или не по форме; причина — в журнале.
// Элемент не по форме — без него и строка журнала (product-invalid, collection-invalid) с его id (Р8а-15).
async function fetchList(list: CatalogList, request: ProductRequest, shop: Shop): Promise<Entity[] | null> {
  const data = { tenantId: shop.tenantId, siteId: shop.id };
  try {
    const answer = listSchema.parse(await request.call(PRODUCT_QUEUE, list.pattern, data, request.timeoutMs));
    if (!answer.success) throw new StorefrontBuilderError('rpc-failed', `${list.pattern}: success = false`);
    return (answer.data ?? []).flatMap((raw) => {
      const entity = list.entityOf(raw);
      if (entity === null) request.log(list.invalid, { shopId: shop.id, id: idOf(raw) });
      return entity === null ? [] : [entity];
    });
  } catch (error) {
    request.log(list.failed, { shopId: shop.id, error: errorText(error) });
    return null;
  }
}

export const fetchProducts = (request: ProductRequest, shop: Shop): Promise<Entity[] | null> =>
  fetchList(PRODUCTS, request, shop);
export const fetchCollections = (request: ProductRequest, shop: Shop): Promise<Entity[] | null> =>
  fetchList(COLLECTIONS, request, shop);

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
  const [siteEntities, products, collections, revision, shopCode, counters, billing] = await Promise.all([
    readSiteEntities(deps.db, siteId),
    fetchProducts(deps.products, shop),
    // Коллекции (блок 8 «Секций и SDK», часть 8а) — тем же RPC-клиентом; не ответил — снимок не получен.
    fetchCollections(deps.products, shop),
    readRevision(deps.db, siteId, deps.products.log),
    readShopCode(deps.code, siteId),
    fetchCounters(deps.counters, shop),
    fetchBilling(deps.products, siteId),
  ]);
  const entities = [...siteEntities, ...(products ?? []), ...(collections ?? []), ...(counters ?? []), billing];
  const year = deps.clock().getUTCFullYear();
  const received = products !== null && collections !== null && shopCode !== null && counters !== null;
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
