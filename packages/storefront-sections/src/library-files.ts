import { join } from 'node:path';
import { hashOf } from '@merfy/storefront-build';
import type { SectionFiles } from './format';
import { LIBRARY_DIRS, nameOf } from './generate/library-index';
import type { LibraryRef } from './library-history';
import { listSectionFolders, readSectionFolder } from './read-folder';

// Текущая версия библиотечной секции с диска (для «перенести правки на новую версию»): папки fixtures/shop и секции
// оболочки, как у generate. Версия, чьего отпечатка нет на диске (образ старше истории или наоборот), — undefined:
// отдавать «новую версию» с другим отпечатком, чем у основы, нельзя.
export async function libraryFilesOf(packageDir: string, latest: LibraryRef): Promise<SectionFiles | undefined> {
  const folders = (await Promise.all(LIBRARY_DIRS.map((root) => listSectionFolders(join(packageDir, root))))).flat();
  const sections = await Promise.all(folders.map((folder) => readSectionFolder(folder)));
  return sections.find((files) => nameOf(files) === latest.name && hashOf(files) === latest.hash);
}
