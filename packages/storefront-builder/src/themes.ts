import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkThemeVersion,
  readClientFiles,
  readThemeState,
  readThemeVersions,
  startRenderer,
  type BuildFile,
  type Renderer,
  type ThemeState,
  type ThemeVersions,
} from '@merfy/storefront-build';
import { panelForTheme, parsePanel, parseTheme, parseTokenMigrations } from '@merfy/tokens';
import type { RendererFiles } from './renderer-archive';
import { z } from 'zod';
import type { LoadedTheme } from './build-job';
import { StorefrontBuilderError } from './errors';
import type { Assets } from './inline-assets';
import type { PreviewTheme } from './stand-preview';

// Темы новой архитектуры (design.md блока 6, раздел 4, «Старые пути»): те, что записаны в theme-versions.json пакета
// блока 4. Для каждой — серверная сборка рисовальщика в themes/<тема>/dist-renderer (собирает `pnpm renderer` этого
// пакета, в образе — Dockerfile), версия и отпечаток файлов темы и её токены. Файлы темы изменились, а версия та же, —
// сборщик не стартует (сторож версии блока 4).

export const THEME_VERSIONS_FILE = 'packages/storefront-build/theme-versions.json';
export const rendererDir = (root: string, themeId: string): string => join(root, 'themes', themeId, 'dist-renderer');

const themeFileSchema = z.object({ tokens: z.unknown(), panel: z.unknown().optional() });
// Схема панели «Настроек темы» платформы (блок 8); тема скрывает ненужные поля в theme.json → panel.
export const PANEL_FILE = 'packages/theme-contract/panel/theme-panel.json';

export interface Themes {
  themes: ReadonlyMap<string, LoadedTheme>;
  // Те же темы для превью конструктора (блок 8): стенд, схема панели, файлы клиента по адресу.
  previews: ReadonlyMap<string, PreviewTheme>;
  close: () => Promise<void>;
}

export interface ThemeOptions {
  // Страница стенда в сборке магазина (STOREFRONT_STAND_PAGE, шаг 7 блока 9): сборка темы получает стенд.
  standPage: boolean;
}

const NO_STAND_PAGE: ThemeOptions = { standPage: false };

async function serverEntry(root: string, themeId: string): Promise<string> {
  const entry = join(rendererDir(root, themeId), 'server', 'entry.mjs');
  try {
    await access(entry);
    return entry;
  } catch (error) {
    const text = 'нет серверной сборки рисовальщика: pnpm --filter @merfy/storefront-builder renderer';
    throw new StorefrontBuilderError('renderer-missing', text, { path: entry, cause: error });
  }
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));

// Файлы клиента по адресу от корня сайта — для превью одним HTML (inline-assets.ts).
const assetsOf = (files: readonly BuildFile[]): Assets => new Map(files.map((file) => [`/${file.path}`, file.content]));

// Тема из папки (блок 10): серверная сборка, файлы клиента, theme.json и шаги перевода правок. Папка — тема в образе
// сборщика или распакованный архив прошлой версии (theme-catalog.ts). Схема панели — платформы, из образа. Страница
// стенда в сборке (STOREFRONT_STAND_PAGE) идёт от рисовальщика этой же версии: `renderStand` берётся у него.
export async function loadThemeFrom(root: string, files: RendererFiles, state: ThemeState, options: ThemeOptions) {
  const renderer = await startRenderer(files.serverEntry);
  const themeJson = themeFileSchema.parse(await readJson(files.themeJson));
  const tokens = parseTheme(themeJson.tokens);
  const migrations = parseTokenMigrations(await readJson(files.migrationsJson));
  const panel = panelForTheme(parsePanel(await readJson(join(root, PANEL_FILE)), tokens.dictionary), themeJson.panel);
  const clientFiles = await readClientFiles(files.clientDir);
  const stand = options.standPage ? { stand: { tokens, panel, renderStand: renderer.renderStand } } : {};
  const build = { tokens, render: renderer.render, clientFiles, migrations, ...stand };
  const theme: LoadedTheme = { ...state, build };
  const preview: PreviewTheme = {
    version: state.version,
    themeTokens: themeJson.tokens,
    tokens,
    panel,
    renderStand: renderer.renderStand,
    assets: assetsOf(clientFiles),
    migrations,
  };
  return { theme, preview, renderer };
}

// Файлы темы в образе: серверная сборка из themes/<тема>/dist-renderer, данные — из пакета packages/theme-<тема>.
async function repoFiles(root: string, themeId: string): Promise<RendererFiles> {
  const packageDir = join(root, 'packages', `theme-${themeId}`);
  return {
    serverEntry: await serverEntry(root, themeId),
    clientDir: join(rendererDir(root, themeId), 'client'),
    themeJson: join(packageDir, 'theme.json'),
    migrationsJson: join(packageDir, 'migrations.json'),
    changelogJson: join(packageDir, 'changelog.json'),
  };
}

async function loadTheme(root: string, themeId: string, recorded: ThemeVersions, options: ThemeOptions) {
  const state = await readThemeState(root, themeId);
  checkThemeVersion(themeId, recorded[themeId], state);
  return loadThemeFrom(root, await repoFiles(root, themeId), state, options);
}

export async function themeIdsOf(root: string): Promise<string[]> {
  return Object.keys(await readThemeVersions(join(root, THEME_VERSIONS_FILE))).sort();
}

export async function loadThemes(root: string, options: ThemeOptions = NO_STAND_PAGE): Promise<Themes> {
  const recorded = await readThemeVersions(join(root, THEME_VERSIONS_FILE));
  const themes = new Map<string, LoadedTheme>();
  const previews = new Map<string, PreviewTheme>();
  const renderers: Renderer[] = [];
  for (const themeId of Object.keys(recorded).sort()) {
    const loaded = await loadTheme(root, themeId, recorded, options);
    themes.set(themeId, loaded.theme);
    previews.set(themeId, loaded.preview);
    renderers.push(loaded.renderer);
  }
  const close = async () => void (await Promise.all(renderers.map((renderer) => renderer.close())));
  return { themes, previews, close };
}
