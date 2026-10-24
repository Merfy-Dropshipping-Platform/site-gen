import type { JsonSchema } from '@merfy/tokens';
import { z } from 'zod';
import { sectionManifestSchema } from '../format';
import { NAMES, type NamesDictionary, type SdkKind } from '../names';

// JSON Schema section.json (блок 3 «Секций и SDK», Р3.12): та же zod-схема формата, но каждое поле — anyOf вариантов
// по именам словаря: id — const с описанием имени, setting — только виды этого имени. Так в редакторе по "$schema"
// описание имени показывается при наведении, а чужой вид подчёркнут.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Объект с properties.id и properties.setting — поле настроек (секции или типа блока).
function isFieldObject(value: Record<string, unknown>): boolean {
  if (!isRecord(value.properties)) return false;
  return 'id' in value.properties && 'setting' in value.properties;
}

// Варианты вида из свойства setting поля: oneOf или anyOf.
function settingOptions(field: Record<string, unknown>): Record<string, unknown>[] {
  const setting = field.setting;
  if (!isRecord(setting)) return [];
  const options = setting.oneOf ?? setting.anyOf;
  return Array.isArray(options) ? options.filter(isRecord) : [];
}

const kindOf = (option: Record<string, unknown>): string | undefined => {
  if (!isRecord(option.properties)) return undefined;
  const kind = option.properties.kind;
  if (!isRecord(kind)) return undefined;
  return typeof kind.const === 'string' ? kind.const : undefined;
};

// Вариант поля на имя словаря: то же поле, но id — const имени с описанием, setting — только виды имени.
function variantOf(
  field: Record<string, unknown>,
  name: string,
  about: string,
  kinds: readonly SdkKind[],
): Record<string, unknown> {
  const properties = isRecord(field.properties) ? field.properties : {};
  const kindSet = new Set<string>(kinds);
  const options = settingOptions(properties).filter((option) => {
    const kind = kindOf(option);
    return kind !== undefined && kindSet.has(kind);
  });
  return {
    ...field,
    properties: {
      ...properties,
      id: { type: 'string', const: name, description: about },
      setting: { oneOf: options },
    },
  };
}

// Все варианты поля: имена словаря по порядку, у которых есть вид в формате этого поля.
function variantsOf(field: Record<string, unknown>, names: NamesDictionary): Record<string, unknown>[] {
  const options = settingOptions(isRecord(field.properties) ? field.properties : {});
  const formatKinds = new Set(options.map(kindOf).filter((kind): kind is string => kind !== undefined));
  return names.names
    .filter((entry) => entry.kinds.some((kind) => formatKinds.has(kind)))
    .map((entry) => variantOf(field, entry.name, entry.about, entry.kinds));
}

// anyOf без других ключей внутри anyOf равен одному списку: члены вложенного встают на его место. Так поле внутри
// объединения «поле или ссылка на общую настройку» раскрывается в варианты по именам без лишней вложенности.
const isOnlyAnyOf = (value: unknown): value is { anyOf: unknown[] } =>
  isRecord(value) && Object.keys(value).length === 1 && Array.isArray(value.anyOf);
const unwrapAnyOf = (member: unknown): unknown[] => (isOnlyAnyOf(member) ? member.anyOf : [member]);

// Заменяет каждое поле на anyOf вариантов по именам — во всём дереве схемы, включая поля типов блоков.
function withNameVariants(value: unknown, names: NamesDictionary): unknown {
  if (Array.isArray(value)) return value.map((item) => withNameVariants(item, names));
  if (!isRecord(value)) return value;
  const replaced = new Map(Object.entries(value).map(([key, child]) => [key, withNameVariants(child, names)]));
  const replacedObject = Object.fromEntries(replaced);
  if (isFieldObject(replacedObject)) return { anyOf: variantsOf(replacedObject, names) };
  const members = replacedObject.anyOf;
  return Array.isArray(members) ? { ...replacedObject, anyOf: members.flatMap(unwrapAnyOf) } : replacedObject;
}

export function sectionJsonSchema(
  names: NamesDictionary = NAMES,
  manifest: z.ZodType = sectionManifestSchema,
): JsonSchema {
  const schema: unknown = z.toJSONSchema(manifest, { io: 'input' });
  const withVariants: unknown = withNameVariants(schema, names);
  return isRecord(withVariants) ? withVariants : {};
}
