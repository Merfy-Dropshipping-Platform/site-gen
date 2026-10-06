import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { collectPassport, type Collected } from '../browser/collect';
import { openPage } from '../browser/session';
import { parseRules } from '../compare/rules';
import { jsonText, readJsonFile, writeTextFile } from '../json-files';
import { normalizePassport } from '../passport/normalize';
import { packagePath } from '../paths';
import { renderReport, type ReportInput } from '../report/report';
import { EXIT_CODE, reportDirName } from '../run/outcome';
import type { SabotageName } from '../run/sabotage';
import { TARGETS, standUrl } from '../run/targets';
import { parseScenario } from '../scenario/schema';
import type { FieldRule, Passport, Scenario, Target } from '../types';
import { complain } from './output';

// Тонкий слой команд: файлы пакета, браузер, отчёт. Логика — в чистых функциях src/.
const RULES_FILE = 'compare-rules.json';
const SCENARIOS_DIR = 'scenarios';
const ROUTES_FILE = 'mocks/routes.json';

export const baselineFile = (target: Target): string => packagePath(`baselines/${target}.json`);

export async function loadRules(): Promise<FieldRule[]> {
  return parseRules(await readJsonFile(packagePath(RULES_FILE)));
}

export async function loadScenarios(): Promise<Scenario[]> {
  const names = await readdir(packagePath(SCENARIOS_DIR));
  const files = names.filter((name) => name.endsWith('.json') && !name.endsWith('.schema.json')).toSorted();
  const raws = await Promise.all(files.map((name) => readJsonFile(packagePath(`${SCENARIOS_DIR}/${name}`))));
  return raws.map(parseScenario);
}

export async function loadPassport(file: string): Promise<Passport> {
  return normalizePassport(await readJsonFile(file));
}

// Открыть стенд и снять паспорт: локально — с подменой ответов API, на dev — без неё.
export async function collectStand(target: Target, sabotage: readonly SabotageName[]): Promise<Collected> {
  const routes = TARGETS[target].mocks ? await readJsonFile(packagePath(ROUTES_FILE)) : undefined;
  return openPage(standUrl(target, process.env), { routes, sabotage }, (page) => collectPassport(page, target));
}

// reports/<время>/: index.html и оба паспорта прогона (design.md 5.6). Папка reports/ — не в git.
export async function writeReport(input: ReportInput): Promise<string> {
  const dir = packagePath(`reports/${reportDirName(new Date())}`);
  await writeTextFile(path.join(dir, 'before.json'), jsonText(input.before));
  await writeTextFile(path.join(dir, 'after.json'), jsonText(input.after));
  await writeTextFile(path.join(dir, 'index.html'), renderReport(input));
  return path.join(dir, 'index.html');
}

// Код выхода — от команды; ошибка — текст в stderr и код 2.
export function runMain(main: () => Promise<number>): void {
  void main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      complain(error instanceof Error ? error.message : String(error));
      process.exitCode = EXIT_CODE.error;
    },
  );
}
