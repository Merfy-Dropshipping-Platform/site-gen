import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { build, type Plugin } from 'esbuild';
import { ShellError } from '../src/errors';
import type { PartName } from '../src/parts/types';
import { shellEntry } from './entry';
import { preloadOf } from './meta';

// Сборка ядра (design.md блока 7, С-1 А, С-3 Б, С7-3 Б) — один раз на версию платформы, в образе site-gen. Выход:
// <outDir>/shell/ — shell.js и файлы part-<hash>.js; <outDir>/shell.json — версия, подсказки modulepreload и вес.
// Бюджет — вес brotli файла ядра с его статическими зависимостями (то, что страница качает сразу). Число — допущение
// плана: «бюджет в CI» без числа в design.md. С блока 9 «Секций и SDK» — 12 КБ (Р9а-16): ядро секций с корзиной на
// сервере и Nano Stores — 10,1 КБ по замеру 22.10; скрипт действий Shopify на каждой странице — 11 КБ.
export const CORE_BUDGET_BYTES = 12 * 1024;
export const SHELL_FILE = 'shell.js';
const ENTRY_ID = 'merfy-shell-entry';

export interface ShellBuildOptions {
  packageDir: string;
  outDir: string;
  core: readonly PartName[];
  version: string;
  budgetBytes?: number;
}

export interface ShellManifest {
  version: string;
  preload: string[];
  brotliBytes: number;
}

interface OutFile {
  name: string;
  contents: Uint8Array;
}

// Вход сборки — строка shellEntry(core): виртуальный модуль, файлы пакета он берёт от packageDir.
const entryPlugin = (contents: string, resolveDir: string): Plugin => ({
  name: ENTRY_ID,
  setup: (pluginBuild) => {
    pluginBuild.onResolve({ filter: /^merfy-shell-entry$/ }, () => ({ path: ENTRY_ID, namespace: ENTRY_ID }));
    pluginBuild.onLoad({ filter: /.*/, namespace: ENTRY_ID }, () => ({ contents, resolveDir, loader: 'js' }));
  },
});

async function bundle(options: ShellBuildOptions) {
  const result = await build({
    entryPoints: { shell: ENTRY_ID },
    plugins: [entryPlugin(shellEntry(options.core), options.packageDir)],
    absWorkingDir: options.packageDir,
    outdir: join(options.outDir, 'shell'),
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    chunkNames: 'part-[hash]',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const files: OutFile[] = result.outputFiles.map((file) => ({ name: basename(file.path), contents: file.contents }));
  return { files, preload: preloadOf(result.metafile, SHELL_FILE) };
}

const brotliSize = (files: readonly OutFile[]): number =>
  files.reduce((sum, file) => sum + brotliCompressSync(file.contents).length, 0);

async function writeOutput(outDir: string, files: readonly OutFile[], manifest: ShellManifest): Promise<void> {
  const shellDir = join(outDir, 'shell');
  await rm(shellDir, { recursive: true, force: true });
  await mkdir(shellDir, { recursive: true });
  await Promise.all(files.map((file) => writeFile(join(shellDir, file.name), file.contents)));
  await writeFile(join(outDir, 'shell.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function buildShell(options: ShellBuildOptions): Promise<ShellManifest> {
  const { files, preload } = await bundle(options);
  const brotliBytes = brotliSize(files.filter((file) => preload.includes(file.name)));
  const budget = options.budgetBytes ?? CORE_BUDGET_BYTES;
  if (brotliBytes > budget)
    throw new ShellError('core-too-heavy', `ядро весит ${brotliBytes} Б brotli, бюджет ${budget} Б`);
  const manifest: ShellManifest = { version: options.version, preload, brotliBytes };
  await writeOutput(options.outDir, files, manifest);
  return manifest;
}
