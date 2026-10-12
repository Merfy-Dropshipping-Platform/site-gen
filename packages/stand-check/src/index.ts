import { parseRules } from './compare/rules';
import { readJsonFile } from './json-files';
import { packagePath } from './paths';
import type { FieldRule } from './types';

// Вход пакета для других пакетов (блок 10: проверяющий процесс выпуска в пакете сборщика). Команды стенда — src/cli,
// как раньше.
export { collectPassport, type Collected } from './browser/collect';
export { openPage, type PageOptions } from './browser/session';
export { comparePassports, verdictOf } from './compare/compare';
export { parseRules } from './compare/rules';
export { normalizePassport } from './passport/normalize';
export type { Difference, FieldRule, Passport, Verdict } from './types';

// Правила сравнения для автостопа выпуска (design.md блока 10): красное — только поломка (новая ошибка в консоли,
// пропавший токен или шрифт). Стенд и отчёт человеку сравнивают по compare-rules.json, как раньше.
export const RELEASE_RULES_FILE = 'release-rules.json';

export async function loadReleaseRules(): Promise<FieldRule[]> {
  return parseRules(await readJsonFile(packagePath(RELEASE_RULES_FILE)));
}

// Снимки с выключателем (блок 10, Э3): пары «до» и «после» сравнивает команда выпуска.
export { diffPng, type PngDiff } from './shots/diff';
export {
  SHOT_WIDTHS,
  compareShots,
  shotFileName,
  standShotEntry,
  takeShots,
  type Shot,
  type ShotDifference,
  type ShotOptions,
  type ShotPage,
} from './shots/shots';
export { parseThresholds, shotKey, thresholdOf, type Thresholds } from './shots/thresholds';
export { renderReport, type ReportInput, type ShotEntry } from './report/report';
