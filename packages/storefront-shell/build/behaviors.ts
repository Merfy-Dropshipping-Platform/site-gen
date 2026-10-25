import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { build, type Metafile } from 'esbuild';
import { ShellError } from '../src/errors';
import type { BehaviorName } from '../src/core/behaviors/catalog';

// Сборка dist/behaviors (design.md блока 6, раздел 12): файл на поведение, появления, провайдер ctx.animate и
// часть; общий код — в кусках. Бюджеты brotli — договор (Р6-12): поднимать — только решением основного треда.

export type BundleName = BehaviorName | 'part' | 'reveal' | 'animate';
export interface BehaviorsBuildOptions {
  readonly packageDir: string;
  readonly outDir: string;
  readonly version: string;
  readonly budgets?: Partial<Record<BundleName | 'total', number>>;
}
export interface BundleInfo {
  readonly file: string;
  readonly chunks: readonly string[];
  readonly brotli: number;
}
export interface BehaviorsManifest {
  readonly version: string;
  readonly entries: Readonly<Record<BundleName, BundleInfo>>;
  readonly total: number;
}

export const BEHAVIOR_BUDGETS: Readonly<Record<BundleName | 'total', number>> = {
  part: 2816,
  animate: 4864,
  reveal: 6912,
  accordion: 5632,
  dialog: 6656,
  carousel: 15360,
  tabs: 2048,
  'nav-menu': 3072,
  quantity: 2048,
  'card-photos': 2048,
  'sticky-header': 2048,
  video: 2048,
  // Блок 11, часть 11б-2 — решение основного треда 23.10 (Р6-12).
  catalog: 4096,
  search: 3072,
  total: 34816,
};

const BUNDLE_NAMES: readonly BundleName[] = [
  'accordion',
  'dialog',
  'carousel',
  'tabs',
  'nav-menu',
  'quantity',
  'card-photos',
  'sticky-header',
  'video',
  'catalog',
  'search',
  'part',
  'reveal',
  'animate',
];

const ENTRY_OF: Readonly<Record<BundleName, string>> = {
  accordion: 'accordion.ts',
  dialog: 'dialog.ts',
  carousel: 'carousel.ts',
  tabs: 'tabs.ts',
  'nav-menu': 'nav-menu.ts',
  quantity: 'quantity.ts',
  'card-photos': 'card-photos.ts',
  'sticky-header': 'sticky-header.ts',
  video: 'video.ts',
  catalog: 'catalog-list.ts',
  search: 'search.ts',
  part: 'part.ts',
  reveal: 'reveal.ts',
  animate: 'motion.ts',
};

// Ключ входа в metafile: вывод, чей entryPoint — файл этого входа.
function entryKeyOf(name: BundleName, metafile: Metafile): string | null {
  const found = Object.entries(metafile.outputs).find(([, output]) =>
    (output.entryPoint ?? '').endsWith(ENTRY_OF[name]),
  );
  return found === undefined ? null : found[0];
}

// Куски входа с вложенными: импортированные куски рекурсивно, без повторов.
function chunkClosureOf(key: string, metafile: Metafile): readonly string[] {
  const seen = new Set<string>();
  const walk = (output: string): void => {
    metafile.outputs[output]?.imports
      .filter((item) => item.kind === 'import-statement' && !item.external)
      .forEach((item) => {
        if (seen.has(item.path)) return;
        seen.add(item.path);
        walk(item.path);
      });
  };
  walk(key);
  return [...seen];
}

interface Built {
  readonly manifest: BehaviorsManifest;
  readonly files: readonly { readonly path: string; readonly contents: Uint8Array }[];
}

