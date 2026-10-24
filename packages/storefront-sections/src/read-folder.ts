import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isAiFile } from './ai-files';
import type { SectionFiles } from './format';

// Папка секции → файлы для приёма: путь от папки через «/» → текст UTF-8. Что лежит в папке, решает приём: незнакомый
// файл — отказ file-unknown, а не тихий пропуск.
export async function readSectionFolder(dir: string): Promise<SectionFiles> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
  // AGENTS.md и CLAUDE.md в корне — файлы для ИИ (блок 14), не части секции.
  const paths = files
    .map((file) => relative(dir, file).split(sep).join('/'))
    .filter((path) => !isAiFile(path))
    .sort();
  const texts = await Promise.all(paths.map((path) => readFile(join(dir, path), 'utf8')));
  return Object.fromEntries(paths.map((path, index) => [path, texts[index] ?? '']));
}

const isMissing = (error: unknown): boolean => error instanceof Error && Reflect.get(error, 'code') === 'ENOENT';

// Подпапки — секции, по имени. Папки нет — секций нет: у темы своих секций может не быть.
export async function listSectionFolders(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .sort();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}
