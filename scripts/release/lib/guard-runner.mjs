/**
 * Прогон гардов с ЧИСЛАМИ.
 *
 * Зачем числа. `Tests: 0 total` даёт код возврата 0 и выглядит как успех:
 * достаточно, чтобы путь к сюите разъехался с файлом (`--passWithNoTests`),
 * или чтобы все проверки внутри оказались `it.skip`. Дважды за неделю такой
 * «зелёный» гард сторожил пустоту. Поэтому здесь считается не код возврата, а
 * количество ПРОШЕДШИХ проверок по каждому гарду, и ноль — это провал.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { run, sh, dur } from './proc.mjs';

/**
 * Гард выполняется ТОЙ ЖЕ строкой, что стоит в ci.yml, и с node_modules/.bin в
 * PATH. Первая версия гоняла разложенное тело скрипта напрямую — и
 * `tsx scripts/theme-conformance.ts …` падал с «command not found», выглядя
 * как красный конформанс. Ровно та ошибка, ради которой этот инструмент и
 * писался: замер врал, а не предмет замера.
 */
const env = (repoRoot) => ({ ...process.env, PATH: `${repoRoot}/node_modules/.bin:${process.env.PATH}` });
const cmdOf = (g) => g.cmd ?? g.body;

const j = (o) => JSON.stringify(o);

/**
 * Воркеры jest для локального прогона: все ядра, кроме двух (ОС, агенты).
 *
 * Раньше умолчанием был `--runInBand` — «один процесс, без лишних воркеров на
 * ноутбуке». Он медленнее вдвойне: замер 15.09 (470142b1) — 14 мин 32 с
 * против 6 мин 04 с на двух воркерах. Причина не в стартах процессов, а в GC:
 * восемьдесят с лишним сьют подряд в общей куче упираются в сборку мусора, а
 * воркеры — отдельные процессы со своей кучей, их jest перезапускает сам.
 * «Лишние воркеры на ноутбуке» больше не страшны: большой прогон стоит в
 * очереди на машину (machine-lock.mjs) и идёт один.
 */
export const localJestArgs = (cpus = availableParallelism()) => [
  `--maxWorkers=${Math.max(2, cpus - 2)}`,
  '--workerIdleMemoryLimit=1G',
];

/**
 * Прогоняет батч jest-гардов одним запуском и раскладывает счётчики по гардам.
 * CI-скрипт передаёт свои jestArgs (раннер двухъядерный).
 */
export function runJestBatch(guards, { repoRoot, log, jestArgs = localJestArgs() }) {
  if (!guards.length) return [];
  const paths = [...new Set(guards.flatMap((g) => g.paths))];
  log(`   один прогон jest (${jestArgs.join(' ')}) на ${guards.length} гард(ов), ${paths.length} путь(ей)…`);
  const r = runJestFiles(paths, { repoRoot, jestArgs });
  if (!r.files) {
    return guards.map((g) => ({ ...stat(g), code: r.code, ok: false, ms: r.ms, why: 'jest не отдал отчёт', log: r.log }));
  }
  return attributeGuards(guards, r.files, repoRoot);
}

/**
 * Один прогон jest по путям. files — Map(абсолютный путь → {passed, failed,
 * skipped, status, message}) или null, если jest не дошёл до отчёта.
 */
export function runJestFiles(paths, { repoRoot, jestArgs = localJestArgs(), extraEnv = {} }) {
  const tmp = mkdtempSync(join(tmpdir(), 'release-train-'));
  const outFile = join(tmp, 'jest.json');
  const r = run('pnpm', ['exec', 'jest', ...jestArgs, '--json', `--outputFile=${outFile}`, ...paths], {
    cwd: repoRoot,
    env: { ...env(repoRoot), ...extraEnv },
  });
  let report = null;
  try { report = JSON.parse(readFileSync(outFile, 'utf-8')); } catch { /* jest не дошёл до отчёта */ }
  rmSync(tmp, { recursive: true, force: true });
  if (!report) return { files: null, code: r.code, ms: r.ms, log: r.all };
  const files = new Map();
  for (const t of report.testResults ?? []) {
    const passed = (t.assertionResults ?? []).filter((a) => a.status === 'passed').length;
    const failed = (t.assertionResults ?? []).filter((a) => a.status === 'failed').length;
    const skipped = (t.assertionResults ?? []).filter((a) => a.status !== 'passed' && a.status !== 'failed').length;
    // Первое падение файла — чтобы красный гард сразу говорил, что именно упало.
    const firstFail = (t.assertionResults ?? []).find((a) => a.status === 'failed');
    const failure = firstFail ? `${firstFail.fullName}\n${String(firstFail.failureMessages?.[0] ?? '').split('\n').slice(0, 12).join('\n')}` : '';
    files.set(resolve(t.name), { passed, failed, skipped, status: t.status, message: t.message ?? '', failure });
  }
  return { files, code: r.code, ms: r.ms, log: r.all };
}

