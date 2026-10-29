import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sectionFieldShape } from '../src/fields';
import { sectionManifestSchema } from '../src/format';
import { packageFiles } from '../src/generate/files';
import { namesMarkdown } from '../src/generate/names-markdown';
import { namesJsonSchema } from '../src/generate/names-schema';
import { GENERATED_NOTE } from '../src/generate/note';
import { sectionJsonSchema } from '../src/generate/section-schema';
import { sharedSettingsOf } from '../src/generate/shared';
import { NAMES, SDK_KINDS } from '../src/names';

const PANEL_URL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);
const panelRaw: unknown = JSON.parse(readFileSync(PANEL_URL, 'utf8'));

const fileText = (path: string): string => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

// Варианты вида в JSON Schema: { properties: { kind: { const } } }.
const optionsShape = z.array(z.object({ properties: z.object({ kind: z.object({ const: z.string() }) }) }));
const variantShape = z.object({
  properties: z.object({
    id: z.object({ const: z.string(), description: z.string() }),
    setting: z.object({ oneOf: optionsShape }),
  }),
});
const fieldShape = z.object({
  properties: z.object({ setting: z.union([z.object({ oneOf: optionsShape }), z.object({ anyOf: optionsShape })]) }),
});
const itemsShape = z.object({ properties: z.object({ settings: z.object({ items: z.unknown() }) }) });
const unionShape = z.object({ anyOf: z.array(z.unknown()) });
const referenceShape = z.object({ properties: z.object({ wrapper: z.unknown() }) });

// Члены списка settings.items: у формата без ссылок на общие настройки — сам элемент (поле) или варианты по именам
// словаря в anyOf; у формата с ссылками — варианты (или поле) и ссылки в одном списке anyOf, без вложенного.
const settingsMembers = (schema: unknown): unknown[] => {
  const { items } = itemsShape.parse(schema).properties.settings;
  const union = unionShape.safeParse(items);
  return union.success ? union.data.anyOf : [items];
};
const namedVariants = (schema: unknown) =>
  settingsMembers(schema).flatMap((member) => {
    const parsed = variantShape.safeParse(member);
    return parsed.success ? [parsed.data] : [];
  });
const otherMembers = (schema: unknown): unknown[] =>
  settingsMembers(schema).filter((member) => !variantShape.safeParse(member).success);
const kindsOfSchema = (schema: unknown): string[] =>
  settingsMembers(schema).flatMap((member) => {
    const parsed = fieldShape.safeParse(member);
    if (!parsed.success) return [];
    const { setting } = parsed.data.properties;
    return ('oneOf' in setting ? setting.oneOf : setting.anyOf).map((option) => option.properties.kind.const);
  });

