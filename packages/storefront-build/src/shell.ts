import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { hashOf, sha256 } from './canonical';
import { readClientFiles } from './client-files';
import type { ShellBuild } from './code';
import { StorefrontBuildError } from './errors';
import { versionSchema } from './inputs';
import { parseWith } from './parse';

// Сборка ядра @merfy/shell на диске (блок 7, задача 3: pnpm --filter @merfy/shell build): dist/shell.json — версия,
// подсказки modulepreload и вес; dist/shell/ — shell.js и файлы part-<хэш>.js. Отпечаток — от путей и байтов файлов:
// другое ядро — другой путь _merfy/shell/<…>/ и другой ключ сборки магазина.
export const SHELL_DIST = 'packages/storefront-shell/dist';
const MISSING_TEXT = 'нет сборки ядра: pnpm --filter @merfy/shell build';

const shellJsonSchema = z.object({
  version: versionSchema,
  preload: z.array(z.string().min(1)).min(1),
  brotliBytes: z.int().positive(),
});

async function readShellJson(dist: string): Promise<unknown> {
  try {
    const value: unknown = JSON.parse(await readFile(join(dist, 'shell.json'), 'utf8'));
    return value;
  } catch (error) {
    throw new StorefrontBuildError('shell-missing', MISSING_TEXT, { path: SHELL_DIST, cause: error });
  }
}

// Сборка ядра для сборки магазина. Её нет или подсказка называет файл, которого нет, — shell-missing.
export async function readShellBuild(root: string): Promise<ShellBuild> {
  const dist = join(root, SHELL_DIST);
  const manifest = parseWith(shellJsonSchema, await readShellJson(dist), 'shell-missing');
  const files = await readClientFiles(join(dist, 'shell'));
  const absent = manifest.preload.filter((file) => !files.some((entry) => entry.path === file));
  if (absent.length > 0)
    throw new StorefrontBuildError('shell-missing', `в сборке ядра нет ${absent.join(', ')}`, { path: SHELL_DIST });
  const hash = hashOf(Object.fromEntries(files.map((file): [string, string] => [file.path, sha256(file.content)])));
  return { version: manifest.version, hash, preload: manifest.preload, files };
}
