import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { build, type Metafile } from 'esbuild';
import { ShellError } from '../src/errors';
import type { BehaviorName } from '../src/core/behaviors/catalog';
import { LIBRARIES } from '../src/core/behaviors/libraries';

// Сборка dist/behaviors (design.md блока 6, раздел 12): файл на поведение, появления, провайдер ctx.animate и
// часть; общий код — в кусках. Бюджеты brotli — договор (Р6-12): поднимать — только решением основного треда.

// 13.11: scroll — ctx.scroll и ctx.inView; lib-<имя> — адаптер библиотеки каталога (libraries.ts), бюджет — из каталога.
export type BundleName = BehaviorName | 'part' | 'reveal' | 'animate' | 'scroll' | 'in-view' | 'lib-motion';
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

// 03.11, команды поведений из скрипта секции (ctx.behavior): part — выбор поведения секции и проверка аргументов
// (2816 → 3840), dialog — место окна поверх экрана, переходы, одно модальное окно и команды (6656 → 8448).
// 04.11, слайдер следит за слайдами в вёрстке и принимает align (+175 Б); accordion делит с ним три общих куска и
// вырос до 5634 Б — предел 5632 → 5760.
// 12.11, этап 2 спеки анимаций (reports/animations/spec.md; решение основного треда Р6-12): animate 4864 → 6144 (замер
// 6084 Б: свойства и фильтр, пружина, список и stagger, повтор, ctx.split, pointermove), reveal 6912 → 7640 (замер был
// 6399, стал 7127: +728 Б — слова, строки, маска, размытие, прорисовка), общий предел 36864 → 38939 (замер был 34714,
// стал 36789: +2075 Б). Остальные файлы не выросли: данные пресетов вынесены в presets.ts, проверка кадров и пружина —
// в animate.js, ядро осталось в своих 16 КБ.
export const BEHAVIOR_BUDGETS: Readonly<Record<BundleName | 'total', number>> = {
  part: 3840,
  animate: 6144,
  reveal: 7640,
  accordion: 5760,
  dialog: 8448,
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
  // Блок 15, часть 15в (Р15в-3) — решение основного треда (Р6-12).
  zoom: 2048,
  // Таймер до даты и стираемый слой: без библиотек, как остальные малые поведения; общий предел прежний.
  countdown: 2048,
  scratch: 2048,
  // 13.11, части 2б–2в спеки анимаций (Motion 14.0 → 14.8): scroll — ctx.scroll (решение основного треда Р6-12, 4096),
  // in-view — ctx.inView отдельным малым файлом (вместе с scroll не влезал в 4096), lib-motion — из каталога библиотек
  // (libraries.ts: в 14.8 полный animate 23,2 КБ вместо 18,2 КБ в 14.0, поэтому 25 600 вместо 19 456 спеки). Файлы
  // меряются в UTF-8, как в бандле страницы. ctx.animate и ctx.split переехали из ядра в part (ядро 16 378 → 16 307 Б;
  // после превью с анимациями, PR #467, — 16 314). Общий предел — на столько, на сколько выросли файлы: замер был
  // 36 789 (Motion 14.0), стал 66 453: +29 664 Б (после #467 — 66 419).
  scroll: 4096,
  'in-view': 1024,
  'lib-motion': LIBRARIES.motion.budget,
  total: 68603,
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
  'zoom',
  'countdown',
  'scratch',
  'part',
  'reveal',
  'animate',
  'scroll',
  'in-view',
  'lib-motion',
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
  zoom: 'zoom.ts',
  countdown: 'countdown.ts',
  scratch: 'scratch.ts',
  part: 'part.ts',
  reveal: 'reveal.ts',
  animate: 'motion.ts',
  scroll: 'scroll.ts',
  'in-view': 'in-view.ts',
  'lib-motion': 'lib-motion.ts',
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

// 13.11: scroll.js, in-view.js и lib-motion.js собираются каждый отдельно, без общих кусков с остальными. esbuild делит
// код по файлам модулей: файл Motion, который нужен и motion/mini, и полному Motion, попадает в общий кусок вместе со
// всем, что из него достижимо, — аккордеон и слайдер получали +18 КБ полного Motion, с одним scroll — по +1,2 КБ, с
// in-view — по +150 Б. Цена — копия части кода motion-dom на странице, где есть и ctx.animate, и ctx.scroll.
const SOLO: readonly BundleName[] = ['scroll', 'in-view', 'lib-motion'];
const GROUPS: readonly (readonly BundleName[])[] = [
  BUNDLE_NAMES.filter((name) => !SOLO.includes(name)),
  ...SOLO.map((name) => [name]),
];

// Сборка esbuild одной группы входов: общие куски внутри группы, metafile для замыкания кусков входа.
async function runEsbuild(options: BehaviorsBuildOptions, names: readonly BundleName[]) {
  return build({
    entryPoints: names.map((name) => ({
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
    // 13.11: тексты — UTF-8, как у бандла страницы, который склеивает эти файлы (storefront-build/src/bundle.ts; блок 15,
    // часть 15ж, Р15ж-8): буква — 2 байта вместо шести знаков \uXXXX, и бюджет меряет то, что придёт в браузер.
    charset: 'utf8',
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
    zoom: of('zoom'),
    countdown: of('countdown'),
    scratch: of('scratch'),
    part: of('part'),
    reveal: of('reveal'),
    animate: of('animate'),
    scroll: of('scroll'),
    'in-view': of('in-view'),
    'lib-motion': of('lib-motion'),
  };
}

// Группы собираются по очереди; выводы и metafile — вместе (имена кусков — хеш содержимого, совпадают только у копий).
async function buildBundles(options: BehaviorsBuildOptions): Promise<Built> {
  const results = [];
  for (const names of GROUPS) results.push(await runEsbuild(options, names));
  const byPath = new Map(results.flatMap((result) => result.outputFiles.map((file) => [file.path, file] as const)));
  const outputFiles = [...byPath.values()];
  const metafile: Metafile = {
    inputs: Object.fromEntries(results.flatMap((result) => Object.entries(result.metafile.inputs))),
    outputs: Object.fromEntries(results.flatMap((result) => Object.entries(result.metafile.outputs))),
  };
  const sizes = sizesOf(outputFiles);
  const entries = entriesOf(metafile, sizes);
  const total = outputFiles.reduce((sum, file) => sum + sizes.brotliOf(file.path), 0);
  const manifest: BehaviorsManifest = { version: options.version, entries, total };
  const files = outputFiles.map((file) => ({ path: sizes.base(file.path), contents: file.contents }));
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
