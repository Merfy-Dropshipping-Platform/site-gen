import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { DoorFields } from './doors';
import { SECTION_KINDS, type SectionFiles } from './format';
import type { PreparedSection } from './prepare';
import { sectionProblemSchema } from './problems';

// Реестр секций (design.md блока 7, С7-10 Б «одна общая таблица», С7-20 Б) — таблица storefront_section базы sites
// (drizzle/0024). Строка — принятая правка секции или глобального скрипта любого автора. Выпуск платформы, темы и
// расширения — строка с версией (release), она не меняется: та же версия с другим исходником — отказ release-changed
// (accept.ts). Своя секция магазина — строки без версии: draft — текущая правка (её видит превью, п. 15), published — та,
// что на витрине; «верни как было» — сделать текущей прежнюю строку. Правки и публикация своих секций одного магазина
// идут под замком владельца: две правки разом не теряют друг друга, публикация не видит половину правки. Строки не
// удаляются.
export type Queryable = Pick<Pool, 'query'>;
export type Database = Pick<Pool, 'query' | 'connect'>;
// Авторы строк реестра. platform и theme — только у строк, сохранённых до блока 1 «Секций и SDK»: способов сохранения
// для них больше нет, строки остаются в таблице (п. 27), магазину они не видны.
export const SECTION_AUTHORS = ['platform', 'theme', 'shop', 'extension'] as const;

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const COLUMNS = `id, name, kind, author, owner, release, source_hash AS "sourceHash", content_hash AS "contentHash",
  manifest, token_order AS "tokenOrder", template, style, render, render_hash AS "renderHash", script, script_hash AS "scriptHash", warnings,
  script_meta AS "scriptMeta", draft, published,
  to_char(created_at AT TIME ZONE 'UTC', ${ISO}) AS "createdAt"`;

const sectionRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(SECTION_KINDS),
  author: z.enum(SECTION_AUTHORS),
  owner: z.string(),
  release: z.string().nullable(),
  sourceHash: z.string(),
  contentHash: z.string(),
  // Манифест — как записан при приёме: у строк до SDK 1 он старого формата, поэтому здесь без схемы.
  manifest: z.unknown(),
  // Порядок ключей tokens из section.json (drizzle/0031): у строк, принятых раньше, — null, их tokens как раньше.
  tokenOrder: z.array(z.string()).nullish(),
  template: z.string(),
  style: z.string(),
  render: z.string().nullable(),
  renderHash: z.string().nullable(),
  script: z.string().nullable(),
  scriptHash: z.string().nullable(),
  // Часть 5в блока 5 (drizzle/0032): что нужно скрипту — как записал приём; у строк до 5в — null. Форму сверяет
  // currentSection: значение не той формы сборка считает строкой до 5в.
  scriptMeta: z.unknown().optional(),
  warnings: z.array(sectionProblemSchema),
  draft: z.boolean(),
  published: z.boolean(),
  createdAt: z.string(),
});
export type SectionRow = z.infer<typeof sectionRowSchema>;

// Правка для записи: дверь (автор, владелец, выпуск), собранная секция и отпечатки (accept.ts) — исходника (по нему
// «без изменений»), правки (по нему сборка ссылается на строку, п. 19) и файла скрипта (ключ в storefront/blobs).
export interface NewSection {
  door: DoorFields;
  section: PreparedSection;
  sourceHash: string;
  contentHash: string;
  // Отпечаток модуля рендера — sha256 его байтов: по нему сборка и превью находят и сверяют модуль. Глобальный скрипт — null.
  renderHash: string | null;
  scriptHash: string | null;
  source: SectionFiles;
  // Порядок ключей tokens из section.json (блок 4а): сохраняется при приёме, при чтении по нему собирается tokens.
  tokenOrder: readonly string[] | null;
}

// Что видно магазину: его опубликованные секции и секции включённых у него расширений — в версиях, с которыми он
// собирается. Секций платформы и тем нет (блок 1 «Секций и SDK», пп. 1, 2).
export interface Visibility {
  shopId: string;
  extensions: readonly { id: string; version: string }[];
}

export interface SavedDraft {
  row: SectionRow;
  created: boolean;
}

const INSERT_SQL = `INSERT INTO storefront_section (id, name, kind, author, owner, release, source_hash, content_hash,
  manifest, token_order, source, template, style, script, script_hash, warnings, draft, render, render_hash, script_meta)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`;
const RELEASE_INSERT_SQL = `${INSERT_SQL}
  ON CONFLICT (author, owner, name, release) WHERE release IS NOT NULL DO NOTHING RETURNING ${COLUMNS}`;
