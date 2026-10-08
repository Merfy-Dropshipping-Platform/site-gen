import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checkThemeVersion,
  readClientFiles,
  readThemeState,
  readThemeVersions,
  startRenderer,
  type Renderer,
  type ThemeVersions,
} from '@merfy/storefront-build';
import { parseTheme } from '@merfy/tokens';
import { z } from 'zod';
import type { LoadedTheme } from './build-job';
import { StorefrontBuilderError } from './errors';

// Темы новой архитектуры (design.md блока 6, раздел 4, «Старые пути»): те, что записаны в theme-versions.json пакета
// блока 4. Для каждой — серверная сборка рисовальщика в themes/<тема>/dist-renderer (собирает `pnpm renderer` этого
// пакета, в образе — Dockerfile), версия и отпечаток файлов темы и её токены. Файлы темы изменились, а версия та же, —
// сборщик не стартует (сторож версии блока 4).

export const THEME_VERSIONS_FILE = 'packages/storefront-build/theme-versions.json';
export const rendererDir = (root: string, themeId: string): string => join(root, 'themes', themeId, 'dist-renderer');

const themeFileSchema = z.object({ tokens: z.unknown() });

export interface Themes {
  themes: ReadonlyMap<string, LoadedTheme>;
  close: () => Promise<void>;
}

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

async function loadTheme(root: string, themeId: string, recorded: ThemeVersions) {
  const state = await readThemeState(root, themeId);
  checkThemeVersion(themeId, recorded[themeId], state);
  const renderer = await startRenderer(await serverEntry(root, themeId));
  const themeJson = await readFile(join(root, 'packages', `theme-${themeId}`, 'theme.json'), 'utf8');
  const tokens = parseTheme(themeFileSchema.parse(JSON.parse(themeJson)).tokens);
  const clientFiles = await readClientFiles(join(rendererDir(root, themeId), 'client'));
  const theme: LoadedTheme = { ...state, build: { tokens, render: renderer.render, clientFiles } };
  return { theme, renderer };
}

export async function themeIdsOf(root: string): Promise<string[]> {
  return Object.keys(await readThemeVersions(join(root, THEME_VERSIONS_FILE))).sort();
}

export async function loadThemes(root: string): Promise<Themes> {
  const recorded = await readThemeVersions(join(root, THEME_VERSIONS_FILE));
  const themes = new Map<string, LoadedTheme>();
  const renderers: Renderer[] = [];
  for (const themeId of Object.keys(recorded).sort()) {
    const loaded = await loadTheme(root, themeId, recorded);
    themes.set(themeId, loaded.theme);
    renderers.push(loaded.renderer);
  }
  return { themes, close: async () => void (await Promise.all(renderers.map((renderer) => renderer.close()))) };
}
