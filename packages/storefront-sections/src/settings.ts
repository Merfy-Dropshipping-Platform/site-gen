import { sectionSettingProblem, type SectionField, type SectionSettingSpec, type SectionValue } from './fields';
import { cleanInlineText, isInlineTextSpec } from './inline-text';
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

export const defaultSettings = (settings: readonly SectionField[]): Record<string, SectionValue> =>
  Object.fromEntries(settings.map((field): [string, SectionValue] => [field.id, field.setting.default]));

// Пустое значение по виду (блок 3 «Секций и SDK», Р3.11): мерчант может стереть заголовок. У строк, текстов,
// richtext, адресов и картинок пустого значения нет — пустая строка; у выборов, переключателей, ползунков,
// выравнивания, схемы и отступов — умолчание. image-pair — две пустые строки (часть 5 блока 1).
const EMPTY_VALUES: Readonly<Partial<Record<SectionSettingSpec['kind'], SectionValue>>> = {
  string: '',
  text: '',
  richtext: '',
  url: '',
  image: '',
  'image-pair': { url1: '', url2: '' },
};

export const emptySettings = (settings: readonly SectionField[]): Record<string, SectionValue> =>
  Object.fromEntries(
    settings.map((field): [string, SectionValue] => [
      field.id,
      EMPTY_VALUES[field.setting.kind] ?? field.setting.default,
    ]),
  );

export interface ResolvedSettings {
  values: Record<string, SectionValue>;
  invalid: string[];
}

// Значение уже прошло sectionSettingProblem: годится любое значение JSON (Р1-5-2).
const isSectionValue = (value: unknown): value is SectionValue => value !== undefined && typeof value !== 'function';

// Значения экземпляра: правки поверх умолчаний. Сначала неизвестные ключи, потом поля с неверным значением — в invalid;
// у такого поля остаётся умолчание. Значения richtext и полей с начертаниями (string и text с ai, inline-text.ts) —
// очищенные: и умолчание, и правка.
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
    if (field !== undefined && text === undefined && isSectionValue(value)) values[key] = value;
    else if (field !== undefined) wrong.push(text ?? `${key}: нужно значение JSON`);
  }
  for (const field of settings) {
    const value = values[field.id];
    if (typeof value !== 'string') continue;
    if (field.setting.kind === 'richtext') values[field.id] = cleanRichtext(value);
    else if (isInlineTextSpec(field.setting)) values[field.id] = cleanInlineText(value);
  }
  return { values, invalid: [...unknown, ...wrong] };
}
