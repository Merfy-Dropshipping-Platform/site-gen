import { join } from 'node:path';
import { hashOf } from '@merfy/storefront-build';
import { z } from 'zod';
import type { SectionFiles } from '../format';
import type { LibraryHistory, LibraryVersion } from '../library-history';
import { listSectionFolders, readSectionFolder } from '../read-folder';
import { LIBRARY_DIRS, nameOf } from './library-index';

// История библиотеки (library-history.ts) для pnpm generate: прежний файл + версии папок из git + текущие файлы папок.
// Файл только пополняется: записи не удаляются и не переименовываются, номер новой версии — следующий за наибольшим у
// секции. Сжатый или неполный клон git историю не урезает — недостающее берётся из файла.
export const LIBRARY_HISTORY_PATH = 'generated/library-history.json';

const historySchema = z.record(z.string(), z.object({ name: z.string().min(1), version: z.number().int().positive() }));

// Прочитать файл истории; не по форме — ошибка: молча начать с пустой нельзя, файл только пополняется.
export const parseLibraryHistory = (text: string): LibraryHistory => historySchema.parse(JSON.parse(text));

// Версии папки секции, новые первыми — gitSectionVersions.
export type VersionsOf = (folder: string) => Promise<SectionFiles[]>;

interface Lineage {
  name: string;
  hashes: readonly string[]; // от самой старой версии к текущей
}

async function lineageOf(folder: string, versionsOf: VersionsOf): Promise<Lineage | null> {
  const current = await readSectionFolder(folder);
  const name = nameOf(current);
  if (name === undefined) return null;
  const past = (await versionsOf(folder)).map((files) => hashOf(files)).reverse();
  return { name, hashes: [...past, hashOf(current)] };
}

const lastVersionOf = (history: LibraryHistory, name: string): number =>
  Object.values(history)
    .filter((entry) => entry.name === name)
    .reduce((last, entry) => Math.max(last, entry.version), 0);

// Новые отпечатки секции — в конец, по порядку появления; известный (под любым именем) пропускается.
export function addLineage(history: LibraryHistory, lineage: Lineage): LibraryHistory {
  const fresh = [...new Set(lineage.hashes)].filter((hash) => !Object.hasOwn(history, hash));
  const last = lastVersionOf(history, lineage.name);
  const added = fresh.map((hash, index): [string, LibraryVersion] => [
    hash,
    { name: lineage.name, version: last + index + 1 },
  ]);
  return { ...history, ...Object.fromEntries(added) };
}

export async function libraryHistoryOf(
  packageDir: string,
  previous: LibraryHistory,
  versionsOf: VersionsOf,
): Promise<LibraryHistory> {
  const folders = (await Promise.all(LIBRARY_DIRS.map((root) => listSectionFolders(join(packageDir, root))))).flat();
  const lineages = await Promise.all(folders.map((folder) => lineageOf(folder, versionsOf)));
  return lineages.reduce<LibraryHistory>(
    (history, lineage) => (lineage === null ? history : addLineage(history, lineage)),
    previous,
  );
}

function byNameAndVersion(left: LibraryVersion, right: LibraryVersion): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.version - right.version;
}

// Файл generated/library-history.json: одна запись на строку, по имени секции и номеру версии — правка одной секции не
// сдвигает соседние строки.
export function libraryHistoryText(history: LibraryHistory): string {
  const rows = Object.entries(history)
    .sort(([, left], [, right]) => byNameAndVersion(left, right))
    .map(([hash, entry]) => `  ${JSON.stringify(hash)}: ${JSON.stringify(entry)}`);
  return `{\n${rows.join(',\n')}\n}\n`;
}
