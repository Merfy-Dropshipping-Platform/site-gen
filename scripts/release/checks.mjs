#!/usr/bin/env node
/**
 * `pnpm checks` — полная локальная проверка одной командой (spec 115).
 *
 * То же, что поезд на шагах «пересборка» и «гарды», но без git: ничего не
 * мержит, не коммитит и не пушит. Все гарды из ci.yml — одним прогоном jest
 * на всех ядрах, в очереди на машину.
 *
 *   pnpm checks                # только то, чьи входы изменились; остальное из памяти
 *   pnpm checks --full         # всё, без памяти (память обновится)
 *   pnpm checks --audit        # всё, и сверить с памятью: ошибка памяти — провал
 *   pnpm checks --skip-build   # не пересобирать (собрано этим же деревом)
 *   pnpm checks --plan         # ничего не гонять: показать, что прогонится и почему
 *
 * Память результатов (часть 3). Каждый прогон записывает, что прочитала каждая
 * проверка: модули, файлы, собранные секции, входы дочерних процессов. Если
 * с тех пор не изменился ни один её вход — она прошла бы так же, и берётся
 * прошлый зелёный результат с тем же числом проверок. Не знаем всех входов —
 * гоняем. CI памятью не пользуется: перед выкаткой гоняется всё.
 *
 * Сборка пропускается, если её входы (themes, packages, src, скрипты сборки,
 * зависимости) не менялись с прошлой удачной сборки этого дерева.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { acquireMachineLockOrWarn } from './lib/machine-lock.mjs';
import { BUILD_SEQUENCE } from './lib/build-sequence.mjs';
import { collectGuards, otherWorkflows } from './lib/ci-guards.mjs';
import { attributeGuards, formatGuardTable, localJestArgs, runJestFiles, runJestSolo, runNodeTest, runOpaque, splitJestGuards } from './lib/guard-runner.mjs';
import { createHasher } from './lib/file-hash.mjs';
import { explainMiss, lookup, store } from './lib/result-cache.mjs';
import { buildKeyOf, buildOutputsPresent, globalKeyOf, listTests, readTraces, relativizer, specInputs, touchedByWrites } from './lib/affected.mjs';
import { sh, tail, dur } from './lib/proc.mjs';

const ROOT = process.cwd();
const say = (s) => console.log(s);
const BUILD_KEY_FILE = join(ROOT, 'node_modules/.cache/merfy-checks/build-key');
const PRELOAD = join(ROOT, 'scripts/release/lib/trace/child-preload.cjs');

/**
 * Зелёный файл jest: ни одного падения. «focused» — так jest зовёт зелёный
 * файл с пропущенными проверками (it.skip по условию): при тех же входах
 * пропустится столько же. Одно правило и для записи в память, и для сверки.
 */
const isGreen = (res) => res.failed === 0 && (res.status === 'passed' || res.status === 'focused');

const readText = (f) => {
  try {
    return readFileSync(f, 'utf-8').trim();
  } catch {
    return null;
  }
};

function build(hasher, mode) {
  const key = buildKeyOf(hasher, ROOT);
  if (mode === 'memory' && key && key === readText(BUILD_KEY_FILE) && buildOutputsPresent(ROOT)) {
    say('→ сборка не нужна: её входы не менялись с прошлой удачной сборки');
    return true;
  }
  say('→ сборка в порядке CI');
  for (const [cmd, why] of BUILD_SEQUENCE) {
    const r = sh(cmd, { cwd: ROOT });
    if (r.code !== 0) {
      say(`✗ упала сборка: ${cmd}\n  запустите её одну и почините.\n${tail(r.all, 30)}`);
      return false;
    }
    say(`   ok  ${cmd.padEnd(46)} ${dur(r.ms).padStart(9)}   ${why}`);
  }
  if (key) {
    mkdirSync(dirname(BUILD_KEY_FILE), { recursive: true });
    writeFileSync(BUILD_KEY_FILE, key);
  }
  return true;
}

/**
 * Батч jest: из памяти то, у чего входы прежние, остальное — прогон с записью.
 * jestArgs — параллельно на всех ядрах или --runInBand для последовательной
 * джобы CI (guard-runner.mjs, SEQUENTIAL_JOBS).
 */
