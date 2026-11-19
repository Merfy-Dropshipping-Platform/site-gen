import { z } from 'zod';
import { readManifest, type SectionFiles } from './format';
import { libraryLatestOf, libraryRefOf, type LibraryHistory, type LibraryRef } from './library-history';
import type { RowsQuery } from './registry';

// Предложение обновить копию библиотечной секции (20.11). У каждого магазина своя копия секции: неизменённые копии
// обновляет выпуск секции (theme-release section), а копию, которую изменил мерчант или агент, платформа заменить не
// может — она замечает новую версию библиотеки и предлагает обновление, агент спрашивает мерчанта и переносит его
// правки на новую версию.
//
// Основа копии — версия библиотеки, от которой она пошла. Явно её пишет сохранение (`library_base` строки, отпечаток из
// истории библиотеки: library-history.ts); без неё основа — самая новая версия из истории среди отпечатков строк копии.
// Предложение есть, когда копия изменена (текущая правка не из истории), основа известна и старше текущей версии секции
// в библиотеке, а мерчант не отказался от этой версии.

export interface UpdateOffer {
  name: string; // имя библиотечной секции (из section.json)
  base: LibraryRef;
  latest: LibraryRef;
}

// Строка копии: исходник, основа и признак текущей правки; строки магазина по времени приёма.
export interface CopyRow {
  sourceHash: string;
  libraryBase: string | null;
  draft: boolean;
}

const newest = (refs: readonly LibraryRef[]): LibraryRef | undefined =>
  refs.reduce<LibraryRef | undefined>(
    (top, ref) => (top === undefined || ref.version > top.version ? ref : top),
    undefined,
  );

const defined = <T>(value: T | undefined): value is T => value !== undefined;

// Основа копии: явная основа текущей правки и версии из истории среди отпечатков строк — самая новая одной секции.
// Явная основа новее строк после переноса правок; строки новее неё, когда выпуск секции обновил копию без правок.
export function baseOf(rows: readonly CopyRow[], history?: LibraryHistory): LibraryRef | undefined {
  const explicit = rows
    .filter((row) => row.draft)
    .map((row) => (row.libraryBase === null ? undefined : libraryRefOf(row.libraryBase, history)))
    .find(defined);
  const seen = rows.map((row) => libraryRefOf(row.sourceHash, history)).filter(defined);
  const name = explicit?.name ?? seen.at(-1)?.name;
  return newest([...(explicit === undefined ? [] : [explicit]), ...seen].filter((ref) => ref.name === name));
}

const isDeclined = (declined: number | undefined, latest: LibraryRef): boolean =>
  declined !== undefined && declined >= latest.version;

// Предложение по строкам копии; declined — версия секции, от которой мерчант отказался (нет — не отказывался).
export function offerOf(
  rows: readonly CopyRow[],
  declined: number | undefined,
  history?: LibraryHistory,
): UpdateOffer | undefined {
  const current = rows.find((row) => row.draft);
  if (current === undefined || libraryRefOf(current.sourceHash, history) !== undefined) return undefined; // нет или не изменена
  const base = baseOf(rows, history);
  if (base === undefined) return undefined; // не наша
  const latest = libraryLatestOf(base.name, history);
  if (latest === undefined || latest.version <= base.version || isDeclined(declined, latest)) return undefined;
  return { name: base.name, base, latest };
}

const copyRow = z.object({
  name: z.string(),
  sourceHash: z.string(),
  libraryBase: z.string().nullable(),
  draft: z.boolean(),
});
const declineRow = z.object({ name: z.string(), version: z.number() });

const ROWS_SQL = `SELECT name, source_hash AS "sourceHash", library_base AS "libraryBase", draft
  FROM storefront_section WHERE author = 'shop' AND owner = $1 AND ($2::text IS NULL OR name = $2)
  ORDER BY created_at, id`;
const DECLINES_SQL = 'SELECT name, version FROM storefront_section_update_decline WHERE site_id = $1';
const DECLINE_SQL = `INSERT INTO storefront_section_update_decline (site_id, name, version) VALUES ($1, $2, $3)
  ON CONFLICT (site_id, name) DO UPDATE
  SET version = GREATEST(storefront_section_update_decline.version, excluded.version), declined_at = now()`;
const BASE_SOURCE_SQL = `SELECT source FROM storefront_section
  WHERE author = 'shop' AND owner = $1 AND name = $2 AND source_hash = $3 LIMIT 1`;
