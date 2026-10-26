import { hashOf } from '@merfy/storefront-build';
import {
  DEFAULT_SANDBOX,
  DraftChangedError,
  acceptSection,
  currentDraft,
  draftSource,
  prepareInWorker,
  problemText,
  type Database,
  type Door,
  type SandboxOptions,
  type SectionFiles,
} from '@merfy/storefront-sections';
import type { ObjectStore } from '@merfy/storefront-storage';
import { z } from 'zod';
import { StorefrontBuilderError, errorText } from '../errors';
import { createOrQueue, testShopOf } from './platform';
import { planWaves } from './waves';

// Новая версия нашей секции во всех магазинах (блок 15, часть 15з): каждой копии в магазинах темы — тот же
// acceptSection, что у мерчанта, с условием expectDraft → выпуск section волнами (правку на витрину ставит ведущий в
// волне магазина). Копию, которую изменил мерчант, не трогаем. Без write — сухой прогон: проверка и список.
export type CopyAction = 'update' | 'pending' | 'already' | 'changed' | 'not-ours' | 'live-changed';

export interface ShopCopy {
  siteId: string;
  published: boolean; // site.status = 'published'
  draft: string | null; // хеш исходника текущей правки; null — нет
  live: string | null; // хеш исходника правки на витрине; null — нет
  hashes: readonly string[]; // хеши исходника всех строк секции у магазина
}

// Р15з-4 по порядку: текущая не из known — changed (у магазина была хоть одна наша версия) или not-ours; на витрине не
// из known — live-changed; текущая === next — already (на витрине next) или pending; иначе update.
export function copyAction(copy: ShopCopy, known: ReadonlySet<string>, next: string): CopyAction {
  const wasOurs = copy.hashes.some((hash) => known.has(hash));
  if (copy.draft === null || !known.has(copy.draft)) return wasOurs ? 'changed' : 'not-ours';
  if (copy.live !== null && !known.has(copy.live)) return 'live-changed';
  if (copy.draft === next) return copy.live === next ? 'already' : 'pending';
  return 'update';
}

export interface SectionSources {
  read: (folder: string) => Promise<SectionFiles>; // новая версия — readSectionFolder
  versions: (folder: string) => Promise<SectionFiles[]>; // наши версии — gitSectionVersions
}

export interface ResaveDeps extends SectionSources {
  db: Database;
  store: ObjectStore;
  contour: 'dev' | 'prod';
  startedBy: string;
  say: (line: string) => void;
  sandbox?: SandboxOptions;
}

export interface ResaveCommand {
  folder: string;
  write: boolean;
  testShop: string | null;
  theme: string;
}

export interface ShopResult {
  siteId: string;
  action: CopyAction | 'failed';
  files?: { added: string[]; changed: string[]; removed: string[] }; // у update — против draftSource, по алфавиту
  error?: string; // у failed
  inRelease: boolean; // опубликованный магазин, update (сохранено) или pending, хеш правки = toHash
}

export interface ResaveReport {
  name: string;
  sourceHash: string;
  write: boolean;
  shops: ShopResult[];
  release: { id: number; status: string } | null;
  // skipped — changed + not-ours + live-changed.
  counts: { updated: number; pending: number; already: number; skipped: number; failed: number };
}

const COPIES_SQL = `SELECT s.owner AS site_id, site.status = 'published' AS published,
  max(s.source_hash) FILTER (WHERE s.draft) AS draft,
  max(s.source_hash) FILTER (WHERE s.published) AS live,
  array_agg(DISTINCT s.source_hash ORDER BY s.source_hash) AS hashes
FROM storefront_section s JOIN site ON site.id::text = s.owner
WHERE s.author = 'shop' AND s.name = $1 AND site.theme_id = $2 AND site.deleted_at IS NULL
GROUP BY s.owner, site.status ORDER BY s.owner`;
const LAST_FINISHED_SQL = `SELECT to_version FROM storefront_release WHERE kind = 'section' AND
  subject = $1 AND contour = $2 AND status = 'finished' ORDER BY id DESC LIMIT 1`;
const ACTIVE_SAME_SQL = `SELECT id, status FROM storefront_release WHERE kind = 'section' AND
  subject = $1 AND to_version = $2 AND contour = $3 AND status IN ('planning', 'queued', 'testing', 'awaiting', 'waves')
  ORDER BY id DESC LIMIT 1`;

const copyRow = z.object({
  site_id: z.string(),
  published: z.boolean(),
  draft: z.string().nullable(),
  live: z.string().nullable(),
  hashes: z.array(z.string()),
});
const releaseRow = z.object({ id: z.number(), status: z.string() });
const toVersionRow = z.object({ to_version: z.string() });

