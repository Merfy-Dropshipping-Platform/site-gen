import { settingProblem, type SettingField, type SettingValue } from '@merfy/tokens';

// Поля настроек секции (блок 1 «Секций и SDK»; design.md блока 7, п. 23): та же схема поля, что у панели темы (блок 8),
// и та же проверка значения — settingProblem из @merfy/tokens. Здесь — проверка полей в section.json и значения
// экземпляра секции на странице: правки мерчанта поверх умолчаний. format.ts импортирует этот файл, поэтому этот файл
// format.ts не импортирует.

// id поля — строчные латинские буквы и цифры через одиночный дефис, как имя секции (словарь имён, решение 5 А).
const SETTING_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type SettingCheck = (field: SettingField, index: number, settings: readonly SettingField[]) => string[];

const textIf = (text: string | undefined): string[] => (text === undefined ? [] : [text]);

function conditionTexts(field: SettingField, index: number, settings: readonly SettingField[]): string[] {
  const condition = field.visibleWhen;
  if (condition === undefined) return [];
  const target = settings.find((other) => other.id === condition.setting);
  if (target === undefined) return [`settings.${index}.visibleWhen: настройки ${condition.setting} нет`];
  return textIf(settingProblem(`settings.${index}.visibleWhen.equals`, target.setting, condition.equals));
}

const SETTING_CHECKS: readonly SettingCheck[] = [
  (field, index) =>
    SETTING_ID.test(field.id) ? [] : [`settings.${index}.id: нужны строчные латинские буквы и цифры через одиночный дефис`],
  (field, index, settings) =>
    settings.findIndex((other) => other.id === field.id) === index ? [] : [`settings.${index}.id: ${field.id} уже есть`],
  (field, index) => textIf(settingProblem(`settings.${index}.default`, field.setting, field.setting.default)),
  conditionTexts,
];

// Проблемы полей настроек section.json — текстом с путём; пусто — поля годятся.
export const settingsTexts = (settings: readonly SettingField[]): string[] =>
  settings.flatMap((field, index) => SETTING_CHECKS.flatMap((check) => check(field, index, settings)));

export const defaultSettings = (settings: readonly SettingField[]): Record<string, SettingValue> =>
  Object.fromEntries(settings.map((field): [string, SettingValue] => [field.id, field.setting.default]));

export interface ResolvedSettings {
  values: Record<string, SettingValue>;
  invalid: string[];
}

const isSettingValue = (value: unknown): value is SettingValue => typeof value === 'string' || typeof value === 'boolean';

// Значения экземпляра: правки поверх умолчаний. Сначала неизвестные ключи, потом поля с неверным значением — в invalid;
// у такого поля остаётся умолчание.
export function resolveSectionSettings(
  settings: readonly SettingField[],
  edits: Readonly<Record<string, unknown>>,
): ResolvedSettings {
  const fields = new Map(settings.map((field): [string, SettingField] => [field.id, field]));
  const values = defaultSettings(settings);
  const unknown = Object.keys(edits)
    .filter((key) => !fields.has(key))
    .map((key) => `${key}: такой настройки у секции нет`);
  const wrong: string[] = [];
  for (const [key, value] of Object.entries(edits)) {
    const field = fields.get(key);
    const text = field === undefined ? undefined : settingProblem(key, field.setting, value);
    if (field !== undefined && text === undefined && isSettingValue(value)) values[key] = value;
    else if (field !== undefined) wrong.push(text ?? `${key}: нужна строка или true/false`);
  }
  return { values, invalid: [...unknown, ...wrong] };
}
