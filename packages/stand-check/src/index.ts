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
