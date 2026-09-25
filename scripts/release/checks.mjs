#!/usr/bin/env node
/**
 * `pnpm checks` — полная локальная проверка одной командой (spec 115, часть 1).
 *
 * То же, что поезд на шагах «пересборка» и «гарды», но без git: ничего не
 * мержит, не коммитит и не пушит. Заменяет цикл
 * `for i in 1..10; do ci-satin-guards.mjs --shard $i/10; done` — тот повторял
 * раскладку CI (десять кусков по два ядра, раннер двухъядерный) и на
 * десятиядерной машине держал занятыми два ядра из десяти.
 *
 *   pnpm checks                # очередь → сборка в порядке CI → все гарды из ci.yml
 *   pnpm checks --skip-build   # не пересобирать (собрано этим же деревом)
 *
 * Большой прогон стоит в очереди на машину: пока идёт соседний, этот ждёт и
 * пишет, кого ждёт. Гарды считаются по ПРОШЕДШИМ проверкам: ноль у гарда —
 * провал, как в поезде и в CI.
 */
import { acquireMachineLockOrWarn } from './lib/machine-lock.mjs';
import { BUILD_SEQUENCE } from './lib/build-sequence.mjs';
import { collectGuards, otherWorkflows } from './lib/ci-guards.mjs';
import { runGuards, formatGuardTable, localJestArgs } from './lib/guard-runner.mjs';
import { sh, tail, dur } from './lib/proc.mjs';

const ROOT = process.cwd();
const say = (s) => console.log(s);

function build() {
  say('→ сборка в порядке CI');
  for (const [cmd, why] of BUILD_SEQUENCE) {
    const r = sh(cmd, { cwd: ROOT });
    if (r.code !== 0) {
      say(`✗ упала сборка: ${cmd}\n  запустите её одну и почините.\n${tail(r.all, 30)}`);
      return false;
    }
    say(`   ok  ${cmd.padEnd(46)} ${dur(r.ms).padStart(9)}   ${why}`);
  }
  return true;
}

function guards() {
  const list = collectGuards(ROOT);
  const jestArgs = localJestArgs();
  say(`→ гарды из .github/workflows/ci.yml: ${list.length} шт., jest ${jestArgs.join(' ')}`);
  for (const w of otherWorkflows(ROOT)) {
    if (w.cmds.length) say(`   ⚠ локально НЕ гоняется: ${w.file} (${w.name}) — его проверит только CI`);
  }
  const res = runGuards(list, { repoRoot: ROOT, log: say, jestArgs });
  say('');
  say(formatGuardTable(res.results));
  say(`\nИТОГО: прошло проверок ${res.totals.passed}, не прошло ${res.totals.failed}, пропущено ${res.totals.skipped}; гарды ${dur(res.ms)}`);
  for (const r of res.red) say(`✗ КРАСНЫЙ: ${r.label}${r.failed ? ` (не прошло ${r.failed})` : ''}\n    ${r.cmd}\n${tail(r.log ?? '', 20)}`);
  for (const r of res.empty) say(`✗ НОЛЬ ПРОВЕРОК: ${r.label} → ${r.why}\n    ${r.cmd}`);
  return res.red.length === 0 && res.empty.length === 0;
}

async function main() {
  const started = Date.now();
  const skipBuild = process.argv.includes('--skip-build');
  const lock = await acquireMachineLockOrWarn({ label: `pnpm checks (${ROOT.split('/').slice(-1)[0]})`, log: say });
  // Дочерние jest видят, что очередь уже наша, и не встают в неё второй раз.
  if (!lock.disabled) process.env.MERFY_CHECKS_LOCK_HELD = '1';
  try {
    if (!skipBuild && !build()) return 1;
    const ok = guards();
    say(`\n${ok ? '✓ проверки пройдены' : '✗ проверки НЕ пройдены'} за ${dur(Date.now() - started)}${lock.waitedMs >= 1000 ? ` (из них в очереди ${dur(lock.waitedMs)})` : ''}`);
    return ok ? 0 : 1;
  } finally {
    lock.release();
  }
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
