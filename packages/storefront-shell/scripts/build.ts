import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBehaviors } from '../build/behaviors';
import { buildCore } from '../build/core';
import { parseCoreParts } from '../build/core-parts';
import { buildPreview } from '../build/preview';

// pnpm build — ядро секций (блок 5 «Секций и SDK»): dist/core.js и dist/core.json; бандл каждой страницы магазина из
// него собирает сборка магазина (часть 5б). Части страницы — core-parts.json (С7-3 Б), версия — package.json пакета.
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

async function readJson(file: string): Promise<unknown> {
  const value: unknown = JSON.parse(await readFile(join(PACKAGE_DIR, file), 'utf8'));
  return value;
}

function versionOf(pkg: unknown): string {
  const version: unknown = typeof pkg === 'object' && pkg !== null ? Reflect.get(pkg, 'version') : undefined;
  if (typeof version === 'string') return version;
  throw new Error('package.json: нет version');
}

const core = parseCoreParts(await readJson('core-parts.json'));
const version = versionOf(await readJson('package.json'));
const sdk = await buildCore({ packageDir: PACKAGE_DIR, outDir: join(PACKAGE_DIR, 'dist'), core, version });
process.stdout.write(`ядро секций ${sdk.version}: core.js — ${sdk.brotliBytes} Б brotli на странице без секций\n`);
// Поведения и анимации (блок 6) — dist/behaviors/: файл на поведение и общие куски; бандл страницы собирает часть 6б.
const kit = await buildBehaviors({ packageDir: PACKAGE_DIR, outDir: join(PACKAGE_DIR, 'dist', 'behaviors'), version });
process.stdout.write(`поведения ${kit.version}: ${Object.keys(kit.entries).length} файлов — ${kit.total} Б brotli\n`);
// Скрипт превью (блок 5, часть 5г) — dist/preview.js: сборщик вставляет его в HTML превью после JSON-тега с бандлом.
const preview = await buildPreview({ packageDir: PACKAGE_DIR, outDir: join(PACKAGE_DIR, 'dist') });
process.stdout.write(`скрипт превью: preview.js — ${preview.bytes} Б\n`);