function runBatch(batch, ctx, jestArgs) {
  if (!batch.length) return { results: [], stats: { files: 0, fromMemory: 0, ran: 0, stored: 0, volatile: 0, audited: 0 }, wrong: [] };
  const { mode, hasher, globalKey, toRel } = ctx;
  const files = listTests(ROOT, [...new Set(batch.flatMap((g) => g.paths))]);
  const found = mode === 'full' ? [] : files.map((f) => [f, lookup({ id: toRel(f), globalKey, hasher })]);
  const hits = new Map(found.filter(([, rec]) => rec));
  const toRun = mode === 'memory' ? files.filter((f) => !hits.has(f)) : files;
  if (ctx.plan) {
    say(`   jest: из памяти ${hits.size} из ${files.length}, прогонится ${toRun.length}:`);
    for (const f of toRun) say(`     ${toRel(f)} — ${explainMiss({ id: toRel(f), globalKey, hasher })}`);
    return { results: [], stats: { files: files.length, fromMemory: hits.size, ran: 0, stored: 0, volatile: 0, audited: 0 }, wrong: [], plan: true };
  }
  say(`   файлов jest: ${files.length}; из памяти ${mode === 'memory' ? hits.size : 0}, прогон ${toRun.length} (jest ${jestArgs.join(' ')})`);

  const traceDir = mkdtempSync(join(tmpdir(), 'merfy-trace-'));
  const fresh = toRun.length
    ? runJestFiles(toRun, { repoRoot: ROOT, jestArgs, extraEnv: { MERFY_TRACE_DIR: traceDir } })
    : { files: new Map() };
  const traces = readTraces(traceDir);
  rmSync(traceDir, { recursive: true, force: true });
  if (!fresh.files) return { error: `jest не отдал отчёт\n${tail(fresh.log ?? '', 30)}` };

  let stored = 0;
  let volatile = 0;
  // В параллельном прогоне правка отслеживаемого исходника — гонка для всех, кто его читал:
  // ни писателя, ни читателей не запоминаем, и об этом говорим вслух.
  const parallel = !jestArgs.includes('--runInBand');
  const { written, unsafe } = parallel ? touchedByWrites(traces, toRel, ctx.tracked) : { written: new Set(), unsafe: new Set() };
  if (written.size) say(`   ⚠ в общем прогоне правились отслеживаемые файлы (${[...written].slice(0, 3).join(', ')}) — не запоминаю ${unsafe.size} файлов, что их трогали; тесту, который правит исходники, место в последовательной джобе CI`);
  for (const [abs, res] of fresh.files) {
    const t = traces.get(abs);
    if (!isGreen(res) || !t) continue;
    if (t.volatile.length || unsafe.has(t.testPath)) {
      volatile += 1;
      continue;
    }
    store({ id: toRel(abs), globalKey, hasher, inputs: specInputs(t, toRel), result: { passed: res.passed, skipped: res.skipped } });
    stored += 1;
  }

  const merged = new Map(fresh.files);
  if (mode === 'memory') {
    for (const [abs, rec] of hits) merged.set(abs, { ...rec.result, failed: 0, status: 'passed', message: '', fromMemory: true });
  }
  // Сверка: память сказала «прошло N» — прогон обязан сказать то же.
  const wrong = mode === 'audit'
    ? [...hits].filter(([abs, rec]) => {
        const f = fresh.files.get(abs);
        return !f || !isGreen(f) || f.passed !== rec.result.passed || f.skipped !== rec.result.skipped;
      }).map(([abs, rec]) => {
        const f = fresh.files.get(abs);
        return `${toRel(abs)}: память — прошло ${rec.result.passed}, прогон — ${f ? `${f.status}, прошло ${f.passed}` : 'не прогнан'}`;
      })
    : [];
  return {
    results: attributeGuards(batch, merged, ROOT),
    stats: { files: files.length, fromMemory: mode === 'memory' ? hits.size : 0, ran: toRun.length, stored, volatile, audited: mode === 'audit' ? hits.size : 0 },
    wrong,
  };
}

/** Отслеживаемые git файлы — чтобы отличить правку исходника от записи во временный файл. */
function trackedFiles() {
  const r = sh('git ls-files -z', { cwd: ROOT });
  return new Set(r.code === 0 ? r.out.split('\0').filter(Boolean) : []);
}

const RUNNERS = { 'jest-solo': runJestSolo, 'node-test': runNodeTest, opaque: runOpaque };

