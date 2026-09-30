/**
 * Канон темы — стартовый документ для новой ревизии (без базы данных и без
 * привязки к конкретному магазину). Раньше жил в `sites.service.ts`
 * (`buildInitialRevision`/`getDefaultContent`); переехал в модуль ревизий
 * (R1, `merfy-mcp/docs/plans/2026-09-30-revisions-clean.md`) — тот же
 * источник, что у создания магазина, саги рождения (`store/lifecycle/`) и
 * смены темы (`store/theme-switch/`).
 *
 * Логика не меняется: PageResolver для тем с полным Puck-манифестом (ровно
 * одна страница `isHome`), иначе легаси-сид из `generator/templates/defaults`.
 */
import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { getPageResolver } from "../themes/page-resolver-instance";
import { getThemeManifest } from "../themes/theme-manifest-loader";

const USE_PAGE_RESOLVER = process.env.USE_PAGE_RESOLVER !== "false";

const logger = new Logger("StoreContentCanon");

/**
 * Легаси-сид из JSON темы. Файл не найден — фолбэк на rose.json.
 *
 * Путь считается от ЭТОГО файла: `src/content/canon.ts` лежит на уровень
 * глубже, чем прежний `src/sites.service.ts`, — отсюда `".."` перед
 * `generator/templates/defaults`. В докер-сборке ровно этот каталог
 * докладывается поверх `dist` (см. Dockerfile: `COPY … src/generator/
 * templates/defaults ./dist/src/generator/templates/defaults`).
 */
export function legacySeed(theme?: string): Record<string, unknown> | null {
  const themeName = theme || "rose";
  const defaultsDir = path.join(
    __dirname,
    "..",
    "generator",
    "templates",
    "defaults",
  );
  let filePath = path.join(defaultsDir, `${themeName}.json`);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(defaultsDir, "rose.json");
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    logger.warn(
      `Failed to load default content for theme "${themeName}": ${e instanceof Error ? e.message : e}`,
    );
    return null;
  }
}

/**
 * Канон темы: полный документ для новой ревизии (создание магазина, сага
 * рождения, смена темы). Resolver-путь — только для тем с ПОЛНЫМ
 * Puck-манифестом (ровно одна страница `isHome`, сейчас — только rose): темы
 * с ЧАСТИЧНЫМ `manifest.pages` (flux/bloom/satin/vanilla — только системные
 * catalog/collection для превью-секций, без home/about/…) взяли бы `pages[0]`
 * за «домашнюю» и создали бы магазин без home-контента, поэтому для них —
 * легаси-сид (`legacySeed`), который несёт home. `normalizeRevision`
 * (шаг `load`) всё равно домёрджит системные страницы манифеста поверх уже
 * существующей ревизии.
 */
export async function buildThemeCanon(
  themeId: string,
): Promise<Record<string, unknown> | null> {
  if (!USE_PAGE_RESOLVER) return legacySeed(themeId);

  const manifest = getThemeManifest(themeId) as
    | { pages?: Array<{ isHome?: boolean }> }
    | null;
  const manifestPages = Array.isArray(manifest?.pages) ? manifest!.pages : [];
  const hasHomePage = manifestPages.some((p) => p?.isHome === true);
  if (!hasHomePage) return legacySeed(themeId);

  try {
    const revision = await getPageResolver(themeId).buildInitialRevision();
    return revision as unknown as Record<string, unknown>;
  } catch (e) {
    logger.warn(
      `buildInitialRevision failed for ${themeId}, falling back to legacy seed: ${e}`,
    );
    return legacySeed(themeId);
  }
}
