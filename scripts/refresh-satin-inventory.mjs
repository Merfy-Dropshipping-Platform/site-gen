#!/usr/bin/env node
/**
 * Обновление отслеживаемого инвентаря satin-конформанса.
 *
 * Инвентарь пинит БАЙТЫ исходников, которые перечислены в базовой линии, —
 * в том числе src/generator/build.service.ts. Любая правка такого файла валит
 * `pnpm conformance:satin` с «tracked inventory is stale», и CI краснеет на
 * ровном месте. Обновление намеренно защищено ревью-дайджестом и ack-переменной
 * окружения, поэтому руками это три шага с копипастой хэша — из-за чего проще
 * было махнуть рукой и оставить пайплайн красным.
 *
 * Скрипт делает те же три шага: прогон → берёт reviewDigest из отчёта →
 * перезапись инвентаря. Базовую линию НЕ трогает: убирать закрытые пробелы
 * (--shrink-baseline) — отдельное осознанное действие.
 *
 * ВАЖЕН ПОРЯДОК: сначала закоммитьте свою правку, потом обновляйте инвентарь.
 * Инструмент отказывается менять отслеживаемые файлы при грязном рабочем дереве
 * («tier mutation requires a clean worktree at HEAD»).
 *
 *   git commit -am "…"                         # своя правка
 *   pnpm conformance:satin:refresh-inventory   # обновить инвентарь
 *   git commit -am "chore(conformance): refresh satin inventory"
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(ROOT, 'conformance-results', 'satin', 'report.json');
const ARGS = [
  'scripts/theme-conformance.ts',
  '--theme', 'satin',
  '--manifest', 'conformance/baselines/satin.manifest.json',
  '--baseline', 'conformance/baselines/satin.structural.json',
  '--inventory', 'conformance/inventory/satin.generated.json',
  '--report-dir', 'conformance-results/satin',
];

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf-8' }).trim();
if (dirty) {
  console.error('рабочее дерево грязное — сначала закоммитьте правку, инструмент иначе откажется:');
  console.error(dirty.split('\n').slice(0, 10).join('\n'));
  process.exit(1);
}

const run = (extra = [], env = {}) => {
  try {
    return execFileSync('pnpm', ['exec', 'tsx', ...ARGS, ...extra], {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, ...env },
    });
  } catch (err) {
    // Первый прогон и должен упасть на устаревшем инвентаре — отчёт нам всё равно нужен.
    return String(err.stdout ?? '') + String(err.stderr ?? '');
  }
};

console.log(run());
const digest = JSON.parse(readFileSync(REPORT, 'utf-8')).reviewDigest;
if (!digest) {
  console.error('в отчёте нет reviewDigest — обновлять нечего');
  process.exit(1);
}
console.log(`review-digest: ${digest}`);
console.log(
  run(['--write-inventory', '--review-digest', digest], {
    SATIN_INVENTORY_ACK: 'reviewed-refresh',
  }),
);
console.log('инвентарь обновлён — проверьте diff и закоммитьте его вместе с правкой');
