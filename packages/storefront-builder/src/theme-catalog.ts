import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import type { ThemeState } from '@merfy/storefront-build';
import type { ObjectStore } from '@merfy/storefront-storage';
import { z } from 'zod';
import type { LoadedTheme } from './build-job';
import type { Log } from './log';
import { downloadRenderer, readRendererIndex, rendererFiles } from './renderer-archive';
import type { Queryable } from './shop-state';
import type { PreviewTheme } from './stand-preview';
import { loadThemeFrom, type ThemeOptions } from './themes';

// Версии тем магазинов (design.md блока 10, П10-1 Б): магазин рисуется версией своего закрепления site.theme_version.
// Версия образа сборщика уже загружена (themes.ts); прошлая — архив из хранилища (renderer-archive.ts), распакованный и
// запущенный один раз на процесс. Модуль Node не выгружается: загруженная версия живёт до перезапуска сборщика.

export interface ThemePins {
  // Отпечаток версии темы: версия образа или строка записи рисовальщиков. Версии нет — null.
  stateOf(themeId: string, version: string): Promise<ThemeState | null>;
  // Выпущенная версия темы: её получает пустое закрепление.
  released(themeId: string): Promise<string>;
}

export interface LoadedVersion {
  theme: LoadedTheme;
  preview: PreviewTheme;
  close: () => Promise<void>;
}

export interface ThemeCatalog extends ThemePins {
  themeAt(themeId: string, version: string): Promise<LoadedTheme>;
  previewAt(themeId: string, version: string): Promise<PreviewTheme>;
  close(): Promise<void>;
}

type Recorded = Readonly<Record<string, { contentHash: string }>>;

export interface CatalogDeps {
  current: ReadonlyMap<string, LoadedTheme>;
  previews: ReadonlyMap<string, PreviewTheme>;
  index: (themeId: string) => Promise<Recorded>;
  load: (themeId: string, version: string) => Promise<LoadedVersion>;
  released: (themeId: string) => Promise<string>;
  log: Log;
}

const keyOf = (themeId: string, version: string): string => `${themeId}@${version}`;

// Состояние каталога: загрузки прошлых версий и кэш записей версий — на процесс.
interface CatalogState {
  deps: CatalogDeps;
  loading: Map<string, Promise<LoadedVersion>>;
  indexes: Map<string, Recorded>;
}

const currentOf = (deps: CatalogDeps, themeId: string, version: string): LoadedTheme | undefined => {
  const theme = deps.current.get(themeId);
  return theme?.version === version ? theme : undefined;
};

// Запись версий — из кэша; промах — перечитать: новые версии появляются, отпечаток версии не меняется никогда.
async function recorded(
  state: CatalogState,
  themeId: string,
  version: string,
): Promise<{ contentHash: string } | undefined> {
  const cached = state.indexes.get(themeId)?.[version];
  if (cached !== undefined) return cached;
  const fresh = await state.deps.index(themeId);
  state.indexes.set(themeId, fresh);
  return fresh[version];
}

function versionOf(state: CatalogState, themeId: string, version: string): Promise<LoadedVersion> {
  const key = keyOf(themeId, version);
  const known = state.loading.get(key);
  if (known !== undefined) return known;
  const started = state.deps.load(themeId, version).catch((error: unknown) => {
    state.loading.delete(key);
    throw error;
  });
  state.loading.set(key, started);
  return started;
}

async function versionState(state: CatalogState, themeId: string, version: string): Promise<ThemeState | null> {
  const current = currentOf(state.deps, themeId, version);
  if (current !== undefined) return { version, contentHash: current.contentHash };
  if (!state.deps.current.has(themeId)) return null;
  const entry = await recorded(state, themeId, version);
  return entry === undefined ? null : { version, contentHash: entry.contentHash };
}

export function createThemeCatalog(deps: CatalogDeps): ThemeCatalog {
  const state: CatalogState = { deps, loading: new Map(), indexes: new Map() };
  return {
    released: (themeId) => deps.released(themeId),
    stateOf: (themeId, version) => versionState(state, themeId, version),
    async themeAt(themeId, version) {
      return currentOf(deps, themeId, version) ?? (await versionOf(state, themeId, version)).theme;
    },
    async previewAt(themeId, version) {
      const preview = currentOf(deps, themeId, version) === undefined ? undefined : deps.previews.get(themeId);
      return preview ?? (await versionOf(state, themeId, version)).preview;
    },
    async close() {
      const settled = await Promise.allSettled(state.loading.values());
      await Promise.all(settled.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value.close()] : [])));
    },
  };
}

// Прошлая версия из хранилища: скачать архив, распаковать в свою папку, запустить рисовальщик. options — как у
// loadThemes: со страницей стенда (STOREFRONT_STAND_PAGE) стенд в сборке идёт и у прошлых версий, от их рисовальщика.
export function archiveLoader(
  root: string,
  store: ObjectStore,
  cacheDir: string,
  log: Log,
  options: ThemeOptions = { standPage: false },
) {
  return async (themeId: string, version: string): Promise<LoadedVersion> => {
    const startedAt = Date.now();
    const dir = await mkdtemp(join(cacheDir, `${themeId}-${version}-`));
    const state = await downloadRenderer(store, themeId, version, join(dir, 'renderer'));
    const loaded = await loadThemeFrom(root, rendererFiles(join(dir, 'renderer')), state, options);
    const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    log('renderer-loaded', { themeId, version, ms: Date.now() - startedAt, rssMb });
    return { theme: loaded.theme, preview: loaded.preview, close: () => loaded.renderer.close() };
  };
}

export const recordedVersions = async (store: ObjectStore, themeId: string): Promise<Recorded> =>
  (await readRendererIndex(store, themeId)).versions;

const PIN_SQL = 'SELECT theme_id, theme_version FROM site WHERE id = $1 AND deleted_at IS NULL';
const PIN_WRITE_SQL = 'UPDATE site SET theme_version = $2 WHERE id = $1 AND theme_version IS NOT DISTINCT FROM $3';
const pinRowSchema = z.object({ theme_id: z.string().nullable(), theme_version: z.string().nullable() });

export interface PinDeps {
  db: Queryable;
  pins: ThemePins;
  themeIds: readonly string[];
  log: Log;
}

// Закрепление перед сборкой: пустое или на версии, которой у темы нет (магазин сменил тему), — выпущенной версией.
// Запись условная: выпуск, закрепивший магазин раньше, не затирается.
export async function pinShop(deps: PinDeps, siteId: string): Promise<void> {
  const row = (await deps.db.query(PIN_SQL, [siteId])).rows.map((value) => pinRowSchema.parse(value)).at(0);
  if (row === undefined || row.theme_id === null) return;
  if (!deps.themeIds.includes(row.theme_id)) return;
  const pinned = row.theme_version;
  if (pinned !== null && (await deps.pins.stateOf(row.theme_id, pinned)) !== null) return;
  const version = await deps.pins.released(row.theme_id);
  await deps.db.query(PIN_WRITE_SQL, [siteId, version, pinned]);
  deps.log(pinned === null ? 'theme-pinned' : 'pin-reset', { shopId: siteId, version, was: pinned });
}