const refuse = (text: string): StorefrontBuilderError => new StorefrontBuilderError('release-refused', text);

// Имя секции магазина — из префикса двери и имени из section.json; литерала «shop:» в коде нет (сторож имён секций).
const shopNameOf = (name: string): string => ['shop', name].join(':');

async function readCopies(db: Database, name: string, theme: string): Promise<ShopCopy[]> {
  const { rows } = await db.query(COPIES_SQL, [name, theme]);
  return rows.map((row) => {
    const parsed = copyRow.parse(row);
    return {
      siteId: parsed.site_id,
      published: parsed.published,
      draft: parsed.draft,
      live: parsed.live,
      hashes: parsed.hashes,
    };
  });
}

// Какие файлы копии меняются: имена против текущей правки, по алфавиту.
function filesDiff(before: SectionFiles, after: SectionFiles): ShopResult['files'] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const stateOf = (name: string): 'added' | 'changed' | 'removed' | 'same' => {
    if (!(name in before)) return 'added';
    if (!(name in after)) return 'removed';
    return before[name] === after[name] ? 'same' : 'changed';
  };
  const states = names.map((name) => [stateOf(name), name] as const);
  const pick = (state: string): string[] => states.filter(([s]) => s === state).map(([, name]) => name);
  return { added: pick('added'), changed: pick('changed'), removed: pick('removed') };
}

// Сухой прогон: действие и меняющиеся файлы, ничего не записано.
async function planOf(
  deps: ResaveDeps,
  copy: ShopCopy,
  action: CopyAction,
  name: string,
  files: SectionFiles,
): Promise<ShopResult> {
  if (action !== 'update')
    return { siteId: copy.siteId, action, inRelease: copy.published && action === 'pending' };
  const current = await draftSource(deps.db, copy.siteId, name);
  const diff = current === null ? undefined : filesDiff(current.files, files);
  return { siteId: copy.siteId, action, files: diff, inRelease: copy.published };
}

// Сохранение одной копии: тот же путь, что у мерчанта; условие — Р15з-2.
async function resaveShop(
  deps: ResaveDeps,
  copy: ShopCopy,
  name: string,
  files: SectionFiles,
  dry: ShopResult,
): Promise<ShopResult> {
  const door: Door = { author: 'shop', shopId: copy.siteId };
  try {
    const result = await acceptSection({ db: deps.db, store: deps.store }, door, files, { expectDraft: copy.draft });
    if (result.status === 'refused')
      return { siteId: copy.siteId, action: 'failed', error: result.problems.map(problemText).join('; '), inRelease: false };
    const action = result.status === 'accepted' ? 'update' : 'pending';
    return { siteId: copy.siteId, action, files: dry.files, inRelease: copy.published };
  } catch (error) {
    if (error instanceof DraftChangedError) return { siteId: copy.siteId, action: 'changed', inRelease: false };
    return { siteId: copy.siteId, action: 'failed', error: errorText(error), inRelease: false };
  }
}

function countsOf(shops: readonly ShopResult[]): ResaveReport['counts'] {
  const count = (action: string): number => shops.filter((shop) => shop.action === action).length;
  return {
    updated: count('update'),
    pending: count('pending'),
    already: count('already'),
    skipped: count('changed') + count('not-ours') + count('live-changed'),
    failed: count('failed'),
  };
}

// Хеш правки выпуска: у первой сохранённой копии, иначе — у первого ждущего волны.
async function toHashOf(deps: ResaveDeps, shops: readonly ShopResult[], name: string): Promise<string | null> {
  const first = shops.find((shop) => shop.action === 'update') ?? shops.find((shop) => shop.action === 'pending');
  if (first === undefined) return null;
  return (await currentDraft(deps.db, first.siteId, name))?.contentHash ?? null;
}

// В выпуск идут опубликованные магазины с новой правкой (update после записи или pending); хеш правки другой — ошибка.
async function markInRelease(deps: ResaveDeps, shops: ShopResult[], name: string): Promise<void> {
  const toHash = await toHashOf(deps, shops, name);
  if (toHash === null) return;
  for (const shop of shops) {
    if (shop.action !== 'update' && shop.action !== 'pending') continue;
    const copyHash = (await currentDraft(deps.db, shop.siteId, name))?.contentHash ?? null;
    if (copyHash !== toHash) {
      shop.action = 'failed';
      shop.error = 'хеш правки другой';
      shop.inRelease = false;
    }
  }
}

// Такой выпуск уже есть (активный или ждёт) — его номер; повторы не заводят новых строк.
async function existingRelease(
  deps: ResaveDeps,
  name: string,
  next: string,
): Promise<{ id: number; status: string } | null> {
  const { rows } = await deps.db.query(ACTIVE_SAME_SQL, [name, next, deps.contour]);
  return rows.map((row) => releaseRow.parse(row)).at(0) ?? null;
}

