import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ThemeState } from '@merfy/storefront-build';
import {
  readObject,
  rendererArchiveKey,
  rendererIndexKey,
  updateObject,
  type Decision,
  type ObjectStore,
} from '@merfy/storefront-storage';
import { z } from 'zod';
import { StorefrontBuilderError } from './errors';
import type { Log } from './log';
import { rendererDir } from './themes';

// Рисовальщик версии темы — архивом в MinIO (design.md блока 10, П10-1 Б; проба — задача 1). Сборщик при старте кладёт
// архив своей версии и строку в запись версий темы; магазин, закреплённый на прошлой версии, рисуется распакованным
// архивом (theme-catalog.ts). Одна версия — один отпечаток: иначе отказ старта, а не перезапись.

const run = promisify(execFile);
export const ARCHIVE_TYPE = 'application/gzip';
const PACKAGE_FILES = ['theme.json', 'migrations.json', 'changelog.json'] as const;
const HASH = /^sha256:[0-9a-f]{64}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const entrySchema = z.strictObject({
  contentHash: z.string().regex(HASH),
  bytes: z.int().positive(),
  uploadedAt: z.string().min(1),
});
const indexSchema = z.strictObject({
  v: z.literal(1),
  theme: z.string().min(1),
  versions: z.record(z.string().regex(VERSION), entrySchema),
});
const versionFileSchema = z.strictObject({ id: z.string(), version: z.string(), contentHash: z.string() });

export type RendererIndex = z.infer<typeof indexSchema>;
export type RendererIndexEntry = z.infer<typeof entrySchema>;
type IndexOutcome = 'added' | 'present';
type VersionOf = ThemeState & { id: string };

export interface RendererFiles {
  serverEntry: string;
  clientDir: string;
  themeJson: string;
  migrationsJson: string;
  changelogJson: string;
}

export interface ArchiveDeps {
  store: ObjectStore;
  log: Log;
  clock: () => Date;
}

export const emptyIndex = (themeId: string): RendererIndex => ({ v: 1, theme: themeId, versions: {} });

export function parseRendererIndex(value: unknown, key: string): RendererIndex {
  const parsed = indexSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new StorefrontBuilderError('renderer-archive', 'запись версий рисовальщика не по схеме', { path: key });
}

const conflict = (themeId: string, version: string): StorefrontBuilderError =>
  new StorefrontBuilderError('renderer-archive', `версия ${version} уже записана с другим отпечатком`, {
    path: rendererIndexKey(themeId),
  });

// Запись версий: новой версии нет — добавить; та же версия с тем же отпечатком — не трогать; с другим — отказ.
export function indexDecision(
  current: RendererIndex | null,
  themeId: string,
  state: ThemeState,
  entry: RendererIndexEntry,
): Decision<RendererIndex, IndexOutcome> {
  const index = current ?? emptyIndex(themeId);
  const recorded = index.versions[state.version];
  if (recorded === undefined)
    return { outcome: 'added', next: { ...index, versions: { ...index.versions, [state.version]: entry } } };
  if (recorded.contentHash === state.contentHash) return { outcome: 'present', next: null };
  throw conflict(themeId, state.version);
}

export const rendererFiles = (dir: string): RendererFiles => ({
  serverEntry: join(dir, 'server', 'entry.mjs'),
  clientDir: join(dir, 'client'),
  themeJson: join(dir, 'theme.json'),
  migrationsJson: join(dir, 'migrations.json'),
  changelogJson: join(dir, 'changelog.json'),
});

// Папка архива: серверная сборка темы, файлы её пакета и version.json.
async function stage(root: string, themeId: string, state: ThemeState, dir: string): Promise<void> {
  await cp(rendererDir(root, themeId), dir, { recursive: true });
  const packageDir = join(root, 'packages', `theme-${themeId}`);
  await Promise.all(PACKAGE_FILES.map((file) => copyFile(join(packageDir, file), join(dir, file))));
  await writeFile(join(dir, 'version.json'), JSON.stringify({ id: themeId, ...state }));
}

export async function packRenderer(root: string, themeId: string, state: ThemeState): Promise<Uint8Array> {
  const work = await mkdtemp(join(tmpdir(), `renderer-${themeId}-`));
  try {
    await stage(root, themeId, state, join(work, 'stage'));
    await run('tar', ['-czf', join(work, 'renderer.tar.gz'), '-C', join(work, 'stage'), '.']);
    return new Uint8Array(await readFile(join(work, 'renderer.tar.gz')));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

const sameVersion = (file: z.infer<typeof versionFileSchema>, expected: VersionOf): boolean =>
  file.id === expected.id && file.version === expected.version && file.contentHash === expected.contentHash;

export async function unpackRenderer(body: Uint8Array, dir: string, expected: VersionOf): Promise<void> {
  await mkdir(dir, { recursive: true });
  const archive = `${dir}.tar.gz`;
  await writeFile(archive, body);
  await run('tar', ['-xzf', archive, '-C', dir]);
  await rm(archive, { force: true });
  const file = versionFileSchema.parse(JSON.parse(await readFile(join(dir, 'version.json'), 'utf8')));
  if (!sameVersion(file, expected))
    throw new StorefrontBuilderError('renderer-archive', 'архив рисовальщика — не той версии', { path: dir });
}

export async function readRendererIndex(store: ObjectStore, themeId: string): Promise<RendererIndex> {
  const found = await readObject(store, rendererIndexKey(themeId), parseRendererIndex);
  return found?.value ?? emptyIndex(themeId);
}

// Старт сборщика: архив своей версии — в хранилище, строка — в запись версий. Уже есть — ничего не делаем.
export async function ensureRendererArchive(
  deps: ArchiveDeps,
  root: string,
  themeId: string,
  state: ThemeState,
): Promise<IndexOutcome> {
  const key = rendererArchiveKey(themeId, state.contentHash);
  const recorded = (await readRendererIndex(deps.store, themeId)).versions[state.version];
  if (recorded !== undefined && recorded.contentHash !== state.contentHash) throw conflict(themeId, state.version);
  if (recorded !== undefined && (await deps.store.has(key))) return 'present';
  const body = await packRenderer(root, themeId, state);
  await deps.store.write(key, body, { contentType: ARCHIVE_TYPE, condition: { ifNoneMatch: '*' } });
  const entry = { contentHash: state.contentHash, bytes: body.byteLength, uploadedAt: deps.clock().toISOString() };
  const decide = (index: RendererIndex | null) => indexDecision(index, themeId, state, entry);
  const { outcome } = await updateObject(deps.store, rendererIndexKey(themeId), parseRendererIndex, decide);
  deps.log('renderer-archive', { themeId, version: state.version, outcome, bytes: body.byteLength });
  return outcome;
}

// Рисовальщик прошлой версии — в папку dir. Версии нет в записи или архива нет — ошибка renderer-archive.
export async function downloadRenderer(
  store: ObjectStore,
  themeId: string,
  version: string,
  dir: string,
): Promise<ThemeState> {
  const entry = (await readRendererIndex(store, themeId)).versions[version];
  if (entry === undefined)
    throw new StorefrontBuilderError('renderer-archive', `версии ${version} нет в записи рисовальщиков`, {
      path: rendererIndexKey(themeId),
    });
  const key = rendererArchiveKey(themeId, entry.contentHash);
  const archive = await store.read(key);
  if (archive === null) throw new StorefrontBuilderError('renderer-archive', 'архива рисовальщика нет', { path: key });
  const state = { version, contentHash: entry.contentHash };
  await unpackRenderer(archive.body, dir, { id: themeId, ...state });
  return state;
}
