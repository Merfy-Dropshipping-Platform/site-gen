import { NAME_PATTERN, tokenDef, valueContextOf } from '../dictionary';
import { RUSSIAN_ERRORS, TokenError, shapeProblems, throwIfProblems } from '../errors';
import { KINDS } from '../kinds';
import type { Dictionary, TokenDef, TokenKind } from '../types';
import { groupFields, isTokenField, panelFields, settingFields } from './fields';
import { optionValuesOf, settingProblem } from './settings';
import { panelShape, themePanelShape } from './shape';
import type { PanelField, PanelGroup, PanelSchema, SettingField, TokenControl, TokenField } from './types';

// Схема панели (design.md блока 8, П1): форма — zod, смысл — проверки ниже. Все проблемы — одной ошибкой panel-invalid,
// каждая начинается с id поля или группы.

// Какому виду токена подходит поле панели.
const CONTROL_KINDS: Record<TokenControl, readonly TokenKind[]> = {
  color: ['color'],
  slider: ['radius', 'border-width', 'spacing', 'width'],
  font: ['font'],
  weight: ['weight'],
  segment: ['choice'],
  align: ['choice'],
  scheme: ['scheme'],
};
// У ползунка обязателен диапазон, у выбора — варианты. У остальных полей их нет.
const NEEDS_RANGE: ReadonlySet<TokenControl> = new Set(['slider']);
const NEEDS_OPTIONS: ReadonlySet<TokenControl> = new Set(['segment', 'align']);

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value) => b.includes(value));

function rangeProblems(dictionary: Dictionary, field: TokenField, def: TokenDef): string[] {
  const { range } = field;
  if (!NEEDS_RANGE.has(field.control)) return range === undefined ? [] : [`${field.id}: диапазон — только у ползунка`];
  if (range === undefined) return [`${field.id}: у ползунка нужен диапазон { min, max, step }`];
  const schema = KINDS[def.kind].schema(valueContextOf(dictionary, def, []));
  const outside = [range.min, range.max].filter((value) => !schema.safeParse(value).success);
  const limits = KINDS[def.kind].limits(valueContextOf(dictionary, def, []));
  const problems = outside.map((value) => `${field.id}: ${value} вне пределов ${def.kind} — нужно ${limits}`);
  return range.min < range.max ? problems : [...problems, `${field.id}: min диапазона меньше max`];
}

function optionProblems(field: TokenField, def: TokenDef): string[] {
  const values = (field.options ?? []).map((option) => option.value);
  if (!NEEDS_OPTIONS.has(field.control)) return values.length === 0 ? [] : [`${field.id}: варианты — только у выбора`];
  const expected = def.values ?? [];
  return sameSet(values, expected) ? [] : [`${field.id}: варианты — ровно значения токена: ${expected.join(', ')}`];
}

function tokenFieldProblems(dictionary: Dictionary, field: TokenField): string[] {
  const def = tokenDef(dictionary, field.token);
  if (def === undefined) return [`${field.id}: токена ${field.token} нет в словаре`];
  if (!CONTROL_KINDS[field.control].includes(def.kind))
    return [`${field.id}: поле ${field.control} не подходит токену вида ${def.kind}`];
  return [...rangeProblems(dictionary, field, def), ...optionProblems(field, def)];
}

function settingFieldProblems(field: SettingField): string[] {
  const values = optionValuesOf(field.setting);
  const repeated = values.length === new Set(values).size ? [] : [`${field.id}: варианты повторяются`];
  const problem = settingProblem(`${field.id}: умолчание`, field.setting, field.setting.default);
  return problem === undefined ? repeated : [...repeated, problem];
}

const fieldProblems = (dictionary: Dictionary, field: PanelField): string[] =>
  isTokenField(field) ? tokenFieldProblems(dictionary, field) : settingFieldProblems(field);

function idProblems(panel: PanelSchema): string[] {
  const ids = [...panel.groups.map((group) => group.id), ...panelFields(panel).map((field) => field.id)];
  const badNames = ids.filter((id) => !NAME_PATTERN.test(id)).map((id) => `${id}: id — kebab-case латиницей`);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index).map((id) => `${id}: id повторяется`);
  return [...badNames, ...repeated];
}

function visibleWhenProblems(panel: PanelSchema): string[] {
  const settings = new Map(settingFields(panel).map((field) => [field.id, field]));
  return panelFields(panel).flatMap((field) => {
    const condition = field.visibleWhen;
    if (condition === undefined) return [];
    const target = settings.get(condition.setting);
    if (target === undefined) return [`${field.id}: условие ссылается на настройку ${condition.setting}, её нет`];
    const problem = settingProblem(`${field.id}: значение условия`, target.setting, condition.equals);
    return problem === undefined ? [] : [problem];
  });
}

// Группа образцов схем — только цвета схемы: панель рисует их формой одной схемы.
function layoutProblems(group: PanelGroup): string[] {
  if (group.layout !== 'schemes') return [];
  const strangers = groupFields(group).filter((field) => !isTokenField(field) || field.control !== 'color');
  return strangers.map((field) => `${field.id}: в группе схем только поля цвета`);
}

// Сырой JSON схемы панели → проверенная схема. Словарь — словарь темы: токены полей ищутся в нём.
export function parsePanel(raw: unknown, dictionary: Dictionary): PanelSchema {
  const file = panelShape.safeParse(raw, RUSSIAN_ERRORS);
  if (!file.success) throw new TokenError('panel-invalid', shapeProblems(file.error, 'panel'));
  const panel: PanelSchema = { v: file.data.v, groups: file.data.groups };
  const problems = [
    ...idProblems(panel),
    ...panelFields(panel).flatMap((field) => fieldProblems(dictionary, field)),
    ...visibleWhenProblems(panel),
    ...panel.groups.flatMap(layoutProblems),
  ];
  throwIfProblems('panel-invalid', problems);
  return panel;
}

const withoutHidden = (fields: readonly PanelField[], hidden: ReadonlySet<string>): PanelField[] =>
  fields.filter((field) => !hidden.has(field.id));

function hideInGroup(group: PanelGroup, hidden: ReadonlySet<string>): PanelGroup {
  const { sidebar, ...rest } = group;
  const kept = { ...rest, fields: withoutHidden(group.fields, hidden) };
  const sidebarFields = withoutHidden(sidebar?.fields ?? [], hidden);
  if (sidebar === undefined || sidebarFields.length === 0) return kept;
  return { ...kept, sidebar: { ...sidebar, fields: sidebarFields } };
}

// Панель для темы: поля, которые тема скрыла в theme.json → panel.hidden, убраны; группа без полей — тоже.
export function panelForTheme(panel: PanelSchema, raw: unknown): PanelSchema {
  const file = themePanelShape.safeParse(raw ?? {}, RUSSIAN_ERRORS);
  if (!file.success) throw new TokenError('panel-invalid', shapeProblems(file.error, 'panel'));
  const hidden = new Set(file.data.hidden ?? []);
  const known = new Set(panelFields(panel).map((field) => field.id));
  const unknown = [...hidden].filter((id) => !known.has(id)).map((id) => `panel.hidden: поля ${id} нет в панели`);
  throwIfProblems('panel-invalid', unknown);
  const groups = panel.groups.map((group) => hideInGroup(group, hidden));
  return { v: panel.v, groups: groups.filter((group) => groupFields(group).length > 0) };
}
