import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { sha256 } from './canonical';
import { StorefrontBuildError } from './errors';
import { partNameSchema, versionSchema } from './inputs';
import { parseWith } from './parse';

// Сборка ядра секций @merfy/shell на диске (design.md блока 5, раздел 3.10; pnpm --filter @merfy/shell build):
// dist/core.json — версия, вес и части страницы из core-parts.json; dist/core.js — ES-библиотека, из неё сборка магазина
// собирает бандл каждой страницы. hash — sha256 core.js: другое ядро — другой ключ сборки магазина.
export const SHELL_DIST = 'packages/storefront-shell/dist';
const MISSING_TEXT = 'нет сборки ядра: pnpm --filter @merfy/shell build';

export interface ShellBuild {
  version: string;
  hash: string;
  parts: string[];
  code: string; // текст dist/core.js
}

const coreJsonSchema = z.object({
  version: versionSchema,
  brotliBytes: z.int().positive(),
  parts: z.array(partNameSchema),
});

async function readDist(dist: string, file: string): Promise<string> {
  try {
    return await readFile(join(dist, file), 'utf8');
  } catch (error) {
    throw new StorefrontBuildError('shell-missing', MISSING_TEXT, { path: SHELL_DIST, cause: error });
  }
}

function parseCoreJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new StorefrontBuildError('shell-missing', 'dist/core.json — не JSON', { path: SHELL_DIST, cause: error });
  }
}

// Сборка ядра для сборки магазина. Нет core.json или core.js, core.json не той формы — shell-missing.
export async function readShellBuild(root: string): Promise<ShellBuild> {
  const dist = join(root, SHELL_DIST);
  const manifest = parseWith(coreJsonSchema, parseCoreJson(await readDist(dist, 'core.json')), 'shell-missing');
  const code = await readDist(dist, 'core.js');
  return { version: manifest.version, hash: sha256(code), parts: manifest.parts, code };
}
