import { sectionManifestSchema } from '@merfy/storefront-sections';
import { z } from 'zod';

// section-json.md (блок 14): ключи схемы формата с пояснениями и таблица видов полей из z.toJSONSchema.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Пояснения ключей section.json; ключа схемы без пояснения нет — ошибка генерации.
const KEY_NOTES: Readonly<Record<string, string>> = {
  $schema: 'адрес JSON Schema для подсказок редактора; проверка ключ не читает',
  sdk: 'версия SDK: 1',
  name: 'имя секции: строчные латинские буквы и цифры через одиночный дефис',
  kind: 'вид: section или global',
  title: 'название секции в конструкторе, до 80 знаков',
  settings: 'поля секции; имя каждого — из словаря имён (names.md)',
  blocks: 'типы блоков: свои поля у каждого типа',
  defaultBlocks: 'блоки, с которыми секция появляется в конструкторе',
  groups: 'куда можно ставить секцию: header, page, footer; нет ключа — только page',
  limit: 'сколько экземпляров секции в одном списке, от 1 до 50',
  removable: 'false — секцию нельзя удалить',
  uses: 'открывает данные: theme, shop',
  newPage: 'id поля вида string: имя новой страницы, куда ставится секция',
  tokens: 'свои токены секции; имя с меткой custom',
  wrapper: 'общие настройки секции; нет ключа — scheme и padding',
  themeSettings: 'сквозные настройки темы, которые читает секция: имена полей панели с пометкой "shared": true',
  data: 'Поля записей для `script.ts`: имя → `from` (`page.record` или `settings.<id поля с записью>`) и `fields` — публичные поля записи. В `ctx.data.<имя>` — объявленные поля или `null`.',
};

const keyRows = (): string[] => {
  const keys = Object.keys(sectionManifestSchema.shape);
  const missing = keys.filter((key) => !Object.hasOwn(KEY_NOTES, key));
  if (missing.length > 0) throw new Error(`section-json: нет пояснения ключа ${missing.join(', ')}`);
  return keys.map((key) => `| \`${key}\` | ${KEY_NOTES[key] ?? ''} |`);
};

const fieldVariantOptions = (field: Record<string, unknown>): Record<string, unknown>[] => {
  if (!isRecord(field.properties) || !isRecord(field.properties.setting)) return [];
  const options = field.properties.setting.oneOf ?? field.properties.setting.anyOf;
  return Array.isArray(options) ? options.filter(isRecord) : [];
};

const settingOptions = (schema: unknown): Record<string, unknown>[] => {
  if (!isRecord(schema)) throw new Error('section-json: схема не объект');
  const settings = schema.properties;
  if (!isRecord(settings) || !isRecord(settings.settings)) throw new Error('section-json: нет ключа settings');
  const items = settings.settings.items;
  if (!isRecord(items)) throw new Error('section-json: у settings нет items');
  const fieldVariants = items.oneOf ?? items.anyOf;
  if (!Array.isArray(fieldVariants)) return [];
  const options = fieldVariants.filter(isRecord).flatMap(fieldVariantOptions);
  const unique = new Map<string, Record<string, unknown>>();
  for (const option of options) {
    const kind = kindOf(option);
    if (kind !== '') unique.set(kind, option);
  }
  return [...unique.values()];
};

const kindOf = (option: Record<string, unknown>): string => {
  if (!isRecord(option.properties) || !isRecord(option.properties.kind)) return '';
  const constant = option.properties.kind.const;
  return typeof constant === 'string' ? constant : '';
};

const requiredKeys = (option: Record<string, unknown>): readonly string[] => {
  const required = option.required;
  return Array.isArray(required) ? required.filter((item): item is string => typeof item === 'string') : [];
};

const kindRow = (option: Record<string, unknown>): string => {
  const kind = kindOf(option);
  if (kind === '') throw new Error('section-json: у варианта поля нет kind');
  const required = requiredKeys(option).filter((key) => key !== 'kind');
  const optional = isRecord(option.properties)
    ? Object.keys(option.properties).filter((key) => key !== 'kind' && !required.includes(key))
    : [];
  return `| \`${kind}\` | ${required.map((key) => `\`${key}\``).join(', ') || '—'} | ${optional.map((key) => `\`${key}\``).join(', ') || '—'} |`;
};

export function sectionJsonPage(): string {
  const schema: unknown = z.toJSONSchema(sectionManifestSchema, { io: 'input' });
  return [
    'Ключи файла `section.json` и формы полей каждого вида. Формат хранит та же схема, по которой работает проверка при сохранении.',
    '',
    '## Ключи',
    '',
    '| Ключ | Что значит |',
    '|---|---|',
    ...keyRows(),
    '',
    '## Виды полей',
    '',
    'Поле настройки — `{ "id", "label", "setting" }`; у `setting` — вид и его ключи.',
    '',
    '| Вид | Обязательные ключи | Необязательные ключи |',
    '|---|---|---|',
    ...settingOptions(schema).map(kindRow),
  ].join('\n');
}