// Сборка esbuild: 12 входов, общие куски, metafile для замыкания кусков входа.
async function runEsbuild(options: BehaviorsBuildOptions) {
  return build({
    entryPoints: BUNDLE_NAMES.map((name) => ({
      in: join(options.packageDir, 'src/core/behaviors', ENTRY_OF[name]),
      out: name,
    })),
    outdir: options.outDir,
    entryNames: '[name]',
    chunkNames: 'chunk-[hash]',
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
}

interface Sizes {
  readonly brotliOf: (path: string) => number;
  readonly base: (path: string) => string;
  readonly paths: readonly string[];
}

function sizesOf(outputFiles: readonly { readonly path: string; readonly contents: Uint8Array }[]): Sizes {
  const byPath = new Map(outputFiles.map((file) => [file.path, file.contents]));
  const brotliOf = (path: string): number => {
    const contents = byPath.get(path);
    return contents === undefined ? 0 : brotliCompressSync(contents).length;
  };
  const base = (path: string): string => path.split('/').pop() ?? path;
  return { brotliOf, base, paths: [...byPath.keys()] };
}

// Вес входа — brotli его файла и всех его кусков (с вложенными).
function entryInfoOf(name: BundleName, metafile: Metafile, sizes: Sizes): BundleInfo {
  const file = `${name}.js`;
  const key = entryKeyOf(name, metafile);
  if (key === null) throw new ShellError('behavior-too-heavy', `${name}: файл сборки не найден`);
  const chunks = chunkClosureOf(key, metafile).map(sizes.base);
  const ofBase = (base: string): number => {
    const path = sizes.paths.find((candidate) => sizes.base(candidate) === base);
    return path === undefined ? 0 : sizes.brotliOf(path);
  };
  return { file, chunks, brotli: ofBase(file) + chunks.reduce((sum, chunk) => sum + ofBase(chunk), 0) };
}

// Все входы с явными ключами: запись манифеста полна без приведения типов.
function entriesOf(metafile: Metafile, sizes: Sizes): Record<BundleName, BundleInfo> {
  const of = (name: BundleName): BundleInfo => entryInfoOf(name, metafile, sizes);
  return {
    accordion: of('accordion'),
    dialog: of('dialog'),
    carousel: of('carousel'),
    tabs: of('tabs'),
    'nav-menu': of('nav-menu'),
    quantity: of('quantity'),
    'card-photos': of('card-photos'),
    'sticky-header': of('sticky-header'),
    video: of('video'),
    catalog: of('catalog'),
    search: of('search'),
    part: of('part'),
    reveal: of('reveal'),
    animate: of('animate'),
  };
}

async function buildBundles(options: BehaviorsBuildOptions): Promise<Built> {
  const result = await runEsbuild(options);
  const sizes = sizesOf(result.outputFiles);
  const entries = entriesOf(result.metafile, sizes);
  const total = result.outputFiles.reduce((sum, file) => sum + sizes.brotliOf(file.path), 0);
  const manifest: BehaviorsManifest = { version: options.version, entries, total };
  const files = result.outputFiles.map((file) => ({ path: sizes.base(file.path), contents: file.contents }));
  return { manifest, files };
}

function checkBudgets(manifest: BehaviorsManifest, budgets: Readonly<Record<BundleName | 'total', number>>): void {
  BUNDLE_NAMES.forEach((name) => {
    const brotli = manifest.entries[name].brotli;
    if (brotli > budgets[name])
      throw new ShellError('behavior-too-heavy', `${name}: ${brotli} Б brotli, бюджет ${budgets[name]} Б`);
  });
  if (manifest.total > budgets.total)
    throw new ShellError('behavior-too-heavy', `total: ${manifest.total} Б brotli, бюджет ${budgets.total} Б`);
}

export async function buildBehaviors(options: BehaviorsBuildOptions): Promise<BehaviorsManifest> {
  const built = await buildBundles(options);
  checkBudgets(built.manifest, { ...BEHAVIOR_BUDGETS, ...options.budgets });
  await mkdir(options.outDir, { recursive: true });
  await Promise.all(built.files.map((file) => writeFile(join(options.outDir, file.path), file.contents)));
  await writeFile(join(options.outDir, 'behaviors.json'), `${JSON.stringify(built.manifest, null, 2)}\n`);
  return built.manifest;
}
