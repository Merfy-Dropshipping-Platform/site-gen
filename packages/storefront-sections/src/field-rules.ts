import type { SectionManifest } from './format';
import { MANIFEST_FILE } from './format';
import { limitIssues } from './limits';
import { nameIssues } from './name-check';
import { problem, type SectionProblem } from './problems';
import { valuePosition } from './position';
import type { FieldList, RuleSection } from './rule-types';
import { visibleWhenIssues } from './visibility';

// Правила полей секции (блок 3 «Секций и SDK», Р3.16) в проверке при сохранении: один текст ошибки для человека, ИИ
// и MCP. Место — строка и колонка значения в section.json.

// Секция для правил: список секции — путь ['settings'], owner «секции»; у каждого типа блока из manifest.blocks —
// путь ['blocks', <тип>, 'settings'], owner «блока `<тип>`»; типы блоков — { type, title, limit } по порядку ключей.
// Единственное место, которое читает форму блоков части 3а.
export function ruleSectionOf(manifest: SectionManifest): RuleSection {
  const sectionList: FieldList = { of: 'section', path: ['settings'], owner: 'секции', fields: manifest.settings };
  const blockEntries = Object.entries(manifest.blocks ?? {});
  const blockLists = blockEntries.map(([type, block]) => ({
    of: 'block' as const,
    path: ['blocks', type, 'settings'] as const,
    owner: `блока \`${type}\``,
    fields: block.settings,
  }));
  return {
    lists: [sectionList, ...blockLists],
    blocks: blockEntries.map(([type, block]) => ({ type, title: block.title, limit: block.limit })),
  };
}

// Имена, потом лимиты, потом условия (Р3.16); файл — section.json, место — valuePosition(text, issue.path).
export function fieldRuleProblems(manifest: SectionManifest, text: string): SectionProblem[] {
  const section = ruleSectionOf(manifest);
  const issues = [...nameIssues(section), ...limitIssues(section), ...visibleWhenIssues(section)];
  return issues.map((item) => problem(item.code, MANIFEST_FILE, item.message, valuePosition(text, item.path)));
}