/** Не-jest гард (конформанс, node:test, jest пакетов): из памяти или под записью всего дерева процессов. */
function runOther(g, ctx) {
  const { mode, hasher, globalKey, toRel } = ctx;
  const id = `guard:${g.cwd ?? '.'}:${g.cmd ?? g.body}`;
  const rec = mode === 'memory' || mode === 'audit' ? lookup({ id, globalKey, hasher }) : null;
  if (mode === 'memory' && rec) return { result: { label: g.label, kind: g.kind, cmd: g.cmd, ...rec.result, ok: true, fromMemory: true } };
  if (ctx.plan) {
    say(`   гард прогонится: ${g.label} — ${explainMiss({ id, globalKey, hasher })}`);
    return { result: { label: g.label, kind: g.kind, cmd: g.cmd, ok: true, passed: null }, plan: true };
  }

  say(`   ${g.label}…`);
  const dir = mkdtempSync(join(tmpdir(), 'merfy-trace-'));
  const out = join(dir, 'reads.txt');
  const extraEnv = { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${PRELOAD}`.trim(), MERFY_TRACE_OUT: out };
  const result = RUNNERS[g.kind](g, { repoRoot: ROOT, log: say, extraEnv });
  const lines = (readText(out) ?? '').split('\n').filter(Boolean);
  rmSync(dir, { recursive: true, force: true });
  const complete = lines.length > 0 && !lines.some((l) => l.startsWith('!'));
  if (result.ok && complete) {
    store({ id, globalKey, hasher, inputs: lines.map(toRel).filter(Boolean), result: { passed: result.passed, failed: 0, skipped: result.skipped } });
  }
  const wrong = mode === 'audit' && rec && (!result.ok || result.passed !== rec.result.passed)
    ? [`${g.label}: память — прошло ${rec.result.passed ?? 'ок'}, прогон — ${result.ok ? `прошло ${result.passed}` : 'КРАСНЫЙ'}`]
    : [];
  return { result, wrong, audited: rec ? 1 : 0 };
}

function guards(hasher, mode, plan) {
  const list = collectGuards(ROOT);
  const ctx = { mode, plan, hasher, globalKey: globalKeyOf(hasher, ROOT), toRel: relativizer(ROOT), tracked: trackedFiles() };
  say(`→ гарды из .github/workflows/ci.yml: ${list.length} шт.${mode === 'memory' ? '' : ` (${mode === 'full' ? 'без памяти' : 'сверка с памятью'})`}`);
  for (const w of otherWorkflows(ROOT)) {
    if (w.cmds.length) say(`   ⚠ локально НЕ гоняется: ${w.file} (${w.name}) — его проверит только CI`);
  }
  const started = Date.now();
  const { parallel, sequential } = splitJestGuards(list);
  const batches = [runBatch(parallel, ctx, localJestArgs()), runBatch(sequential, ctx, ['--runInBand'])];
  const failed = batches.find((b) => b.error);
  if (failed) {
    say(`✗ ${failed.error}`);
    return false;
  }
  const sum = (k) => batches.reduce((a, b) => a + b.stats[k], 0);
  const batch = {
    results: batches.flatMap((b) => b.results),
    wrong: batches.flatMap((b) => b.wrong),
    stats: Object.fromEntries(['files', 'fromMemory', 'ran', 'stored', 'volatile', 'audited'].map((k) => [k, sum(k)])),
  };
  const others = list.filter((g) => g.kind !== 'jest-batch').map((g) => runOther(g, ctx));
  if (plan) return true;
  const results = [...batch.results, ...others.map((o) => o.result)];
  const wrong = [...batch.wrong, ...others.flatMap((o) => o.wrong ?? [])];

  const totals = results.reduce((a, r) => ({ passed: a.passed + (r.passed ?? 0), failed: a.failed + (r.failed ?? 0), skipped: a.skipped + (r.skipped ?? 0) }), { passed: 0, failed: 0, skipped: 0 });
  const red = results.filter((r) => !r.ok && r.passed !== 0);
  const empty = results.filter((r) => r.passed === 0 && r.kind !== 'opaque');
  const s = batch.stats;
  const othersFromMemory = others.filter((o) => o.result.fromMemory).length;

  say('');
  say(formatGuardTable(results));
  say(`\nИТОГО: прошло проверок ${totals.passed}, не прошло ${totals.failed}, пропущено ${totals.skipped}; гарды ${dur(Date.now() - started)}`);
  say(`память: файлов jest ${s.fromMemory} из ${s.files} и гардов ${othersFromMemory} из ${others.length} взяты из памяти; прогнано файлов ${s.ran}, запомнено ${s.stored}${s.volatile ? `, «гонять всегда» ${s.volatile}` : ''}`);
  for (const r of red) say(`✗ КРАСНЫЙ: ${r.label}${r.failed ? ` (не прошло ${r.failed})` : ''}\n    ${r.cmd}\n${tail(r.log ?? '', 20)}`);
  for (const r of empty) say(`✗ НОЛЬ ПРОВЕРОК: ${r.label} → ${r.why}\n    ${r.cmd}`);
  if (mode === 'audit') {
    const audited = s.audited + others.reduce((a, o) => a + (o.audited ?? 0), 0);
    say(wrong.length ? `✗ ПАМЯТЬ ОШИБЛАСЬ (${wrong.length} из ${audited}) — запись входов что-то упустила:\n  ${wrong.join('\n  ')}` : `✓ память не ошиблась: сверено ${audited}`);
  }
  return red.length === 0 && empty.length === 0 && wrong.length === 0;
}

async function main() {
  const started = Date.now();
  const flags = new Set(process.argv.slice(2));
  const mode = flags.has('--audit') ? 'audit' : flags.has('--full') ? 'full' : 'memory';
  const lock = await acquireMachineLockOrWarn({ label: `pnpm checks (${ROOT.split('/').slice(-1)[0]})`, log: say });
  // Дочерние jest видят, что очередь уже наша, и не встают в неё второй раз.
  if (!lock.disabled) process.env.MERFY_CHECKS_LOCK_HELD = '1';
  const hasher = createHasher(ROOT);
  try {
    const plan = flags.has('--plan');
    if (!plan && !flags.has('--skip-build') && !build(hasher, mode)) return 1;
    const ok = guards(hasher, mode, plan);
    if (plan) return 0;
    say(`\n${ok ? '✓ проверки пройдены' : '✗ проверки НЕ пройдены'} за ${dur(Date.now() - started)}${lock.waitedMs >= 1000 ? ` (из них в очереди ${dur(lock.waitedMs)})` : ''}`);
    return ok ? 0 : 1;
  } finally {
    hasher.save();
    lock.release();
  }
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
