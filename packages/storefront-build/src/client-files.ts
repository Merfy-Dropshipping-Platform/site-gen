import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

// Файл сборки магазина: путь от корня сайта через «/» и байты.
export interface BuildFile {
  path: string;
  content: Uint8Array;
}

// Файлы клиента серверной сборки темы (папка client/): CSS, шрифты, скрипты. Они одни на версию темы и идут в каждый
// магазин как есть. Список — по пути: тот же набор файлов даёт тот же список.
export async function readClientFiles(clientDir: string): Promise<BuildFile[]> {
  const entries = await readdir(clientDir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  const paths = files.map((file) => relative(clientDir, file).split(sep).join('/')).sort();
  return Promise.all(paths.map(async (path) => ({ path, content: await readFile(join(clientDir, path)) })));
}