const sourceRow = z.object({ source: z.record(z.string(), z.string()) });

function groupedByName(rows: readonly z.infer<typeof copyRow>[]): Map<string, CopyRow[]> {
  const groups = new Map<string, CopyRow[]>();
  for (const { name, ...row } of rows) {
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  return groups;
}

// Предложения секций магазина: все (only — null) или одной по полному имени; секции без предложения в ответе нет.
async function offersOf(
  db: RowsQuery,
  shopId: string,
  only: string | null,
  history?: LibraryHistory,
): Promise<ReadonlyMap<string, UpdateOffer>> {
  const [copies, declines] = await Promise.all([db.query(ROWS_SQL, [shopId, only]), db.query(DECLINES_SQL, [shopId])]);
  const declined = new Map(declines.rows.map((row) => declineRow.parse(row)).map((row) => [row.name, row.version]));
  const offers = [...groupedByName(copies.rows.map((row) => copyRow.parse(row)))].map(
    ([name, rows]) => [name, offerOf(rows, declined.get(name), history)] as const,
  );
  return new Map(offers.flatMap(([name, offer]) => (offer === undefined ? [] : [[name, offer] as const])));
}

// Предложения магазина: полное имя секции (`shop:faq`) → предложение.
export const updateOffersOf = (
  db: RowsQuery,
  shopId: string,
  history?: LibraryHistory,
): Promise<ReadonlyMap<string, UpdateOffer>> => offersOf(db, shopId, null, history);

export async function updateOfferOf(
  db: RowsQuery,
  shopId: string,
  name: string,
  history?: LibraryHistory,
): Promise<UpdateOffer | undefined> {
  return (await offersOf(db, shopId, name, history)).get(name);
}

// Мерчант отказался от обновления: предложение молчит до следующей версии библиотеки. Предложения нет — undefined.
export async function declineUpdate(
  db: RowsQuery,
  shopId: string,
  name: string,
  history?: LibraryHistory,
): Promise<UpdateOffer | undefined> {
  const offer = await updateOfferOf(db, shopId, name, history);
  if (offer === undefined) return undefined;
  await db.query(DECLINE_SQL, [shopId, name, offer.latest.version]);
  return offer;
}

// Исходник версии, которая была у магазина: строка секции с этим отпечатком. Строки нет — null.
export async function sourceWithHash(
  db: RowsQuery,
  shopId: string,
  name: string,
  hash: string,
): Promise<SectionFiles | null> {
  const { rows } = await db.query(BASE_SOURCE_SQL, [shopId, name, hash]);
  return rows.map((row) => sourceRow.parse(row).source).at(0) ?? null;
}

async function rowsOf(db: RowsQuery, shopId: string, name: string): Promise<CopyRow[]> {
  const { rows } = await db.query(ROWS_SQL, [shopId, name]);
  return groupedByName(rows.map((row) => copyRow.parse(row))).get(name) ?? [];
}

// Основа должна быть версией той же секции, чья это копия: своё имя секции или основа, уже записанная у копии. Новая
// секция магазина (строк с таким именем нет) — копия библиотечной под любым именем: её кладёт действие `copy`.
const sameLineage = (rows: readonly CopyRow[], name: string, base: LibraryRef, history?: LibraryHistory): boolean =>
  rows.length === 0 || [name, baseOf(rows, history)?.name].includes(base.name);

// Отказ сохранению с явной основой (`basedOn`): отпечаток не из истории библиотеки или версия чужой секции. null — можно.
export async function basedOnProblem(
  db: RowsQuery,
  shopId: string,
  files: SectionFiles,
  basedOn: string,
  history?: LibraryHistory,
): Promise<string | null> {
  const base = libraryRefOf(basedOn, history);
  if (base === undefined)
    return `basedOn ${basedOn} нет в истории библиотеки: основа — отпечаток версии библиотечной секции`;
  const manifest = readManifest(files);
  if (!manifest.ok) return null; // секция всё равно не примется — отказ даст проверка
  const { name } = manifest.value;
  const rows = await rowsOf(db, shopId, `shop:${name}`);
  if (sameLineage(rows, name, base, history)) return null;
  return `basedOn — версия библиотечной секции «${base.name}», а сохраняется «${name}»: основа должна быть версией той же секции`;
}