/**
 * Счётчики файлов → счётчики гардов. Файлы могут прийти и из прогона, и из
 * памяти результатов (`pnpm checks`, spec 115 часть 3): гарду всё равно, откуда
 * число прошедших проверок, — ноль по-прежнему провал.
 */
export function attributeGuards(guards, files, repoRoot) {
  return guards.map((g) => {
    const mine = [...files.entries()].filter(([abs]) => g.paths.some((p) => matches(abs, resolve(repoRoot, p), repoRoot)));
    const acc = mine.reduce((a, [, v]) => ({ passed: a.passed + v.passed, failed: a.failed + v.failed, skipped: a.skipped + v.skipped }), { passed: 0, failed: 0, skipped: 0 });
    const suiteErr = mine.filter(([, v]) => v.status === 'failed' && v.failed === 0).map(([abs, v]) => `${relative(repoRoot, abs)}: ${String(v.message).split('\n')[0]}`);
    const failures = mine.filter(([, v]) => v.failure).map(([abs, v]) => `${relative(repoRoot, abs)} › ${v.failure}`);
    return {
      ...stat(g),
      files: mine.length,
      fromMemory: mine.length > 0 && mine.every(([, v]) => v.fromMemory),
      passed: acc.passed,
      failed: acc.failed + suiteErr.length,
      skipped: acc.skipped,
      ok: acc.failed === 0 && suiteErr.length === 0 && acc.passed > 0,
      ms: null,
      why: acc.passed === 0 ? (mine.length ? 'ни одной ПРОШЕДШЕЙ проверки' : 'ни один файл не найден по пути из ci.yml') : null,
      log: [...suiteErr, ...failures].join('\n'),
    };
  });
}

const matches = (absFile, absPattern, repoRoot) =>
  absFile === absPattern || absFile.startsWith(absPattern.endsWith('/') ? absPattern : `${absPattern}/`);

const stat = (g) => ({ label: g.label, kind: g.kind, cmd: g.cmd, body: g.body, cwd: g.cwd ?? null });

/** jest со своим конфигом/фильтрами — отдельный прогон, счётчик тот же. */
export function runJestSolo(g, { repoRoot, log, extraEnv = {} }) {
  const tmp = mkdtempSync(join(tmpdir(), 'release-train-'));
  const outFile = join(tmp, 'jest.json');
  const cwd = g.cwd ? resolve(repoRoot, g.cwd) : repoRoot;
  const r = sh(`${cmdOf(g)} --json --outputFile=${j(outFile)}`, { cwd, env: { ...env(repoRoot), ...extraEnv } });
  let report = null;
  try { report = JSON.parse(readFileSync(outFile, 'utf-8')); } catch { /* не дошёл */ }
  rmSync(tmp, { recursive: true, force: true });
  const passed = report?.numPassedTests ?? 0;
  const failed = report?.numFailedTests ?? 0;
  const skipped = (report?.numPendingTests ?? 0) + (report?.numTodoTests ?? 0);
  return {
    ...stat(g),
    files: report?.numTotalTestSuites ?? 0,
    passed, failed, skipped,
    ok: r.code === 0 && failed === 0 && passed > 0,
    ms: r.ms,
    why: passed === 0 ? 'ни одной ПРОШЕДШЕЙ проверки' : null,
    log: r.all,
  };
}

