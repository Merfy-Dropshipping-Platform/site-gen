import { comparePassports, verdictOf } from '../compare/compare';
import { verdictTitle } from '../report/report';
import { parseRunArgs } from '../run/args';
import { exitCodeOf, runScenarios } from '../run/outcome';
import { checklistOf } from '../scenario/checklist';
import { baselineFile, collectStand, loadPassport, loadRules, loadScenarios, runMain, writeReport } from './common';
import { say } from './output';

// stand:run --target local|dev [--sabotage script|global|cart]: паспорт, сценарии, сравнение с эталоном, отчёт.
async function main(): Promise<number> {
  const args = parseRunArgs(process.argv.slice(2));
  const rules = await loadRules();
  const scenarios = await loadScenarios();
  const baseline = await loadPassport(baselineFile(args.target));
  const collected = await collectStand(args.target, args.sabotage);
  const outcome = runScenarios(scenarios, args.target, collected);
  const differences = comparePassports(baseline, collected.passport, rules);
  const verdict = verdictOf(differences);
  const checklist = checklistOf(outcome.runs);
  const report = await writeReport({ verdict, differences, before: baseline, after: collected.passport, checklist });
  say(verdictTitle(verdict, differences.length));
  say(`Сценарии: прошли ${outcome.runs.filter((run) => run.ok).length} из ${outcome.runs.length}`);
  outcome.failures.forEach((line) => say(`  не прошёл: ${line}`));
  say(`Отчёт: ${report}`);
  return exitCodeOf(verdict, outcome.runs);
}

runMain(main);
