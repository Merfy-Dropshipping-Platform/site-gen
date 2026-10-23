import type { FieldIssue, FieldList, RuleField, RuleSection } from './rule-types';

// Условия показа цепочкой (блок 3 «Секций и SDK», Р3.8): поле видно, если выполнено его условие и видно поле цели.
// Цепочка — до двух переходов, круг — ошибка. Цель — поле своего списка вида toggle, select, radio или alignment,
// значение — из её значений.

export const CONDITION_KINDS = ['toggle', 'select', 'radio', 'alignment'] as const;

const CONDITION_KIND_STRINGS: readonly string[] = CONDITION_KINDS;

const ALIGNMENT_VALUES = ['left', 'center', 'right'] as const;
const TOGGLE_VALUES = ['true', 'false'] as const;

const quoteList = (values: readonly string[]): string =>
  values.length === 1
    ? `\`${values[0]}\``
    : `${values
        .slice(0, -1)
        .map((value) => `\`${value}\``)
        .join(', ')} или \`${values.at(-1)}\``;

// Допустимые значения цели по её виду.
function valuesOf(target: RuleField): readonly string[] {
  if (target.setting.kind === 'toggle') return TOGGLE_VALUES;
  if (target.setting.kind === 'alignment') return ALIGNMENT_VALUES;
  return (target.setting.options ?? []).map((option) => option.value);
}

// Прямые проверки условия поля: первая сработавшая и есть проблема поля.
const DIRECT_CHECKS: readonly ((field: RuleField, list: FieldList) => string | undefined)[] = [
  (field, list) => {
    const condition = field.visibleWhen;
    const target = list.fields.find((other) => other.id === condition?.setting);
    return target === undefined
      ? `поле \`${field.id}\`: условие ссылается на поле \`${condition?.setting}\`, его нет среди полей ${list.owner}`
      : undefined;
  },
  (field, list) => {
    const condition = field.visibleWhen;
    const target = list.fields.find((other) => other.id === condition?.setting);
    if (target === undefined || CONDITION_KIND_STRINGS.includes(target.setting.kind)) return undefined;
    return `поле \`${field.id}\`: условие — только по полю вида ${quoteList(CONDITION_KINDS)}, у \`${target.id}\` — \`${target.setting.kind}\``;
  },
  (field, list) => {
    const condition = field.visibleWhen;
    const target = list.fields.find((other) => other.id === condition?.setting);
    if (target === undefined) return undefined;
    const allowed = valuesOf(target);
    if (allowed.includes(String(condition?.equals))) return undefined;
    return `поле \`${field.id}\`: в условии \`${condition?.equals}\`, у поля \`${target.id}\` значения — ${quoteList(allowed)}`;
  },
];

const CHAIN_LIMIT = 2;
const chainOf = (ids: readonly string[]): string => ids.map((id) => `\`${id}\``).join(' → ');

// Обход цепочки от поля к цели: повтор поля — круг, переходов больше двух — цепочка длиннее двух.
function chainText(field: RuleField, list: FieldList): string | undefined {
  const walk = [field.id];
  const seen = new Set(walk);
  let current = field;
  while (current.visibleWhen !== undefined) {
    const next = list.fields.find((other) => other.id === current.visibleWhen?.setting);
    if (next === undefined) break;
    if (seen.has(next.id)) return `поле \`${field.id}\`: условия по кругу — ${chainOf([...walk, next.id])}`;
    walk.push(next.id);
    seen.add(next.id);
    current = next;
  }
  if (walk.length - 1 > CHAIN_LIMIT) {
    return `поле \`${field.id}\`: цепочка условий длиннее двух — ${chainOf(walk)}`;
  }
  return undefined;
}

function listIssues(list: FieldList): FieldIssue[] {
  return list.fields.flatMap((field, index) => {
    if (field.visibleWhen === undefined) return [];
    const message = [...DIRECT_CHECKS.map((check) => check(field, list)), chainText(field, list)].find(
      (text) => text !== undefined,
    );
    return message === undefined
      ? []
      : [{ code: 'visible-when-invalid' as const, path: [...list.path, index, 'visibleWhen'], message }];
  });
}

// По каждому списку, по порядку полей, у поля с visibleWhen — не больше одной проблемы visible-when-invalid,
// путь [...list.path, индекс, 'visibleWhen'].
export function visibleWhenIssues(section: RuleSection): FieldIssue[] {
  return section.lists.flatMap(listIssues);
}
