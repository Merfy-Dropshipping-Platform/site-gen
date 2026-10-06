import { checkScenario } from '../scenario/checks';
import type { Scenario, ScenarioFacts, ScenarioRun, Target, Verdict } from '../types';

// 0 — чисто или жёлто, 1 — красный или проваленный сценарий, 2 — команда не смогла выполниться.
export const EXIT_CODE = { pass: 0, red: 1, error: 2 } as const;

export type ScenarioOutcome = { runs: ScenarioRun[]; failures: string[] };

function failuresOf(scenario: Scenario, facts: ScenarioFacts): string[] {
  const page = facts.passport.page;
  if (scenario.open !== page) return [`${scenario.id}: сценарий открывает ${scenario.open}, а прогон снят с ${page}`];
  const failed = checkScenario(scenario, facts).filter((result) => !result.ok);
  return failed.map((result) => `${scenario.id} · ${result.kind}: ${result.detail}`);
}

// Сценарии против одного прогона: итог каждого — для чек-листа, строки провалов — для вывода команды.
export function runScenarios(scenarios: readonly Scenario[], target: Target, facts: ScenarioFacts): ScenarioOutcome {
  const checked = scenarios.map((scenario) => ({ scenario, failures: failuresOf(scenario, facts) }));
  return {
    runs: checked.map(({ scenario, failures }) => ({ scenario, target, ok: failures.length === 0 })),
    failures: checked.flatMap(({ failures }) => failures),
  };
}

// «Код выхода 1 при красном» (design.md 5.8); проваленный сценарий — тоже красный: сценарии должны быть зелёными.
export const exitCodeOf = (verdict: Verdict, runs: readonly ScenarioRun[]): number =>
  verdict === 'red' || runs.some((run) => !run.ok) ? EXIT_CODE.red : EXIT_CODE.pass;

// Папка отчёта по времени прогона, до миллисекунд: reports/2026-10-06T12-30-05-123.
export const reportDirName = (date: Date): string => date.toISOString().slice(0, 23).replaceAll(/[:.]/g, '-');
