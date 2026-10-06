import { escapeHtml } from '../html';
import type { Scenario, ScenarioRun, Target } from '../types';

const TARGET_ORDER: readonly Target[] = ['local', 'dev'];
const TARGET_TITLE: Record<Target, string> = { local: 'Локально', dev: 'Dev' };
const RESULT_TEXT = { pass: 'прошёл', fail: 'не прошёл', missing: '—' } as const;

type ResultName = keyof typeof RESULT_TEXT;

function resultOf(scenario: Scenario, target: Target, runs: readonly ScenarioRun[]): ResultName {
  const run = runs.find((item) => item.scenario.id === scenario.id && item.target === target);
  if (run === undefined) return 'missing';
  return run.ok ? 'pass' : 'fail';
}

function uniqueScenarios(runs: readonly ScenarioRun[]): Scenario[] {
  const byId = new Map(runs.map((run) => [run.scenario.id, run.scenario]));
  return [...byId.values()];
}

function rowOf(scenario: Scenario, targets: readonly Target[], runs: readonly ScenarioRun[]): string {
  const cells = targets.map((target) => {
    const result = resultOf(scenario, target, runs);
    return `<td class="${result}">${RESULT_TEXT[result]}</td>`;
  });
  const eyes = scenario.eyes.map((item) => escapeHtml(item)).join('<br>');
  const title = `<td>${escapeHtml(scenario.title)}<br><small>${escapeHtml(scenario.id)}</small></td>`;
  return `<tr>${title}${cells.join('')}<td>${eyes}</td><td class="ok-cell"></td></tr>`;
}

// Чек-лист тестировщика: сценарий × где прогоняли, итог автомата, что смотреть глазами, пустая колонка «ОК».
export function checklistOf(results: ScenarioRun[]): string {
  if (results.length === 0) return '<p>Сценарии не прогонялись.</p>';
  const targets = TARGET_ORDER.filter((target) => results.some((run) => run.target === target));
  const head = targets.map((target) => `<th>${TARGET_TITLE[target]}</th>`).join('');
  const rows = uniqueScenarios(results).map((scenario) => rowOf(scenario, targets, results));
  return [
    '<table class="checklist">',
    `<thead><tr><th>Сценарий</th>${head}<th>Смотреть глазами</th><th>ОК</th></tr></thead>`,
    `<tbody>${rows.join('')}</tbody>`,
    '</table>',
  ].join('');
}
