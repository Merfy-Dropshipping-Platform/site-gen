import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { ShellError } from '../src/errors';
import type { ModuleName } from '../src/core/types';
import { CORE_BUDGET_BYTES } from './build';

// Сборка ядра секций (design.md блока 5, раздел 3.10; Р5а-13) — ESM-библиотека dist/core.js: start, defineSection и
// части отдельными экспортами, без splitting и без запуска при загрузке. Бюджет меряется на бандле страницы без секций
// с частями из core-parts.json — так же его будет мерить сборка магазина (часть 5б).

export const CORE_FILE = 'core.js';

export interface CoreBuildOptions {
  packageDir: string;
  outDir: string;
  core: readonly ModuleName[]; // части из core-parts.json — они всегда в бандле страницы
  version: string;
  budgetBytes?: number; // по умолчанию CORE_BUDGET_BYTES из build/build.ts
}

export interface CoreManifest {
  version: string;
  brotliBytes: number; // вес brotli бандла страницы без секций
  parts: ModuleName[]; // части страницы из core-parts.json — их читает сборка магазина (storefront-build/src/shell.ts)
}

const ESBUILD_BASE = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'silent',
  charset: 'utf8', // как у бандла страницы (storefront-build/src/bundle.ts; блок 15, часть 15ж, Р15ж-8)
} as const;

// Пробный бандл страницы без секций: вход — строка, как её соберёт бандл страницы (часть 5б).
async function pageBundleBytes(options: CoreBuildOptions): Promise<number> {
  const entry = join(options.packageDir, 'src/core/index.ts');
  const imports = options.core.length === 0 ? 'start' : `start, ${options.core.join(', ')}`;
  const contents = `import { ${imports} } from ${JSON.stringify(entry)};\nstart({ parts: [${options.core.join(', ')}], sections: [] });`;
  const result = await build({ stdin: { contents, resolveDir: options.packageDir, loader: 'js' }, ...ESBUILD_BASE });
  return result.outputFiles.reduce((sum, file) => sum + brotliCompressSync(file.contents).length, 0);
}

async function writeLibrary(packageDir: string, outDir: string, manifest: CoreManifest): Promise<void> {
  const result = await build({ entryPoints: [join(packageDir, 'src/core/index.ts')], ...ESBUILD_BASE });
  await mkdir(outDir, { recursive: true }); // outDir не очищается: в dist/ рядом собираются поведения (dist/behaviors/)
  const code = result.outputFiles[0]?.contents ?? new Uint8Array();
  await writeFile(join(outDir, CORE_FILE), code);
  await writeFile(join(outDir, 'core.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function buildCore(options: CoreBuildOptions): Promise<CoreManifest> {
  const budget = options.budgetBytes ?? CORE_BUDGET_BYTES;
  const brotliBytes = await pageBundleBytes(options);
  if (brotliBytes > budget) {
    throw new ShellError(
      'core-too-heavy',
      `ядро секций весит ${brotliBytes} Б brotli на странице без секций, бюджет ${budget} Б`,
    );
  }
  const manifest: CoreManifest = { version: options.version, brotliBytes, parts: [...options.core] };
  await writeLibrary(options.packageDir, options.outDir, manifest);
  return manifest;
}