const variants = namedVariants(sectionJsonSchema()).map(({ properties }) => ({
  id: properties.id.const,
  about: properties.id.description,
  kinds: properties.setting.oneOf.map((option) => option.properties.kind.const),
}));
const formatKinds = kindsOfSchema(z.toJSONSchema(sectionManifestSchema, { io: 'input' }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const childrenOf = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value.map((item: unknown) => item);
  return isRecord(value) ? Object.values(value) : [];
};
// Поле без имени из словаря: объект, у которого в properties есть setting, а у id нет const.
const isUnnamedField = (value: unknown): boolean =>
  isRecord(value) &&
  isRecord(value.properties) &&
  isRecord(value.properties.id) &&
  value.properties.id.const === undefined &&
  'setting' in value.properties;
const unnamedFields = (value: unknown): number =>
  (isUnnamedField(value) ? 1 : 0) + childrenOf(value).reduce((sum: number, child) => sum + unnamedFields(child), 0);

describe('сторож расхождения: generated/ = генерация в памяти', () => {
  it.each(Object.entries(packageFiles(panelRaw)))('%s', (path, text) => {
    expect(fileText(path), 'файл устарел — запустите: pnpm --dir packages/storefront-sections generate').toBe(text);
  });
});

describe('что внутри', () => {
  it('список сквозных — поля панели с shared, тот же, что у словаря', () => {
    expect(sharedSettingsOf(panelRaw)).toEqual(NAMES.shared);
  });

  it('section.schema.json: вариант на каждое имя, у которого вид есть в формате; виды — только его', () => {
    const expected = NAMES.names
      .filter((entry) => entry.kinds.some((kind) => formatKinds.includes(kind)))
      .map((entry) => [entry.name, entry.kinds.filter((kind) => formatKinds.includes(kind)).sort()]);
    expect(variants.map((variant) => [variant.id, [...variant.kinds].sort()])).toEqual(expected);
  });

  it('section.schema.json: описание варианта — about имени', () => {
    const about = new Map(NAMES.names.map((entry) => [entry.name, entry.about]));
    expect(variants.filter((variant) => about.get(variant.id) !== variant.about)).toEqual([]);
    expect(variants).toContainEqual({
      id: 'heading',
      about: 'Заголовок секции или блока; у «Страницы» — `<h1>`',
      kinds: ['string'],
    });
  });

  it('section.schema.json: полей без имени из словаря нет — ни у секции, ни у блоков; "$schema" можно', () => {
    expect(unnamedFields(sectionJsonSchema())).toBe(0);
    expect(sectionJsonSchema()).toMatchObject({ properties: { $schema: { type: 'string' } } });
  });

  it('names.schema.json: вид — из списка SDK, описание от трёх знаков', () => {
    expect(namesJsonSchema()).toMatchObject({
      properties: {
        names: {
          additionalProperties: {
            properties: { kinds: { items: { enum: [...SDK_KINDS] } }, about: { minLength: 3 } },
            required: ['kinds', 'label', 'group', 'about', 'asks'],
          },
        },
      },
    });
  });

  it('NAMES.md: шапка, таблица на группу, «Нет в словаре» — отказы и сквозные', () => {
    const markdown = namesMarkdown();
    expect(markdown.startsWith(`<!-- ${GENERATED_NOTE} -->\n# Имена полей секций\n\nПоле настройки секции`)).toBe(true);
    expect(markdown).toContain(
      '\n## Содержимое\n\n| Имя | Виды | Подпись | О чём |\n|---|---|---|---|\n' +
        '| `heading` | `string` | Заголовок | Заголовок секции или блока; у «Страницы» — `<h1>` |\n',
    );
    expect(markdown).toContain('\n| `text` | `text`, `richtext` | Текст | Основной текст секции или блока |\n');
    expect(markdown).toContain('\n## Нет в словаре\n\n| Имена | Что вместо |\n|---|---|\n');
    expect(markdown).toContain(
      '\n| `show-*`, `hide-*`, `visible`, `hidden` | Показать или скрыть часть секции — блок с `limit: 1`: его скрывают в конструкторе |\n',
    );
    expect(markdown).toContain(
      '\n| `cart-type` | Это настройка «Настроек темы» «Корзина → Вид корзины»; секция её читает: `"uses": ["theme"]`, ' +
        "в шаблоне `theme['cart-type']` |\n",
    );
    const lines = markdown.split('\n');
    expect(lines.filter((line) => line.startsWith('## '))).toEqual([
      '## Содержимое',
      '## Вид',
      '## Поведение',
      '## Своё имя секции',
      '## Нет в словаре',
    ]);
    // Блок 11, часть 11б: шесть новых имён — шесть строк таблиц; блок 10, часть 10б — сквозная wishlist-enabled;
    // блок 15, часть 15в: zoom; #372: layout и active-link; каталог: шесть имён карточки товара (cards, columns-mobile,
    // button-style, image-fit, swatches, favorite); первый экран: button-second-label и button-second-link.
    expect(lines.filter((line) => line.startsWith('| `'))).toHaveLength(74);
    expect(markdown.endsWith(' |\n')).toBe(true);
  });
});

// Формат со ссылками на общие настройки в settings (часть 5 блока 1): поле — один из членов union вместе со ссылкой.
describe('settings: поле или ссылка на общую настройку', () => {
  const reference = z.strictObject({ wrapper: z.enum(['scheme', 'padding']) });
  const withReferences = sectionManifestSchema.extend({
    settings: z.array(z.union([sectionFieldShape, reference])).default([]),
  });
  const schema = sectionJsonSchema(NAMES, withReferences);

  it('варианты по именам и ссылка — в одном списке anyOf, вложенного anyOf нет', () => {
    expect(namedVariants(schema).map(({ properties }) => properties.id.const)).toEqual(variants.map(({ id }) => id));
    const [only, ...rest] = otherMembers(schema);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ properties: { wrapper: { enum: ['scheme', 'padding'] } } });
  });

  it('виды каждого варианта те же, что в формате без ссылок', () => {
    const kinds = namedVariants(schema).map(({ properties }) =>
      properties.setting.oneOf.map((option) => option.properties.kind.const),
    );
    expect(kinds).toEqual(variants.map((variant) => variant.kinds));
  });

  it('полей без имени из словаря нет и в формате со ссылками', () => {
    expect(unnamedFields(schema)).toBe(0);
  });

  it('в схеме формата, кроме вариантов по именам, только ссылки на общие настройки', () => {
    const foreign = otherMembers(sectionJsonSchema()).filter((member) => !referenceShape.safeParse(member).success);
    expect(foreign).toEqual([]);
  });
});
