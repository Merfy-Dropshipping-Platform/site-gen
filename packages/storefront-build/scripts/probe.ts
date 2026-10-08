import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import probeLocals from '../fixtures/probe-locals.json';
import { readClientFiles, type BuildFile } from '../src/client-files';
import { startRenderer } from '../src/renderer';
import { buildRendererBundle } from '../src/theme-build';

// pnpm probe — проба В4-4 Б (design.md блока 4): серверная сборка темы nova (Astro 7.3.5, @astrojs/node 11.1.6) рисует
// страницы вне Vite. Тема собирается дважды в разные папки; файлы клиента и HTML двух сборок сравниваются байт в байт,
// время страницы меряется на 200 запросах подряд. Порог — дорисовка страницы в пути запроса покупателя (Св-1 В).
const NOVA_DIR = fileURLToPath(new URL('../../../themes/nova/', import.meta.url));
const BUILD_DIRS = ['dist-renderer-probe-a', 'dist-renderer-probe-b'];
const RUNS = 200;
const PAGE_BUDGET_MS = 100;
const PAGE_PATH = '/';

type ProbeBuild = { dir: string; buildMs: number; files: BuildFile[]; html: string; firstMs: number; times: number[] };

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await work();
  return { value, ms: performance.now() - start };
}

async function probeBuild(dir: string): Promise<ProbeBuild> {
  const bundle = await timed(() => buildRendererBundle(NOVA_DIR, join(NOVA_DIR, dir)));
  const renderer = await startRenderer(bundle.value.serverEntry);
  const first = await timed(() => renderer.render(PAGE_PATH, probeLocals));
  const times: number[] = [];
  for (let run = 0; run < RUNS; run += 1) times.push((await timed(() => renderer.render(PAGE_PATH, probeLocals))).ms);
  await renderer.close();
  const files = await readClientFiles(bundle.value.clientDir);
  return { dir, buildMs: bundle.ms, files, html: first.value, firstMs: first.ms, times };
}

const sameFiles = (left: BuildFile[], right: BuildFile[]): boolean =>
  left.length === right.length &&
  left.every(
    (file, index) => file.path === right[index].path && Buffer.from(file.content).equals(right[index].content),
  );

const percentile = (sorted: number[], share: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];

const ms = (value: number): string => `${value.toFixed(2)} мс`;
const same = (equal: boolean): string => (equal ? 'одинаковые' : 'разные');

const buildLine = (build: ProbeBuild): string =>
  `сборка ${build.dir}: ${(build.buildMs / 1000).toFixed(1)} с, файлов клиента ${build.files.length}, первая страница ${ms(build.firstMs)}`;

const [first, second] = [await probeBuild(BUILD_DIRS[0]), await probeBuild(BUILD_DIRS[1])];
const times = [...first.times, ...second.times].sort((left, right) => left - right);
const median = percentile(times, 0.5);
const sameClient = sameFiles(first.files, second.files);
const sameHtml = first.html === second.html;
const passed = sameClient && sameHtml && median <= PAGE_BUDGET_MS;
const lines = [
  buildLine(first),
  buildLine(second),
  `файлы клиента у двух сборок: ${same(sameClient)}`,
  `HTML главной у двух сборок: ${same(sameHtml)}`,
  `время страницы (${times.length} запросов): медиана ${ms(median)}, p95 ${ms(percentile(times, 0.95))}, наибольшее ${ms(times[times.length - 1])}; порог ${PAGE_BUDGET_MS} мс`,
  passed ? 'проба прошла' : 'проба не прошла',
];
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = passed ? 0 : 1;
