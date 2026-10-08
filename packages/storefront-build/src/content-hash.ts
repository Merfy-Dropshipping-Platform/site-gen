import { glob, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { hashOf, sha256 } from './canonical';

// Вне счёта: зависимости и служебный файл Finder — git его не хранит, а на диске разработчика он появляется сам.
const SKIPPED_NAMES = new Set(['node_modules', '.DS_Store']);

const skipped = (entry: { name: string }): boolean => SKIPPED_NAMES.has(entry.name);

// Файлы по шаблонам: пути от корня через «/», без повторов, по порядку.
export async function layoutFiles(root: string, patterns: readonly string[]): Promise<string[]> {
  const found = new Set<string>();
  for await (const entry of glob(patterns, { cwd: root, withFileTypes: true, exclude: skipped })) {
    if (entry.isFile()) found.add(relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
  }
  return [...found].sort();
}

// Отпечаток набора файлов: хэш карты «путь → хэш байтов». Поправили, добавили, убрали или переименовали файл —
// отпечаток другой.
export async function contentHash(root: string, patterns: readonly string[]): Promise<string> {
  const files = await layoutFiles(root, patterns);
  const rows = await Promise.all(files.map(async (file) => [file, sha256(await readFile(join(root, file)))]));
  return hashOf(Object.fromEntries(rows));
}
