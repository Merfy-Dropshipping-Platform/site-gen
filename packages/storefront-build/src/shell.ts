import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { hashOf, sha256 } from './canonical';
import { StorefrontBuildError } from './errors';
import { partNameSchema, versionSchema } from './inputs';
import { parseWith } from './parse';

// Сборка ядра секций @merfy/shell на диске (design.md блока 5, раздел 3.10; pnpm --filter @merfy/shell build):
// dist/core.json — версия, вес и части страницы из core-parts.json; dist/core.js — ES-библиотека, из неё сборка магазина
// собирает бандл каждой страницы. hash — sha256 core.js: другое ядро — другой ключ сборки магазина.
export const SHELL_DIST = 'packages/storefront-shell/dist';
const MISSING_TEXT = 'нет сборки ядра: pnpm --filter @merfy/shell build';

// Поведения и анимации SDK (блок 6): файлы dist/behaviors по имени — тексты — и имена поведений каталога (без part,
// reveal, animate). Сборка страницы склеивает нужные из них в бандл (bundle.ts).
export interface ShellKit {
  files: ReadonlyMap<string, string>;
  behaviors: readonly string[];
}

export interface ShellBuild {
  version: string;
  hash: string; // sha256 core.js и всех файлов поведений: другой код — другой ключ сборки магазина (Р6б-4)
  parts: string[];
  code: string; // текст dist/core.js
  kit?: ShellKit; // нет — страница без поведений и анимаций (подставные сборки тестов)
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

// Поведения и анимации SDK (блок 6, часть 6б): dist/behaviors/behaviors.json — входы и куски esbuild; сборка магазина
// читает все файлы из него. part, reveal и animate обязательны, остальные записи — поведения каталога.
const KIT_DIR = 'behaviors';
const KIT_SERVICE = ['part', 'reveal', 'animate'] as const;
const kitFileSchema = z.string().regex(/^[A-Za-z0-9_-]+\.js$/);
const kitJsonSchema = z.object({
  version: versionSchema,
  entries: z.record(
    z.string().regex(/^[a-z][a-z-]*$/),
    z.object({ file: kitFileSchema, chunks: z.array(kitFileSchema) }),
  ),
});

function parseKitJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new StorefrontBuildError('shell-missing', 'dist/behaviors/behaviors.json — не JSON', {
      path: SHELL_DIST,
      cause: error,
    });
  }
}

async function readKit(dist: string): Promise<ShellKit> {
  const manifest = parseWith(
    kitJsonSchema,
    parseKitJson(await readDist(dist, `${KIT_DIR}/behaviors.json`)),
    'shell-missing',
  );
  const lost = KIT_SERVICE.filter((name) => manifest.entries[name] === undefined);
  if (lost.length > 0)
    throw new StorefrontBuildError('shell-missing', `в dist/behaviors/behaviors.json нет: ${lost.join(', ')}`, {
      path: SHELL_DIST,
    });
  const names = [...new Set(Object.values(manifest.entries).flatMap((item) => [item.file, ...item.chunks]))].sort();
  const texts = await Promise.all(names.map((name) => readDist(dist, `${KIT_DIR}/${name}`)));
  const behaviors = Object.keys(manifest.entries).filter((name) => !KIT_SERVICE.some((own) => own === name));
  return { files: new Map(names.map((name, index): [string, string] => [name, texts[index] ?? ''])), behaviors };
}

// Хеш сборки — по ядру и по каждому файлу поведений: другой код поведений — другой ключ сборки магазина (Р6б-4).
const buildHash = (code: string, kit: ShellKit): string =>
  hashOf({
    core: sha256(code),
    behaviors: Object.fromEntries([...kit.files].map(([name, text]): [string, string] => [name, sha256(text)])),
  });

// Сборка ядра для сборки магазина. Нет core.json или core.js, core.json не той формы — shell-missing.
export async function readShellBuild(root: string): Promise<ShellBuild> {
  const dist = join(root, SHELL_DIST);
  const manifest = parseWith(coreJsonSchema, parseCoreJson(await readDist(dist, 'core.json')), 'shell-missing');
  const code = await readDist(dist, 'core.js');
  const kit = await readKit(dist);
  return { version: manifest.version, hash: buildHash(code, kit), parts: manifest.parts, code, kit };
}
