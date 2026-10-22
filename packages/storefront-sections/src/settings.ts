import type { SettingValue } from '@merfy/tokens';
import { sectionSettingProblem, type SectionField } from './fields';
import { cleanRichtext } from './richtext';

// Поля настроек секции (блок 1 «Секций и SDK»; design.md блока 7, п. 23): поле настройки панели темы (блок 8) или
// richtext (fields.ts, часть 3). Проверка значения — sectionSettingProblem: у видов панели — settingProblem из
// @merfy/tokens. Здесь — проверка полей в section.json и значения экземпляра секции на странице: правки мерчанта поверх
// умолчаний; значение richtext очищается (richtext.ts) — и умолчание, и правка. format.ts импортирует этот файл,
// поэтому этот файл format.ts не импортирует.

type SettingCheck = (field: SectionField, index: number, settings: readonly SectionField[]) => string[];

const textIf = (text: string | undefined): string[] => (text === undefined ? [] : [text]);

const SETTING_CHECKS: readonly SettingCheck[] = [
  (field, index, settings) =>
    settings.findIndex((other) => other.id === field.id) === index
      ? []
      : [`settings.${index}.id: ${field.id} уже есть`],
  (field, index) => textIf(sectionSettingProblem(`settings.${index}.default`, field.setting, field.setting.default)),
];

// Проблемы полей настроек section.json — текстом с путём; пусто — поля годятся.
export const settingsTexts = (settings: readonly SectionField[]): string[] =>
  settings.flatMap((field, index) => SETTING_CHECKS.flatMap((check) => check(field, index, settings)));

export const defaultSettings = (settings: readonly SectionField[]): Record<string, SettingValue> =>
  Object.fromEntries(settings.map((field): [string, SettingValue] => [field.id, field.setting.default]));

export interface ResolvedSettings {
  values: Record<string, SettingValue>;
  invalid: string[];
}

const isSettingValue = (value: unknown): value is SettingValue =>
  typeof value === 'string' || typeof value === 'boolean';

// Значения экземпляра: правки поверх умолчаний. Сначала неизвестные ключи, потом поля с неверным значением — в invalid;
// у такого поля остаётся умолчание. Значения richtext — очищенные: и умолчание, и правка.
export function resolveSectionSettings(
  settings: readonly SectionField[],
  edits: Readonly<Record<string, unknown>>,
): ResolvedSettings {
  const fields = new Map(settings.map((field): [string, SectionField] => [field.id, field]));
  const values = defaultSettings(settings);
  const unknown = Object.keys(edits)
    .filter((key) => !fields.has(key))
    .map((key) => `${key}: такой настройки у секции нет`);
  const wrong: string[] = [];
  for (const [key, value] of Object.entries(edits)) {
    const field = fields.get(key);
    const text = field === undefined ? undefined : sectionSettingProblem(key, field.setting, value);
    if (field !== undefined && text === undefined && isSettingValue(value)) values[key] = value;
    else if (field !== undefined) wrong.push(text ?? `${key}: нужна строка или true/false`);
  }
  for (const field of settings) {
    const value = values[field.id];
    if (field.setting.kind === 'richtext' && typeof value === 'string') values[field.id] = cleanRichtext(value);
  }
  return { values, invalid: [...unknown, ...wrong] };
}