// Прошлый законченный выпуск секции: его toVersion — fromVersion нового.
async function finishedVersionOf(deps: ResaveDeps, name: string): Promise<string | null> {
  const { rows } = await deps.db.query(LAST_FINISHED_SQL, [name, deps.contour]);
  return rows.map((row) => toVersionRow.parse(row).to_version).at(0) ?? null;
}

async function releaseOf(
  deps: ResaveDeps,
  shops: readonly ShopResult[],
  name: string,
  next: string,
  command: ResaveCommand,
): Promise<{ id: number; status: string } | null> {
  const same = await existingRelease(deps, name, next);
  if (same !== null) return same;
  const ids = shops.filter((shop) => shop.inRelease).map((shop) => shop.siteId);
  if (ids.length === 0) return null;
  const toHash = await toHashOf(deps, shops, name);
  if (toHash === null) throw refuse(`у выпуска ${name} нет хеша правки: копии не сохранены`);
  const fromVersion = (await finishedVersionOf(deps, name)) ?? 'seed';
  const release = await createOrQueue(
    deps.db,
    {
      kind: 'section',
      subject: name,
      fromVersion,
      toVersion: next,
      toHash,
      contour: deps.contour,
      startedBy: deps.startedBy,
      status: 'testing',
    },
    (id) => planWaves(ids, testShopOf(ids, command.testShop), id),
  );
  return { id: release.id, status: release.status };
}

// Проверка не прошла — StorefrontBuilderError('release-refused', 'новая версия не прошла проверку: …'), ничего не записано.
export async function resaveSection(deps: ResaveDeps, command: ResaveCommand): Promise<ResaveReport> {
  const files = await deps.read(command.folder);
  const prepared = await prepareInWorker({ prefix: 'shop', files }, deps.sandbox ?? DEFAULT_SANDBOX);
  if (!prepared.ok) throw refuse(`новая версия не прошла проверку: ${prepared.problems.map(problemText).join('; ')}`);
  const name = shopNameOf(prepared.section.manifest.name);
  const next = hashOf(files);
  const known = new Set([...(await deps.versions(command.folder)).map(hashOf), next]);
  const copies = await readCopies(deps.db, name, command.theme);
  const planned = await Promise.all(
    copies.map(async (copy): Promise<ShopResult> => planOf(deps, copy, copyAction(copy, known, next), name, files)),
  );
  if (!command.write) return { name, sourceHash: next, write: false, shops: planned, release: null, counts: countsOf(planned) };
  const saved = await Promise.all(
    copies.map(async (copy, index): Promise<ShopResult> => {
      const dry = planned[index];
      if (dry === undefined || dry.action !== 'update') return dry ?? { siteId: copy.siteId, action: 'failed', error: 'нет плана', inRelease: false };
      return resaveShop(deps, copy, name, files, dry);
    }),
  );
  await markInRelease(deps, saved, name);
  const release = await releaseOf(deps, saved, name, next, command);
  return { name, sourceHash: next, write: true, shops: saved, release, counts: countsOf(saved) };
}

// Отчёт (Р15з-10): шапка (имя, хеш, «сухой прогон — ничего не записано, запись — --write» или «запись»), строка на
// магазин, итог по counts, выпуск («смотри status <№>»), последней строкой — JSON { name, sourceHash, write, counts, release }.
export function reportLines(report: ResaveReport): string[] {
  const mode = report.write ? 'запись' : 'сухой прогон — ничего не записано, запись — --write';
  const title = `${report.name} ${report.sourceHash}: ${mode}`;
  const shopLines = report.shops.map((shop) => {
    const changed = shop.files === undefined ? [] : shop.files.changed.concat(shop.files.added, shop.files.removed);
    const files = changed.length === 0 ? '' : ` (${changed.join(', ')})`;
    const note = shop.error === undefined ? '' : ` — ${shop.error}`;
    const wave = shop.inRelease ? ', в выпуск' : '';
    return `${shop.siteId}: ${shop.action}${files}${note}${wave}`;
  });
  const { counts, release } = report;
  const total = `обновлено ${counts.updated}, ждут волны ${counts.pending}, уже на новой ${counts.already}, пропущено ${counts.skipped}, упало ${counts.failed}`;
  const releaseLine =
    release === null ? 'выпуска нет' : `выпуск №${release.id} (${release.status}) — смотри status ${release.id}`;
  const json = JSON.stringify({
    name: report.name,
    sourceHash: report.sourceHash,
    write: report.write,
    counts: report.counts,
    release: report.release,
  });
  return [title, ...shopLines, total, releaseLine, json];
}
