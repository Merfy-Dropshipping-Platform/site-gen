#!/usr/bin/env tsx
/**
 * Одноразовый скрипт п.2/п.3 брифа
 * `merfy-mcp/docs/plans/2026-09-23-vanilla-seed-into-package.md`.
 *
 * КОНТЕКСТ. Раньше `migrateVanillaHomePage`/`migrateBloomHeaderPadding`
 * (utils/revision-migrations.ts) чинили `pagesData.home` НА КАЖДОМ ЧТЕНИИ
 * (getRevision), пока мерчант ни разу не сохранял магазин — эфемерно, без
 * записи в БД. Обе миграции удалены: тема — это данные её пакета
 * (`packages/theme-<t>`), а не код в общем пути чтения ревизии. Замер
 * (`merfy-mcp/docs/proofs/p2-vanilla-seed-into-package.txt`, п.1) показал:
 * `filterSeededPagesOnWrite` (B17) НИКОГДА не трогает `pagesData.home` —
 * страница передаётся как есть и на запись, и на чтение (`seedContentPagesFromTheme`
 * покрывает только about/delivery/contacts, не home). Значит:
 *
 *   - Магазины, где `home` — то, что реально дал последний СОХРАНЁННЫЙ ответ
 *     конструктора/миграции ДО этой правки (устаревший пакетный сид vanilla
 *     ИЛИ замороженная копия старого вывода миграции, ИЛИ bloom-шапка с
 *     буквальным padding {0,0}), теперь не чинятся вовсе — ни на чтении
 *     (миграция удалена), ни на записи (home не фильтруется).
 *   - Этот скрипт — единственный путь их поправить: он находит именно такие
 *     магазины и создаёт для них НОВУЮ ревизию (CAS) с починенной `home`.
 *
 * БЕЗОПАСНОСТЬ. Трогает ТОЛЬКО магазины, чьё `home` СТРУКТУРНО совпадает с
 * ОДНИМ ИЗ известных системных сидов (см. `isUntouchedVanillaHome` /
 * `bloomHeaderNeedsFix` ниже) — эвристика консервативная: если сомневается,
 * ПРОПУСКАЕТ магазин (лучше не починить лишний раз, чем стереть правку
 * мерчанта). Пишет НЕ поверх старой ревизии (не UPDATE), а НОВУЮ строку
 * `site_revision` + compare-and-swap на `site.current_revision_id` — тот же
 * приём, что `SitesDomainService.createRevision({ expectedCurrentRevisionId })`
 * (sites.service.ts:~1810). Если между чтением и записью магазин уже
 * пересохранили (например, мерчант открыл конструктор) — CAS проигрывает,
 * запись НЕ применяется, старая ревизия остаётся источником правды как есть.
 * Старая ревизия НЕ удаляется и НЕ перезаписывается — история цела, откат —
 * `setCurrentRevision` на старый id.
 *
 * ⚠️ НЕ ЗАПУЩЕН. Число живых vanilla/bloom-магазинов на проде, подпадающих
 * под эвристику, не подсчитано в этой сессии (MCP postgres не подключился —
 * см. пруф). Перед первым реальным запуском: прогнать DRY_RUN=true, ГЛАЗАМИ
 * свериться со списком siteId, только потом DRY_RUN=false.
 *
 * Использование:
 *
 *   DATABASE_URL=postgres://… TARGET=vanilla-home pnpm exec tsx scripts/reseed-untouched-home.ts          # dry-run
 *   DATABASE_URL=postgres://… TARGET=bloom-header-padding pnpm exec tsx scripts/reseed-untouched-home.ts  # dry-run
 *   DATABASE_URL=postgres://… TARGET=all DRY_RUN=false pnpm exec tsx scripts/reseed-untouched-home.ts     # применить оба
 *
 * TARGET по умолчанию — 'all' (оба поднабора). DRY_RUN по умолчанию 'true'.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import * as schema from "../src/db/schema";

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// vanilla: «нетронутая» home
// ---------------------------------------------------------------------------

/** Канонический сид — читаем ЖИВЬЁМ из пакета, не дублируем содержимое здесь. */
function loadVanillaCanonHome(): Json {
  const raw = readFileSync(
    resolve(__dirname, "../packages/theme-vanilla/pages/home.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Json;
}

/** Типовая последовательность блоков ДО правки — старый минимальный пакетный
 * сид (`Header, Hero, Collections, Gallery, PopularProducts, Footer`), тот,
 * что `buildInitialRevision` клал в БД на создании магазина ДО этой правки. */
const OLD_MINIMAL_SEQUENCE = [
  "Header",
  "Hero",
  "Collections",
  "Gallery",
  "PopularProducts",
  "Footer",
];
const OLD_MINIMAL_IDS = new Set([
  "Header-home",
  "Hero-home",
  "Collections-home",
  "Gallery-home",
  "PopularProducts-home",
  "Footer-home",
]);
/** Демо-плитки старого минимального сида (см. git-историю home.json ДО правки). */
const OLD_MINIMAL_GALLERY_ITEM_IDS = new Set(["item-1", "item-2", "item-3"]);

/** Типовая последовательность бывшего вывода миграции (10 блоков) — если id
 * НЕ совпадают с новой конвенцией `<Тип>-home`, это заморозка старого вывода
 * миграции (Date.now()-id или сама версия миграции ниже 11). */
const MIGRATED_SEQUENCE = [
  "PromoBanner",
  "Header",
  "Hero",
  "Collections",
  "MainText",
  "Video",
  "ImageWithText",
  "PopularProducts",
  "Newsletter",
  "Footer",
];

function blockTypes(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.map((b) => (isPlainObject(b) ? String(b.type ?? "") : ""));
}

function blockIds(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.map((b) =>
    isPlainObject(b) && isPlainObject(b.props) ? String(b.props.id ?? "") : "",
  );
}

/**
 * true → home можно безопасно заменить каноном пакета.
 * false → похоже на правку мерчанта (или незнакомая форма) — пропускаем.
 */
function isUntouchedVanillaHome(pagesData: Json): boolean {
  const home = pagesData["home"];
  if (!isPlainObject(home)) return false;
  const types = blockTypes(home.content);
  const ids = blockIds(home.content);

  // Случай A: старый минимальный сид (никогда не читался через миграцию,
  // либо читался, но НИКОГДА не сохранялся конструктором).
  if (
    types.length === OLD_MINIMAL_SEQUENCE.length &&
    types.every((t, i) => t === OLD_MINIMAL_SEQUENCE[i]) &&
    ids.every((id) => OLD_MINIMAL_IDS.has(id))
  ) {
    const gallery = home.content && (home.content as Json[])[3];
    const items =
      isPlainObject(gallery) &&
      isPlainObject(gallery.props) &&
      Array.isArray(gallery.props.items)
        ? (gallery.props.items as Json[])
        : [];
    const itemIds = items.map((it) => String(it?.id ?? ""));
    // Демо-плитки не подменили — мерчант ничего не трогал.
    if (
      itemIds.length === 0 ||
      itemIds.every((id) => OLD_MINIMAL_GALLERY_ITEM_IDS.has(id))
    ) {
      return true;
    }
    return false;
  }

  // Случай B: заморозка старого вывода миграции — состав блоков совпадает с
  // тем, что печатала migrateVanillaHomePage, но id НЕ по новой конвенции
  // (Date.now()-паттерн: длинный числовой суффикс) ИЛИ в pagesData остался
  // служебный ключ версии миграции (ставился только миграцией, мерчант его
  // никогда не пишет).
  if (
    types.length === MIGRATED_SEQUENCE.length &&
    types.every((t, i) => t === MIGRATED_SEQUENCE[i])
  ) {
    const idsMatchNewConvention = ids.every((id) => id.endsWith("-home"));
    const hasLegacyVersionFlag =
      pagesData["_vanillaHomeMigrationVersion"] !== undefined;
    const hasTimestampId = ids.some((id) => /-\d{10,}$/.test(id));
    if (!idsMatchNewConvention && (hasLegacyVersionFlag || hasTimestampId))
      return true;
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// bloom: буквальный padding {0,0} на Header — тот же тест, что был у
// (удалённой) migrateBloomHeaderPadding.
// ---------------------------------------------------------------------------

function bloomHeaderPaddingFix(pagesData: Json): {
  changed: boolean;
  next: Json;
} {
  let changed = false;
  const out: Json = { ...pagesData };
  for (const pageId of Object.keys(pagesData)) {
    const page = pagesData[pageId];
    if (!isPlainObject(page) || !Array.isArray(page.content)) continue;
    let pageChanged = false;
    const content = (page.content as Json[]).map((block) => {
      if (
        !isPlainObject(block) ||
        block.type !== "Header" ||
        !isPlainObject(block.props)
      )
        return block;
      const padding = block.props.padding;
      if (
        !isPlainObject(padding) ||
        padding.top !== 0 ||
        padding.bottom !== 0
      ) {
        return block;
      }
      pageChanged = true;
      return {
        ...block,
        props: { ...block.props, padding: { top: 16, bottom: 16 } },
      };
    });
    if (pageChanged) {
      out[pageId] = { ...page, content };
      changed = true;
    }
  }
  return { changed, next: out };
}

// ---------------------------------------------------------------------------
// Общий CAS-writer
// ---------------------------------------------------------------------------

interface SiteRow {
  id: string;
  tenant_id: string;
  current_revision_id: string | null;
  revision_data: unknown;
}

async function fetchActiveSites(
  pool: Pool,
  themeId: string,
): Promise<SiteRow[]> {
  const res = await pool.query<SiteRow>(
    `SELECT s.id, s.tenant_id, s.current_revision_id, sr.data AS revision_data
       FROM site s
       JOIN site_revision sr ON sr.id = s.current_revision_id
      WHERE s.deleted_at IS NULL AND s.theme_id = $1`,
    [themeId],
  );
  return res.rows;
}

async function writeReseedRevision(
  pool: Pool,
  site: SiteRow,
  nextData: Json,
): Promise<"applied" | "conflict"> {
  const newId = randomUUID();
  return pool.connect().then(async (client) => {
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO site_revision (id, site_id, data, meta, created_at, created_by)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, now(), $5)`,
        [
          newId,
          site.id,
          JSON.stringify(nextData),
          JSON.stringify({}),
          "reseed-untouched-home-script",
        ],
      );
      const updated = await client.query(
        `UPDATE site SET current_revision_id = $1, updated_at = now()
             WHERE id = $2 AND tenant_id = $3 AND current_revision_id = $4`,
        [newId, site.id, site.tenant_id, site.current_revision_id],
      );
      if (updated.rowCount === 0) {
        await client.query("ROLLBACK");
        return "conflict" as const;
      }
      await client.query("COMMIT");
      return "applied" as const;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
}

async function runVanillaHome(pool: Pool, dryRun: boolean) {
  const canonHome = loadVanillaCanonHome();
  const sites = await fetchActiveSites(pool, "vanilla");
  console.log(`[vanilla-home] active vanilla sites: ${sites.length}`);

  let candidates = 0;
  let applied = 0;
  let conflicts = 0;
  const candidateIds: string[] = [];

  for (const site of sites) {
    const data = isPlainObject(site.revision_data) ? site.revision_data : null;
    const pagesData =
      data && isPlainObject(data.pagesData) ? data.pagesData : null;
    if (!pagesData) continue;
    if (!isUntouchedVanillaHome(pagesData)) continue;
    candidates++;
    candidateIds.push(site.id);
    if (dryRun) continue;

    const nextPagesData: Json = { ...pagesData, home: canonHome };
    delete nextPagesData["_vanillaHomeMigrationVersion"];
    const nextData: Json = { ...(data as Json), pagesData: nextPagesData };
    const result = await writeReseedRevision(pool, site, nextData);
    if (result === "applied") applied++;
    else conflicts++;
  }

  console.log(`[vanilla-home] candidates (untouched home): ${candidates}`);
  if (dryRun) {
    console.log(
      `[vanilla-home] DRY_RUN=true — no writes. siteId список (первые 50):`,
    );
    console.log(candidateIds.slice(0, 50).join("\n"));
  } else {
    console.log(
      `[vanilla-home] applied=${applied} conflicts(skipped, пересохранено конкурентно)=${conflicts}`,
    );
  }
}

async function runBloomHeaderPadding(pool: Pool, dryRun: boolean) {
  const sites = await fetchActiveSites(pool, "bloom");
  console.log(`[bloom-header-padding] active bloom sites: ${sites.length}`);

  let candidates = 0;
  let applied = 0;
  let conflicts = 0;
  const candidateIds: string[] = [];

  for (const site of sites) {
    const data = isPlainObject(site.revision_data) ? site.revision_data : null;
    const pagesData =
      data && isPlainObject(data.pagesData) ? data.pagesData : null;
    if (!pagesData) continue;
    const { changed, next } = bloomHeaderPaddingFix(pagesData);
    if (!changed) continue;
    candidates++;
    candidateIds.push(site.id);
    if (dryRun) continue;

    const nextData: Json = { ...(data as Json), pagesData: next };
    const result = await writeReseedRevision(pool, site, nextData);
    if (result === "applied") applied++;
    else conflicts++;
  }

  console.log(
    `[bloom-header-padding] candidates (padding {0,0} где-то в ревизии): ${candidates}`,
  );
  if (dryRun) {
    console.log(
      `[bloom-header-padding] DRY_RUN=true — no writes. siteId список (первые 50):`,
    );
    console.log(candidateIds.slice(0, 50).join("\n"));
  } else {
    console.log(
      `[bloom-header-padding] applied=${applied} conflicts(skipped, пересохранено конкурентно)=${conflicts}`,
    );
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const dryRun = process.env.DRY_RUN !== "false";
  const target = (process.env.TARGET ?? "all") as
    | "vanilla-home"
    | "bloom-header-padding"
    | "all";
  console.log(
    `[reseed-untouched-home] DATABASE_URL set, DRY_RUN=${dryRun}, TARGET=${target}`,
  );

  const pool = new Pool({ connectionString: url });
  // drizzle+schema только для типов/консистентности со стилем соседних
  // скриптов (backfill-theme-colorschemes.ts) — сама запись идёт через
  // raw SQL в транзакции (см. writeReseedRevision), CAS-условие точнее
  // выразить прямым UPDATE ... WHERE current_revision_id = $4.
  void drizzle(pool, { schema });

  if (target === "vanilla-home" || target === "all") {
    await runVanillaHome(pool, dryRun);
  }
  if (target === "bloom-header-padding" || target === "all") {
    await runBloomHeaderPadding(pool, dryRun);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[reseed-untouched-home] failed:", err);
  process.exit(1);
});
