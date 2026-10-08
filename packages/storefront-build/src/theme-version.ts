import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { hashSchema } from './canonical';
import { contentHash } from './content-hash';
import { StorefrontBuildError } from './errors';
import { versionSchema } from './inputs';
import { parseWith } from './parse';
import { themeRenderFiles } from './render-files';

// Версия темы и отпечаток её файлов (design.md блока 4, В4-1 В): номер — единица выпуска для людей и волн, отпечаток —
// в ключе сборки. Пара «номер → отпечаток» каждой новой темы записана в theme-versions.json пакета. Файлы темы
// изменились, а номер нет, — сторож краснеет.

export interface ThemeState {
  version: string;
  contentHash: string;
}

// ok — запись сходится с файлами; record — этой версии в записи нет, её пишет команда theme-version; stale — файлы
// изменились, а номер тот же.
export type ThemeVersionStatus = 'ok' | 'record' | 'stale';

const themeStateSchema = z.strictObject({ version: versionSchema, contentHash: hashSchema });
const themeVersionsSchema = z.record(z.string(), themeStateSchema);
// В theme.json пакета темы есть и другие поля — имя, токены; здесь нужен только номер.
const themeFileSchema = z.object({ version: versionSchema });

export type ThemeVersions = z.infer<typeof themeVersionsSchema>;

export function themeVersionStatus(recorded: ThemeState | undefined, current: ThemeState): ThemeVersionStatus {
  if (recorded === undefined || recorded.version !== current.version) return 'record';
  return recorded.contentHash === current.contentHash ? 'ok' : 'stale';
}

type VersionText = (themeId: string, version: string) => string;

// Что делать, если запись не сходится с файлами: текст сторожа и команды theme-version.
export const THEME_VERSION_TEXT: Record<Exclude<ThemeVersionStatus, 'ok'>, VersionText> = {
  record: (themeId, version) => `версия ${version} темы ${themeId} не записана: pnpm theme-version ${themeId}`,
  stale: (themeId, version) =>
    `файлы темы ${themeId} изменились, а версия ${version} та же: подними version в packages/theme-${themeId}/theme.json, потом pnpm theme-version ${themeId}`,
};

export function checkThemeVersion(themeId: string, recorded: ThemeState | undefined, current: ThemeState): void {
  const status = themeVersionStatus(recorded, current);
  if (status === 'ok') return;
  throw new StorefrontBuildError('theme-version-stale', THEME_VERSION_TEXT[status](themeId, current.version));
}

export const parseThemeVersions = (raw: unknown): ThemeVersions =>
  parseWith(themeVersionsSchema, raw, 'theme-version-stale');

export async function readThemeVersions(file: string): Promise<ThemeVersions> {
  return parseThemeVersions(JSON.parse(await readFile(file, 'utf8')));
}

// Тема на диске сейчас: номер из theme.json пакета темы и отпечаток её файлов.
export async function readThemeState(root: string, themeId: string): Promise<ThemeState> {
  const themeFile = join(root, 'packages', `theme-${themeId}`, 'theme.json');
  const { version } = parseWith(themeFileSchema, JSON.parse(await readFile(themeFile, 'utf8')), 'theme-version-stale');
  return { version, contentHash: await contentHash(root, themeRenderFiles(themeId)) };
}
