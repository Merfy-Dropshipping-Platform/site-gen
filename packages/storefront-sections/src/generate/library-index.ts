import { join } from 'node:path';
import type { SectionFiles } from '../format';
import { libraryKeyOf, type LibraryIndex } from '../library-copy';
import { listSectionFolders, readSectionFolder } from '../read-folder';

// Отпечатки библиотечных секций для проверки «копия без изменений» (library-copy.ts): секции магазина из fixtures/shop и
// секции оболочки из storefront-shell/sections. Имя — name из section.json. Пишет pnpm generate в
// generated/library-index.json; тест расхождения строит то же и сравнивает с файлом.
export const LIBRARY_DIRS: readonly string[] = ['fixtures/shop', '../storefront-shell/sections'];
export const LIBRARY_INDEX_PATH = 'generated/library-index.json';

function nameOf(files: SectionFiles): string | undefined {
  const manifest: unknown = JSON.parse(files['section.json'] ?? '{}');
  const name: unknown = typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'name') : undefined;
  return typeof name === 'string' ? name : undefined;
}

export async function libraryIndexOf(packageDir: string): Promise<LibraryIndex> {
  const folders = (await Promise.all(LIBRARY_DIRS.map((root) => listSectionFolders(join(packageDir, root))))).flat();
  const sections = await Promise.all(folders.map((folder) => readSectionFolder(folder)));
  const index: Record<string, string> = {};
  for (const files of sections) {
    const key = libraryKeyOf(files);
    const name = nameOf(files);
    if (key !== null && name !== undefined && !(key in index)) index[key] = name;
  }
  return index;
}

// Файл generated/library-index.json: одна запись на строку, по имени секции — соседние правки не сливаются в одну строку.
export function libraryIndexText(index: LibraryIndex): string {
  const rows = Object.entries(index)
    .sort(([, left], [, right]) => (left < right ? -1 : 1))
    .map(([key, name]) => `  ${JSON.stringify(key)}: ${JSON.stringify(name)}`);
  return `{\n${rows.join(',\n')}\n}\n`;
}
