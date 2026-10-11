import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseTheme, type ParsedTheme } from '@merfy/tokens';
import { z } from 'zod';
import { parseBuildInputs, type BuildInputs } from '../src/inputs';
import { renderShopPage } from '../src/page';
import { startRenderer, type Renderer } from '../src/renderer';
import { buildRendererBundle } from '../src/theme-build';

// Проба П10-1 Б (design.md блока 10, раздел 7): рисовальщик nova собран без внешних пакетов, упакован в tar.gz,
// распакован в папку вне репозитория и рисует ту же главную, что рисовальщик из папки темы. Вторая распаковка — с меткой
// в серверном коде: два рисовальщика из разных папок в одном процессе рисуют каждый своё.
const run = promisify(execFile);
const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url));
const ROOT = join(PACKAGE_DIR, '..', '..');
const NOVA_DIR = join(ROOT, 'themes', 'nova');
const OUT_DIR = join(NOVA_DIR, 'dist-renderer-probe-archive');
const WORK_DIR = '/tmp/block10-check/probe';
// Метка без кавычек: в серверном коде `<html` стоит и внутри строк в двойных кавычках.
const MARKER = 'data-merfy-probe-b';
const LIMITS = { archiveBytes: 25 * 1024 * 1024, coldStartMs: 3_000 };
const BUILTINS = new Set(builtinModules);
// Строка импорта с именем пакета: from "x", import("x"), import "x". Относительные пути начинаются с точки; `${…}` —
// подстановка в тексте ошибки адаптера Node («… from "${import.meta.url}"»), а не импорт.
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"'./$][^"']*)["']/g;
const themeFileSchema = z.object({ tokens: z.unknown() });

type Check = { name: string; ok: boolean; detail: string };
type Sample = { home: string; ms: number; rssBytes: number };

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));
const isScript = (file: string): boolean => file.endsWith('.mjs') || file.endsWith('.js');
const packageOf = (name: string): string => name.replace(/^node:/, '').split('/')[0];
const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;

async function scriptsUnder(dir: string): Promise<string[]> {
  const entries = await readdir(join(dir, 'server'), { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && isScript(entry.name)).map((e) => join(e.parentPath, e.name));
}

const importsIn = (text: string): string[] =>
  [...text.matchAll(IMPORT)].map((match) => match[1]).filter((name) => !BUILTINS.has(packageOf(name)));

async function bareimports(dir: string): Promise<string[]> {
  const texts = await Promise.all((await scriptsUnder(dir)).map((file) => readFile(file, 'utf8')));
  return [...new Set(texts.flatMap(importsIn))].sort();
}

async function unpacked(archive: string, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await run('tar', ['-xzf', archive, '-C', dir]);
  return dir;
}

// Метка во всех серверских файлах с тегом <html (первый из них — entry.mjs с текстом ошибки адаптера, главная — в своём
// куске): так распаковка b — «другая версия» того же кода.
async function marked(dir: string): Promise<boolean> {
  const files = await scriptsUnder(dir);
  const texts = await Promise.all(files.map(async (file) => ({ file, text: await readFile(file, 'utf8') })));
  const targets = texts.filter((entry) => entry.text.includes('<html'));
  const mark = (entry: { file: string; text: string }) =>
    writeFile(entry.file, entry.text.replaceAll('<html', `<html ${MARKER}`));
  await Promise.all(targets.map(mark));
  return targets.length > 0;
}

async function homeOf(renderer: Renderer, tokens: ParsedTheme, inputs: BuildInputs): Promise<string> {
  const page = await renderShopPage(inputs, '/', { tokens, render: renderer.render });
  return Buffer.from(page.file.content).toString('utf8');
}

// Запуск рисовальщика из папки и первая главная: время и прирост памяти процесса.
async function sample(entry: string, tokens: ParsedTheme, inputs: BuildInputs, opened: Renderer[]): Promise<Sample> {
  const rss = process.memoryUsage().rss;
  const start = performance.now();
  const renderer = await startRenderer(entry);
  opened.push(renderer);
  const home = await homeOf(renderer, tokens, inputs);
  return { home, ms: performance.now() - start, rssBytes: process.memoryUsage().rss - rss };
}

function checksOf(size: number, imports: string[], repo: Sample, a: Sample, b: Sample, isMarked: boolean): Check[] {
  const twoVersions = isMarked && b.home.includes(MARKER) && !a.home.includes(MARKER);
  return [
    { name: 'сборка без внешних пакетов', ok: imports.length === 0, detail: imports.join(', ') || 'нет импортов' },
    { name: 'размер архива', ok: size <= LIMITS.archiveBytes, detail: megabytes(size) },
    { name: 'та же главная, что из папки темы', ok: a.home === repo.home, detail: `${a.home.length} знаков` },
    { name: 'холодный старт', ok: a.ms <= LIMITS.coldStartMs, detail: `${a.ms.toFixed(0)} мс` },
    { name: 'две версии в одном процессе', ok: twoVersions, detail: `метка ${isMarked ? 'стоит' : 'не встала'}` },
    { name: 'память на версию', ok: true, detail: megabytes(a.rssBytes) },
  ];
}

async function main(): Promise<number> {
  await rm(WORK_DIR, { recursive: true, force: true });
  await mkdir(WORK_DIR, { recursive: true });
  const inputs = parseBuildInputs(await readJson(join(PACKAGE_DIR, 'fixtures', 'stand-inputs.json')));
  const themeJson = themeFileSchema.parse(await readJson(join(ROOT, 'packages', 'theme-nova', 'theme.json')));
  const tokens = parseTheme(themeJson.tokens);
  const bundle = await buildRendererBundle(NOVA_DIR, OUT_DIR);
  const archive = join(WORK_DIR, 'nova.tar.gz');
  await run('tar', ['-czf', archive, '-C', OUT_DIR, '.']);
  const dirA = await unpacked(archive, join(WORK_DIR, 'a'));
  const dirB = await unpacked(archive, join(WORK_DIR, 'b'));
  const opened: Renderer[] = [];
  const repo = await sample(bundle.serverEntry, tokens, inputs, opened);
  const a = await sample(join(dirA, 'server', 'entry.mjs'), tokens, inputs, opened);
  const isMarked = await marked(dirB);
  const b = await sample(join(dirB, 'server', 'entry.mjs'), tokens, inputs, opened);
  await Promise.all(opened.map((renderer) => renderer.close()));
  const checks = checksOf((await stat(archive)).size, await bareimports(dirA), repo, a, b, isMarked);
  checks.forEach((check) => process.stdout.write(`${check.ok ? 'да ' : 'нет'} ${check.name}: ${check.detail}\n`));
  return checks.every((check) => check.ok) ? 0 : 1;
}

process.exitCode = await main();
