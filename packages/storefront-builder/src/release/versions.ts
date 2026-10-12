import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseChangelog } from '@merfy/storefront-build';
import type { ObjectStore } from '@merfy/storefront-storage';
import { parseTheme, parseTokenMigrations } from '@merfy/tokens';
import { z } from 'zod';
import { downloadRenderer, rendererFiles } from '../renderer-archive';
import type { Queryable } from '../shop-state';
import { revisionKeySql } from '../snapshot';
import type { ShopEdits, VersionFiles } from './dry-run';

// Версии темы для сухого прогона — из архивов рисовальщиков в MinIO (задача 3): ровно то, что рисует сборщик.
const themeFileSchema = z.object({ version: z.string(), tokens: z.unknown() });
const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'));

export async function versionFiles(
  store: ObjectStore,
  themeId: string,
  version: string,
  workDir: string,
): Promise<VersionFiles> {
  const dir = await mkdtemp(join(workDir, `${themeId}-${version}-`));
  await downloadRenderer(store, themeId, version, dir);
  const files = rendererFiles(dir);
  const theme = themeFileSchema.parse(await readJson(files.themeJson));
  return {
    version,
    theme: parseTheme(theme.tokens),
    migrations: parseTokenMigrations(await readJson(files.migrationsJson)),
    changelog: parseChangelog(await readJson(files.changelogJson)),
  };
}

const SHOPS_SQL = `SELECT s.id, ${revisionKeySql('tokens')} AS tokens FROM site s
  LEFT JOIN site_revision r ON r.id = s.current_revision_id
  WHERE s.theme_id = $1 AND s.status = 'published' AND s.deleted_at IS NULL ORDER BY s.id`;
const shopRow = z.object({ id: z.string(), tokens: z.unknown() });

// Опубликованные магазины темы на контуре и правки токенов их текущей ревизии (блок 8). Снятые с публикации в выпуск
// не входят: когда их опубликуют, первая сборка закрепит их выпущенной версией.
export async function themeShops(db: Queryable, themeId: string): Promise<ShopEdits[]> {
  const { rows } = await db.query(SHOPS_SQL, [themeId]);
  return rows.map((row) => shopRow.parse(row)).map((row) => ({ siteId: row.id, tokens: row.tokens }));
}

// Версия темы в рабочей копии — та, что выпускаем (её записал pnpm theme-version, архив выложил сборщик).
export async function repoVersion(root: string, themeId: string): Promise<string> {
  const file = join(root, 'packages', `theme-${themeId}`, 'theme.json');
  return themeFileSchema.parse(await readJson(file)).version;
}
