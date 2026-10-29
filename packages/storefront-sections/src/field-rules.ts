import { settingFieldsOf, isSettingField } from './fields';
import type { SectionManifest } from './format';
import { MANIFEST_FILE } from './format';
import { limitIssues } from './limits';
import { nameIssues } from './name-check';
import { problem, type SectionProblem } from './problems';
import { valuePosition } from './position';
import type { FieldList, JsonPath, RuleSection } from './rule-types';
import { disabledWhenIssues, visibleWhenIssues } from './visibility';

// Правила полей секции (блок 3 «Секций и SDK», Р3.16) в проверке при сохранении: один текст ошибки для человека, ИИ
// и MCP. Место — строка и колонка значения в section.json.

// Секция для правил: список секции — путь ['settings'], owner «секции»; у каждого типа блока из manifest.blocks —
// путь ['blocks', <тип>, 'settings'], owner «блока `<тип>`»; типы блоков — { type, title, limit } по порядку ключей.
// Единственное место, которое читает форму блоков части 3а.
export function ruleSectionOf(manifest: SectionManifest): RuleSection {
  const sectionList: FieldList = {
    of: 'section',
    path: ['settings'],
    owner: 'секции',
    fields: settingFieldsOf(manifest.settings),
  };
  const blockEntries = Object.entries(manifest.blocks ?? {});
  const blockLists = blockEntries.map(([type, block]) => ({
    of: 'block' as const,
    path: ['blocks', type, 'settings'] as const,
    owner: `блока \`${type}\``,
    fields: block.settings,
  }));
  return {
    lists: [sectionList, ...blockLists],
    ownNames: manifest.names ?? {},
    blocks: blockEntries.map(([type, block]) => ({ type, title: block.title, limit: block.limit })),
  };
}

// Имена, потом лимиты, потом условия показа и неактивности (Р3.16); файл — section.json, место — valuePosition(text,
// issue.path).
export function fieldRuleProblems(manifest: SectionManifest, text: string): SectionProblem[] {
  const section = ruleSectionOf(manifest);
  const issues = [
    ...nameIssues(section),
    ...limitIssues(section),
    ...visibleWhenIssues(section),
    ...disabledWhenIssues(section),
  ];
  // Пути правил — по списку полей без ссылок { "wrapper": … }; место в файле — по номеру элемента settings.
  const at = settingsIndexes(manifest.settings);
  const placed = (path: JsonPath): JsonPath =>
    path[0] === 'settings' && typeof path[1] === 'number'
      ? ['settings', at[path[1]] ?? path[1], ...path.slice(2)]
      : path;
  return issues.map((item) => problem(item.code, MANIFEST_FILE, item.message, valuePosition(text, placed(item.path))));
}

// Номера элементов settings, которые являются полями, по порядку: правила адресуют поля по индексу в списке полей,
// а место в файле — по индексу элемента settings (ссылки тоже занимают элемент).
function settingsIndexes(entries: SectionManifest['settings']): number[] {
  return entries.flatMap((entry, index): number[] => (isSettingField(entry) ? [index] : []));
}
