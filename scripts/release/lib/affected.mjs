/**
 * Что гонять, а что взять из памяти (spec 115, часть 3). Общие ключи, входы
 * spec-файла из записи, ключ сборки. Решения — данными, без веток по темам.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { hashOf } from './file-hash.mjs';
import { run } from './proc.mjs';

const sha1 = (s) => createHash('sha1').update(s).digest('hex');

/**
 * Общие входы: меняется любой — меняется ключ каждого файла. Сюда то, что
 * влияет на прогон, но не видно в записи файла: зависимости, настройка jest,
 * транспиляция, тёплый рендер и сама запись входов.
 */
const GLOBAL_INPUTS = [
  'package.json', 'pnpm-lock.yaml', 'jest.config.ts', 'tsconfig.json', 'tsconfig.build.json',
  'jest.setup-prod-parity.ts', 'jest.global-setup.cjs', 'jest.global-teardown.cjs',
  'src/themes/__tests__/render-bridge.cjs', 'src/themes/__tests__/render-bridge-install.cjs',
  'src/themes/__tests__/render-worker.mjs',
  'scripts/release/lib/trace/fs-tracer.cjs', 'scripts/release/lib/trace/child-preload.cjs',
  'scripts/release/lib/trace/esm-load-hook.mjs', 'scripts/release/lib/trace/jest-trace-setup.cjs',
];

/**
 * Сам инструмент проверок — весь: запись входов, отпечатки, память, выбор,
 * разбор ci.yml, раскладка джоб, подсчёт. Поменялось что угодно в нём —
 * прежней памяти не верим: она могла быть собрана по старым (дырявым) правилам.
 */
const TOOL_DIRS = ['scripts/release/lib'];
const TOOL_FILES = ['scripts/release/checks.mjs'];

function toolFiles(repoRoot) {
  const walk = (rel) => readdirSync(join(repoRoot, rel), { withFileTypes: true }).flatMap((e) => {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return walk(child);
    return /\.(mjs|cjs|js)$/.test(e.name) ? [child] : [];
  });
  return [...TOOL_FILES, ...TOOL_DIRS.flatMap(walk)];
}

/** Режимы, которые код читает из env: PARITY_* и MERFY_* (кроме служебных самой проверки). */
const ENV_RE = /^(PARITY_|MERFY_)/;
const ENV_SKIP = /^MERFY_(TRACE_|CHECKS_|RENDER_BRIDGE)/;

export function globalKeyOf(hasher, repoRoot, env = process.env) {
  const vars = Object.keys(env).filter((k) => ENV_RE.test(k) && !ENV_SKIP.test(k)).sort().map((k) => `${k}=${env[k]}`);
  const inputs = [...GLOBAL_INPUTS, ...toolFiles(repoRoot)];
  return sha1([hashOf(hasher, inputs), process.version, `CI=${env.CI ?? ''}`, ...vars].join('\n'));
}

/**
 * Абсолютный путь из записи → путь относительно корня или null. Мимо:
 * всё вне репозитория (временные файлы теста), node_modules (их сторожит
 * lockfile) и служебные каталоги самой проверки. Загрузчики пишут путь с
 * разрешёнными ссылками, fs — как передали, поэтому корень сверяется в обоих видах.
 */
export function relativizer(repoRoot) {
  const roots = [...new Set([repoRoot, realpathSync(repoRoot)])];
  return (abs) => {
    for (const root of roots) {
      const rel = relative(root, abs);
      if (rel && !rel.startsWith('..') && !rel.split('/').includes('node_modules')) return rel;
      if (rel === '') return '.';
    }
    return null;
  };
}

/** Входы spec-файла: его модули, прочитанное им и вызванным кодом, снимок jest. */
export function specInputs(trace, toRel) {
  const snap = join(dirname(trace.testPath), '__snapshots__', `${basename(trace.testPath)}.snap`);
  const all = [trace.testPath, snap, ...trace.modules, ...trace.reads];
  return [...new Set(all.map(toRel).filter(Boolean))];
}

/** Записи входов из каталога прогона: testPath → запись. */
export function readTraces(dir) {
  const out = new Map();
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    try {
      const t = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      out.set(t.testPath, t);
    } catch {
      /* недописанная запись — файл просто не попадёт в память */
    }
  }
  return out;
}

/** Файлы, которые jest прогонит по этим путям (его testMatch, roots, игноры). */
export function listTests(repoRoot, paths) {
  const r = run('pnpm', ['exec', 'jest', '--listTests', '--json', ...paths], {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${repoRoot}/node_modules/.bin:${process.env.PATH}`, MERFY_CHECKS_LOCK_HELD: '1' },
  });
  const line = r.out.split('\n').find((l) => l.startsWith('['));
  if (r.code !== 0 || !line) throw new Error(`jest --listTests не ответил:\n${r.all.slice(-2000)}`);
  return JSON.parse(line);
}

/**
 * Ключ сборки: всё, из чего она собирается (как ключ кэша dist в CI:
 * themes, packages, src, скрипты сборки, зависимости). Spec-файлы и снимки
 * не входят — сборка их не читает, а правят их чаще всего.
 */
const BUILD_ROOTS = ['themes', 'packages', 'src', 'scripts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json'];
const NOT_BUILD_INPUT = [/\.spec\.ts$/, /\.snap$/, /(^|\/)__tests__\//, /^scripts\/(release|qa)\//];

export function buildKeyOf(hasher, repoRoot) {
  const r = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...BUILD_ROOTS], { cwd: repoRoot });
  if (r.code !== 0) return null;
  const files = r.out.split('\0').filter((f) => f && !NOT_BUILD_INPUT.some((re) => re.test(f)));
  // Сама последовательность сборки живёт в scripts/release — её правка тоже меняет выход.
  return hashOf(hasher, [...files, 'scripts/release/lib/build-sequence.mjs']);
}

/**
 * Собрано ли вообще: без этого совпавший ключ не повод пропускать сборку.
 * Темы — те, у кого есть sections.map.json (их и собирает build:theme-sections);
 * satin/dist — от run-theme-build из BUILD_SEQUENCE.
 */
export function buildOutputsPresent(repoRoot) {
  const themes = readdirSync(join(repoRoot, 'themes')).filter((t) => existsSync(join(repoRoot, 'themes', t, 'sections.map.json')));
  const outputs = [
    'dist/src/main.js', 'dist/astro-blocks/manifest.json', 'themes/satin/dist/index.html',
    ...themes.map((t) => `dist/theme-sections/${t}/manifest.json`),
  ];
  return outputs.every((f) => existsSync(join(repoRoot, f)));
}

/**
 * Файлы параллельного прогона, которым нельзя верить: кто-то в этом же прогоне
 * писал в отслеживаемый git-файл, а они его читали (или писали сами). Сосед мог
 * прочитать файл посреди перезаписи, а отпечаток снят уже по восстановленному
 * содержимому — такая запись памяти соврала бы (гонка 25.09, spec 115).
 */
export function touchedByWrites(traces, toRel, tracked) {
  const writesOf = (t) => (t.writes ?? []).map(toRel).filter((rel) => rel && tracked.has(rel));
  const written = new Set([...traces.values()].flatMap(writesOf));
  if (!written.size) return { written, unsafe: new Set() };
  const unsafe = [...traces.values()].filter((t) => writesOf(t).length || specInputs(t, toRel).some((rel) => written.has(rel)));
  return { written, unsafe: new Set(unsafe.map((t) => t.testPath)) };
}