const DRAFT_INSERT_SQL = `${INSERT_SQL} RETURNING ${COLUMNS}`;
const RELEASE_SQL = `SELECT ${COLUMNS} FROM storefront_section
  WHERE author = $1 AND owner = $2 AND name = $3 AND release = $4`;
const SHOP_ROWS = `FROM storefront_section WHERE author = 'shop' AND owner = $1 AND name = $2`;
const DRAFT_SQL = `SELECT ${COLUMNS} ${SHOP_ROWS} AND draft`;
const BY_ID_SQL = `SELECT ${COLUMNS} ${SHOP_ROWS} AND id = $3`;
const HISTORY_SQL = `SELECT ${COLUMNS} ${SHOP_ROWS} ORDER BY created_at, id`;
const CLEAR_DRAFT_SQL = `UPDATE storefront_section SET draft = false
  WHERE author = 'shop' AND owner = $1 AND name = $2 AND draft`;
const PICK_DRAFT_SQL = `UPDATE storefront_section SET draft = true
  WHERE author = 'shop' AND owner = $1 AND name = $2 AND id = $3 RETURNING ${COLUMNS}`;
// Публикация: сначала снять с витрины строки, у которых текущая правка другая, потом поставить текущие — уникальный
// индекс «одна на витрине» не видит двух строк разом.
const UNPUBLISH_SQL = `UPDATE storefront_section p SET published = false FROM storefront_section d
  WHERE p.author = 'shop' AND p.owner = $1 AND p.published
    AND d.owner = p.owner AND d.name = p.name AND d.draft AND d.id <> p.id`;
const PUBLISH_SQL = `UPDATE storefront_section SET published = true
  WHERE author = 'shop' AND owner = $1 AND draft AND NOT published RETURNING name`;
const VISIBLE_SQL = `SELECT ${COLUMNS} FROM storefront_section
  WHERE (author, owner, release) IN (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]))
     OR (author = 'shop' AND owner = $4 AND published)
  ORDER BY name COLLATE "C"`;

const nameRow = z.object({ name: z.string() });

async function select(db: Queryable, sql: string, params: unknown[]): Promise<SectionRow[]> {
  return (await db.query(sql, params)).rows.map((row) => withTokenOrder(sectionRowSchema.parse(row)));
}

// Свои токены секции — в порядке section.json (блок 4а): jsonb сортирует ключи объекта, порядок имён хранится в
// token_order. Нет порядка (строки, принятые раньше) или нет tokens — манифест не меняется; имена без места в
// порядке (не должно случаться) — в конце.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function withTokenOrder(row: SectionRow): SectionRow {
  const { tokenOrder, manifest } = row;
  if (tokenOrder == null || !isRecord(manifest)) return row;
  const tokens: unknown = manifest.tokens;
  if (!isRecord(tokens)) return row;
  const ordered: Record<string, unknown> = {};
  for (const name of tokenOrder) if (Object.hasOwn(tokens, name)) ordered[name] = tokens[name];
  for (const name of Object.keys(tokens)) if (!Object.hasOwn(ordered, name)) ordered[name] = tokens[name];
  return { ...row, manifest: { ...manifest, tokens: ordered } };
}

const first = (rows: readonly SectionRow[]): SectionRow | null => rows.at(0) ?? null;

function insertParams(row: NewSection, draft: boolean): unknown[] {
  const { door, section } = row;
  return [
    randomUUID(),
    section.name,
    section.manifest.kind,
    door.author,
    door.owner,
    door.release,
    row.sourceHash,
    row.contentHash,
    JSON.stringify(section.manifest),
    row.tokenOrder === null ? null : JSON.stringify(row.tokenOrder),
    JSON.stringify(row.source),
    section.template,
    // Своего CSS у секции SDK 1 нет: колонка style остаётся для строк до SDK 1.
    '',
    section.script,
    row.scriptHash,
    JSON.stringify(section.warnings),
    draft,
    section.render,
    row.renderHash,
    JSON.stringify(section.scriptMeta),
  ];
}

// Транзакция под замком владельца: правки и публикация своих секций одного магазина идут по очереди.
async function underOwnerLock<T>(db: Database, owner: string, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`storefront_section:${owner}`]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Выпуск. Та же версия уже есть — null, строку не трогаем: исходник с ней сверит accept.ts.
export async function insertRelease(db: Queryable, row: NewSection): Promise<SectionRow | null> {
  return first(await select(db, RELEASE_INSERT_SQL, insertParams(row, false)));
}

