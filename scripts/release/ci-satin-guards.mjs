#!/usr/bin/env node
/**
 * CI-исполнитель гардов джобы satin-structural-conformance.
 *
 * Зачем этот файл. До 16.09 джоба гоняла ~90 отдельных шагов `pnpm test:*` /
 * `pnpm exec jest --runInBand <файлы>` — по одному холодному старту
 * Node+ts-jest на каждый, притом что сами проверки быстрые (самый долгий
 * гард — 60 с, типичный — 20-40 с). Раньше уже пробовали свернуть это в ОДИН
 * шаг с вручную вписанным bash-массивом путей (ветка chore/b20-ci-speed,
 * коммит 470142b1) — рабочий вариант, но список путей дублировал ci.yml
 * ВРУЧНУЮ и расходился бы с ним при каждой новой проверке.
 *
 * Здесь список гардов НЕ дублируется: он читается из ЕДИНСТВЕННОГО источника
 * правды — .github/workflows/ci.yml — той же библиотекой, что уже гоняет
 * release-train и pre-push гейт (scripts/release/lib/ci-guards.mjs +
 * guard-runner.mjs). Поэтому каждый гард из джобы satin-structural-
 * conformance остаётся отдельным `- run:` шагом в ci.yml (со своим
 * поясняющим комментарием — ничего не удалено), но с `if: false`: GitHub
 * Actions показывает шаг «Skipped» и не тратит на него время, а ЭТОТ файл,
 * запущенный из отдельного шага выше, читает ci.yml, находит все такие шаги
 * и прогоняет их ОДНИМ процессом jest (--maxWorkers=2 — на двухъядерном
 * раннере воркеров больше не имеет смысла; --workerIdleMemoryLimit=1G —
 * страховка от разбухшей кучи на тяжёлых рендер-гардах).
 *
 * Новый гард добавляется как раньше: новый `- run: pnpm test:x` (или
 * `pnpm exec jest --runInBand <файл>`) шаг с `if: false` — этот скрипт
 * подхватит его сам, без правки. Если `if: false` забыли — гард просто
 * прогонится дважды (второй раз как обычный шаг), это не потеря покрытия,
 * а лишние секунды; но CI-время в этом случае не так резко упадет для этой
 * проверки, так что забывать нежелательно.
 *
 * Гард НЕ дублируется молча в ноль: `Tests: 0 total` даёт код возврата 0
 * (проверено эмпирически 16.09 на этой ветке — файл без активных тестов
 * рядом с настоящим файлом в одном прогоне jest даёт `exit 0`). Поэтому
 * здесь считаются ПРОШЕДШИЕ проверки НА КАЖДЫЙ исходный гард отдельно (через
 * guard-runner.mjs → runGuards/runJestBatch: --json + разбор testResults по
 * файлам, атрибуция обратно на гард по путям) — ноль пройденных у именованного
 * гарда красит ВЕСЬ прогон, даже если общий код возврата jest был бы нулевым.
 *
 * Шардинг: `--shard i/N` берёт каждый N-й гард (по порядку из ci.yml) —
 * используется matrix-стратегией джобы, чтобы разложить работу по НЕСКОЛЬКИМ
 * раннерам параллельно (внутри одного раннера больше 2 воркеров jest не
 * помогает — раннер двухъядерный, а вот несколько раннеров дают почти
 * линейный выигрыш).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { guardsFromWorkflow, expandChain } from './lib/ci-guards.mjs';
import { runGuards, formatGuardTable } from './lib/guard-runner.mjs';

const REPO_ROOT = process.cwd();

function parseShard(argv) {
  const i = argv.indexOf('--shard');
  if (i === -1) return { index: 1, total: 1 };
  const [index, total] = argv[i + 1].split('/').map(Number);
  if (!index || !total || index < 1 || index > total) {
    throw new Error(`некорректный --shard ${argv[i + 1]}, ожидается вида "2/3"`);
  }
  return { index, total };
}

function main() {
  const { index, total } = parseShard(process.argv.slice(2));
  const scripts = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8')).scripts ?? {};
  const wfText = readFileSync(resolve(REPO_ROOT, '.github/workflows/ci.yml'), 'utf-8');

  // Гарды ТОЛЬКО джобы satin-structural-conformance: build-and-test и
  // deploy-to-coolify гоняются (или не гоняются) отдельно от этого прогона.
  // satin-build и satin-dictated-conformance (b51-ci-speed2) — тоже отдельные
  // джобы: satin-build только собирает (никаких гардов), а дословный хвост
  // (test:conformance:shared/satin, оба node --test, точечные jest,
  // conformance:satin, check:css-layers, validate:page-seeds — порядок
  // сторожит scripts/__tests__/ci-theme-conformance-layout.test.mjs) целиком
  // переехал в satin-dictated-conformance и гоняется там РЕАЛЬНЫМИ шагами
  // (без if:false) — раньше нужен был отдельный список DICTATED_CMDS, чтобы
  // не задваивать их здесь; теперь достаточно не сканировать их job вовсе.
  const all = guardsFromWorkflow(wfText, {
    skipJobs: ['deploy-to-coolify', 'build-and-test', 'satin-build', 'satin-dictated-conformance'],
  }).flatMap((g) => expandChain(g, scripts));

  const batchable = all.filter((g) => g.kind === 'jest-batch');
  const mine = batchable.filter((_, i) => i % total === index - 1);

  // Настоящий риск потери покрытия: шаг помечен `if: false` (в CI не
  // выполнится как реальный шаг), но он НЕ bare `jest --runInBand <paths>`
  // (этот файл его не подхватит). Такой шаг не выполнится НИГДЕ — молча.
  // Конвенция (см. комментарий у консолидированного шага в ci.yml): новый
  // гард помечается `if: false` ТОЛЬКО если он bare `jest --runInBand`.
  const orphaned = all.filter((g) => g.ifCond === 'false' && g.kind !== 'jest-batch');
  if (index === 1 && orphaned.length) {
    console.error(`\n✗ гарды помечены if:false, но не bare "jest --runInBand <paths>" — они НЕ выполнятся нигде (${orphaned.length}):`);
    for (const g of orphaned) console.error(`   ${g.kind} | ${g.label} | ${g.cmd}`);
    console.error('  Либо уберите if:false (пусть шаг остаётся реальным), либо приведите команду к виду "jest --runInBand <paths...>".');
    process.exitCode = 1;
    return;
  }

  console.log(`сегмент ${index}/${total}: ${mine.length} гард(ов) из ${batchable.length} (дословный хвост — отдельная джоба satin-dictated-conformance), файлов: ${new Set(mine.flatMap((g) => g.paths)).size}`);

  const res = runGuards(mine, {
    repoRoot: REPO_ROOT,
    log: (s) => console.log(s),
    jestArgs: ['--maxWorkers=2', '--workerIdleMemoryLimit=1G'],
  });

  console.log('');
  console.log(formatGuardTable(res.results));
  console.log(`\nИТОГО сегмента ${index}/${total}: прошло ${res.totals.passed}, не прошло ${res.totals.failed}, пропущено ${res.totals.skipped}; время ${(res.ms / 1000).toFixed(1)} с`);

  try {
    mkdirSync(resolve(REPO_ROOT, 'conformance-results'), { recursive: true });
    writeFileSync(
      resolve(REPO_ROOT, `conformance-results/ci-guard-totals-shard-${index}.json`),
      JSON.stringify({ shard: `${index}/${total}`, count: mine.length, totals: res.totals, results: res.results.map((r) => ({ label: r.label, passed: r.passed, failed: r.failed, skipped: r.skipped, ok: r.ok, why: r.why })) }, null, 2),
    );
  } catch (e) {
    console.log(`⚠ не удалось записать conformance-results/ci-guard-totals-shard-${index}.json: ${e.message}`);
  }

  if (res.red.length || res.empty.length) {
    if (res.red.length) {
      console.error(`\nКРАСНЫЕ гарды (${res.red.length}) — регрессия, не отключать:`);
      for (const r of res.red) console.error(`  ${r.label}${r.failed ? ` (не прошло ${r.failed})` : ''}\n    ${r.cmd}\n${r.log ? r.log.split('\n').slice(0, 20).map((l) => `    ${l}`).join('\n') : ''}`);
    }
    if (res.empty.length) {
      console.error(`\nГАРДЫ БЕЗ ЕДИНОЙ ПРОШЕДШЕЙ ПРОВЕРКИ (${res.empty.length}) — "Tests: 0 total" даёт код 0 и выглядит как успех, здесь это провал:`);
      for (const r of res.empty) console.error(`  ${r.label} → ${r.why}\n    ${r.cmd}`);
    }
    process.exitCode = 1;
    return;
  }

  if (mine.length === 0 && batchable.length > 0) {
    // Пустой шард (например, шардов больше, чем гардов) — не провал сам по
    // себе, но громкое предупреждение на будущее.
    console.log(`⚠ сегменту ${index}/${total} не досталось ни одного гарда`);
  }
}

main();