/** node --test: счётчики берём из TAP-итогов. */
export function runNodeTest(g, { repoRoot, extraEnv = {} }) {
  const r = sh(cmdOf(g), { cwd: g.cwd ? resolve(repoRoot, g.cwd) : repoRoot, env: { ...env(repoRoot), ...extraEnv } });
  // Итог печатают оба репортёра node:test, но по-разному: spec — «ℹ pass 6»,
  // tap — «# pass 6». Ищем оба, иначе живой гард выглядит как пустой.
  const num = (re) => Number((r.all.match(re) ?? [])[1] ?? 0);
  const passed = num(/^(?:#|ℹ) pass (\d+)/m);
  const failed = num(/^(?:#|ℹ) fail (\d+)/m);
  const skipped = num(/^(?:#|ℹ) skipped (\d+)/m);
  return {
    ...stat(g),
    files: g.paths?.length ?? 0,
    passed, failed, skipped,
    ok: r.code === 0 && failed === 0 && passed > 0,
    ms: r.ms,
    why: passed === 0 ? 'ни одной ПРОШЕДШЕЙ проверки' : null,
    log: r.all,
  };
}

/** Конформанс, линтер, валидаторы: счётчика проверок нет — только код возврата. */
export function runOpaque(g, { repoRoot, extraEnv = {} }) {
  const r = sh(cmdOf(g), { cwd: g.cwd ? resolve(repoRoot, g.cwd) : repoRoot, env: { ...env(repoRoot), ...extraEnv } });
  return { ...stat(g), files: 0, passed: null, failed: null, skipped: null, ok: r.code === 0, ms: r.ms, why: null, log: r.all };
}

/** Прогоняет весь набор и печатает таблицу. Возвращает {results, red, empty, totals}. */
/**
 * Джобы CI, шаги которых идут строго по очереди, — и локально их jest-гарды
 * идут по очереди, после общего параллельного прогона. В satin-dictated-
 * conformance живут тесты, которые на время меняют отслеживаемые входы
 * отпечатка конформанса и возвращают байты (conformance-theme-digest-isolation,
 * satin-conformance-tier-transaction). Рядом с ними в параллельном прогоне
 * проверка детерминизма snapshot'а satin читала файл посреди перезаписи и
 * краснела (25.09, spec 115), а память могла бы запомнить результат,
 * посчитанный на временном содержимом. В CI эта джоба — последовательные шаги,
 * поэтому там гонки не было.
 */
export const SEQUENTIAL_JOBS = new Set(['satin-dictated-conformance']);

/** jest-гарды: параллельные (общий прогон) и последовательные (по одному процессу, --runInBand). */
export function splitJestGuards(guards) {
  const jest = guards.filter((g) => g.kind === 'jest-batch');
  return {
    parallel: jest.filter((g) => !SEQUENTIAL_JOBS.has(g.job)),
    sequential: jest.filter((g) => SEQUENTIAL_JOBS.has(g.job)),
  };
}

export function runGuards(guards, { repoRoot, log, jestArgs }) {
  const { parallel, sequential } = splitJestGuards(guards);
  const rest = guards.filter((g) => g.kind !== 'jest-batch');
  const started = Date.now();
  const results = [];

  for (const [batch, args] of [[parallel, jestArgs], [sequential, ['--runInBand']]]) {
    const batchStart = Date.now();
    const batchRes = runJestBatch(batch, { repoRoot, log, ...(args ? { jestArgs: args } : {}) });
    const batchMs = Date.now() - batchStart;
    results.push(...batchRes.map((r) => ({ ...r, ms: r.ms ?? Math.round(batchMs / Math.max(1, batchRes.length)) })));
  }

  for (const g of rest) {
    log(`   ${g.label}…`);
    if (g.kind === 'jest-solo') results.push(runJestSolo(g, { repoRoot, log }));
    else if (g.kind === 'node-test') results.push(runNodeTest(g, { repoRoot }));
    else results.push(runOpaque(g, { repoRoot }));
  }

  const totals = results.reduce((a, r) => ({
    passed: a.passed + (r.passed ?? 0),
    failed: a.failed + (r.failed ?? 0),
    skipped: a.skipped + (r.skipped ?? 0),
  }), { passed: 0, failed: 0, skipped: 0 });

  const red = results.filter((r) => !r.ok && r.passed !== 0);
  const empty = results.filter((r) => r.passed === 0 && r.kind !== 'opaque');
  return { results, red, empty, totals, ms: Date.now() - started };
}

/** Таблица «гард | проверок | состояние». */
export function formatGuardTable(results) {
  const pad = (v, n) => String(v ?? '').padEnd(n);
  const lpad = (v, n) => String(v ?? '').padStart(n);
  const lines = [`${pad('гард', 46)}${lpad('проверок', 9)}${lpad('пропущ.', 9)}  состояние`];
  for (const r of results) {
    const count = r.passed === null ? '—' : r.passed;
    let state;
    if (r.kind === 'opaque') state = r.ok ? 'ок (команда без счётчика проверок)' : 'КРАСНЫЙ';
    else if (r.passed === 0) state = `НОЛЬ ПРОВЕРОК — ${r.why}`;
    else if (!r.ok) state = `КРАСНЫЙ: не прошло ${r.failed}`;
    else state = 'ок';
    if (r.ok && r.fromMemory) state += ' · из памяти';
    lines.push(`${pad(cut(r.label, 45), 46)}${lpad(count, 9)}${lpad(r.skipped ?? '—', 9)}  ${state}`);
  }
  return lines.join('\n');
}
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