export async function findRelease(db: Queryable, door: DoorFields, name: string): Promise<SectionRow | null> {
  return first(await select(db, RELEASE_SQL, [door.author, door.owner, name, door.release]));
}

export async function currentDraft(db: Queryable, shopId: string, name: string): Promise<SectionRow | null> {
  return first(await select(db, DRAFT_SQL, [shopId, name]));
}

// Правка своей секции — новая текущая строка (С7-20 Б). Под замком — заново: правка с тем же исходником успела стать
// текущей раньше — новой строки нет.
export async function saveDraft(db: Database, row: NewSection): Promise<SavedDraft> {
  const { owner } = row.door;
  return underOwnerLock(db, owner, async (client) => {
    const current = await currentDraft(client, owner, row.section.name);
    if (current?.sourceHash === row.sourceHash) return { row: current, created: false };
    await client.query(CLEAR_DRAFT_SQL, [owner, row.section.name]);
    const [inserted] = await select(client, DRAFT_INSERT_SQL, insertParams(row, true));
    return { row: inserted, created: true };
  });
}

// Публикация магазина: текущие правки своих секций — на витрину. Ответ — имена секций, у которых витрина сменилась.
export async function publishDrafts(db: Database, shopId: string): Promise<string[]> {
  return underOwnerLock(db, shopId, async (client) => {
    await client.query(UNPUBLISH_SQL, [shopId]);
    const { rows } = await client.query(PUBLISH_SQL, [shopId]);
    return rows.map((row) => nameRow.parse(row).name).sort();
  });
}

// «Верни как было» (С7-20 Б): прежняя строка снова текущая — новой строки и нового файла нет. Такой строки у секции
// магазина нет — null, текущая правка остаётся.
export async function rollbackSection(
  db: Database,
  shopId: string,
  name: string,
  id: string,
): Promise<SectionRow | null> {
  return underOwnerLock(db, shopId, async (client) => {
    const target = first(await select(client, BY_ID_SQL, [shopId, name, id]));
    if (target === null) return null;
    await client.query(CLEAR_DRAFT_SQL, [shopId, name]);
    return first(await select(client, PICK_DRAFT_SQL, [shopId, name, id]));
  });
}

// История своей секции — все правки по времени приёма, текущая и та, что на витрине, — флагами.
export async function sectionHistory(db: Queryable, shopId: string, name: string): Promise<SectionRow[]> {
  return select(db, HISTORY_SQL, [shopId, name]);
}

function releaseColumns(visibility: Visibility): [string[], string[], string[]] {
  // Строки с выпуском, видимые магазину, — только расширений.
  const rows = visibility.extensions.map((extension): [string, string, string] => [
    'extension',
    extension.id,
    extension.version,
  ]);
  return [rows.map((row) => row[0]), rows.map((row) => row[1]), rows.map((row) => row[2])];
}

// Секции, видимые магазину (п. 24): включённых у него расширений — в версиях, с которыми он
// собирается; свои — опубликованные. Выключенного расширения в списке нет — его секций нет.
export async function visibleSections(db: Queryable, visibility: Visibility): Promise<SectionRow[]> {
  return select(db, VISIBLE_SQL, [...releaseColumns(visibility), visibility.shopId]);
}

// Секции, которые видит конструктор магазина (блок 14 «Секций и SDK», Р14-14): расширения — как у сборки, свои — текущие
// правки (draft), а не опубликованные. Сборка и дорисовка читают visibleSections.
const EDITABLE_SQL = `SELECT ${COLUMNS} FROM storefront_section
  WHERE (author, owner, release) IN (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]))
     OR (author = 'shop' AND owner = $4 AND draft)
  ORDER BY name COLLATE "C"`;

export async function editableSections(db: Queryable, visibility: Visibility): Promise<SectionRow[]> {
  return select(db, EDITABLE_SQL, [...releaseColumns(visibility), visibility.shopId]);
}

const SOURCE_SQL = `SELECT id, source FROM storefront_section
  WHERE author = 'shop' AND owner = $1 AND name = $2 AND draft`;
const sourceRow = z.object({ id: z.string(), source: z.record(z.string(), z.string()) });

export interface DraftSource {
  id: string;
  files: SectionFiles;
}

// Файлы текущей правки своей секции магазина — чтобы ИИ дорабатывал её (блок 14, 14.7). Нет такой секции — null.
export async function draftSource(db: Queryable, shopId: string, name: string): Promise<DraftSource | null> {
  const { rows } = await db.query(SOURCE_SQL, [shopId, name]);
  const row = rows.map((item) => sourceRow.parse(item)).at(0);
  return row === undefined ? null : { id: row.id, files: row.source };
}
