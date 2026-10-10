import { z } from 'zod';
import { RUSSIAN_ERRORS, shapeProblems, throwIfProblems } from '../errors';
import { orText } from '../kinds';
import { settingFields } from './fields';
import type { PanelSchema, SettingField, SettingKind, SettingSpec, SettingValue, SettingsEdits } from './types';

// Настройки не про вид (design.md блока 8, П8-4 Б): что можно в значении каждого типа. Пустая строка годится везде,
// где тип — строка: мерчант может не заполнить поле, и ни сборка, ни превью от этого не ломаются (владелец 08.10).

const URL_MAX = 2048;
const STRING_MAX = 200;
const TEXT_MAX = 2000;
const HTTP_URL = /^https?:\/\/\S+$/;

type SettingRule = { schema: z.ZodType<SettingValue>; limits: string };

// Варианты есть только у выбора; у остальных типов — пусто.
export const optionValuesOf = (spec: SettingSpec): string[] =>
  'options' in spec ? spec.options.map((option) => option.value) : [];

// Тип настройки → схема значения и текст после «нужно». Выбор берёт варианты из самого поля.
const SETTING_RULES: Record<SettingKind, (spec: SettingSpec) => SettingRule> = {
  image: () => ({
    schema: z.union([z.literal(''), z.string().max(URL_MAX).regex(HTTP_URL)]),
    limits: `пусто или адрес http(s):// до ${URL_MAX} знаков`,
  }),
  url: () => ({ schema: z.string().max(URL_MAX), limits: `строка до ${URL_MAX} знаков` }),
  string: () => ({ schema: z.string().max(STRING_MAX), limits: `строка до ${STRING_MAX} знаков` }),
  text: () => ({ schema: z.string().max(TEXT_MAX), limits: `текст до ${TEXT_MAX} знаков` }),
  select: (spec) => {
    const values = optionValuesOf(spec);
    return { schema: z.enum(values), limits: orText(values) };
  },
  toggle: () => ({ schema: z.boolean(), limits: 'true или false' }),
};

export const settingRule = (spec: SettingSpec): SettingRule => SETTING_RULES[spec.kind](spec);

// Значение настройки годится? Нет — текст проблемы с путём, как у правок токенов.
export function settingProblem(path: string, spec: SettingSpec, value: unknown): string | undefined {
  const rule = settingRule(spec);
  return rule.schema.safeParse(value).success ? undefined : `${path}: нужно ${rule.limits}`;
}

const editsShape = z.record(z.string(), z.unknown());
export type SettingsReading = { edits: SettingsEdits; problems: string[] };

function readOne(fields: ReadonlyMap<string, SettingField>, key: string, value: unknown): string | undefined {
  const field = fields.get(key);
  if (field === undefined) return `settings.${key}: такой настройки нет в панели`;
  return settingProblem(`settings.${key}`, field.setting, value);
}

// Правки настроек без исключения: проблемы списком.
export function readSettingsEdits(panel: PanelSchema, raw: unknown): SettingsReading {
  const file = editsShape.safeParse(raw, RUSSIAN_ERRORS);
  if (!file.success) return { edits: {}, problems: shapeProblems(file.error, 'settings') };
  const fields = new Map(settingFields(panel).map((field) => [field.id, field]));
  const reading: SettingsReading = { edits: {}, problems: [] };
  for (const [key, value] of Object.entries(file.data)) {
    const problem = readOne(fields, key, value);
    if (problem !== undefined) reading.problems.push(problem);
    else if (typeof value === 'string' || typeof value === 'boolean') reading.edits[key] = value;
  }
  return reading;
}

// Правки настроек мерчанта (ключ ревизии settings). Неизвестный ключ или чужое значение — ошибка settings-invalid.
export function parseSettingsEdits(panel: PanelSchema, raw: unknown): SettingsEdits {
  const reading = readSettingsEdits(panel, raw);
  throwIfProblems('settings-invalid', reading.problems);
  return reading.edits;
}

// Все настройки панели: умолчание платформы, поверх — правка мерчанта.
export function resolveSettings(panel: PanelSchema, edits: SettingsEdits): SettingsEdits {
  const entries = settingFields(panel).map((field): [string, SettingValue] => [
    field.id,
    edits[field.id] ?? field.setting.default,
  ]);
  return Object.fromEntries(entries);
}
