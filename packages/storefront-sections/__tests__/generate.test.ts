import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
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
// Часть 5 (Р1-5-5): элемент settings — поле или ссылка; варианты имён — внутри ветки поля.
const namedShape = z.object({
  properties: z.object({
    settings: z.object({
      items: z.object({
        anyOf: z.array(z.union([z.object({ anyOf: z.array(variantShape) }), z.object({ properties: z.unknown() })])),
      }),
    }),
  }),
});
// Часть 5 (Р1-5-5): элемент settings — поле или ссылка, поэтому items — объединение anyOf; setting — у ветки поля.
const formatShape = z.object({
  properties: z.object({
    settings: z.object({
      items: z.object({
        anyOf: z.array(
          z.union([
            z.object({
              properties: z.object({
                setting: z.union([z.object({ oneOf: optionsShape }), z.object({ anyOf: optionsShape })]),
              }),
            }),
            z.object({ properties: z.object({ wrapper: z.unknown() }) }),
          ]),
        ),
      }),
    }),
  }),
});

const namedVariants = namedShape.parse(sectionJsonSchema()).properties.settings.items.anyOf;
const variants = namedVariants
  .filter((branch): branch is { anyOf: z.infer<typeof variantShape>[] } => 'anyOf' in branch)
  .flatMap((branch) => branch.anyOf)
  .map(({ properties }) => ({
    id: properties.id.const,
    about: properties.id.description,
    kinds: properties.setting.oneOf.map((option) => option.properties.kind.const),
  }));
const formatItems = formatShape.parse(z.toJSONSchema(sectionManifestSchema, { io: 'input' })).properties.settings.items;
const formatKinds = formatItems.anyOf.flatMap((variant) => {
  if (!('setting' in variant.properties)) return [];
  const setting = variant.properties.setting;
  return ('oneOf' in setting ? setting.oneOf : setting.anyOf).map((option) => option.properties.kind.const);
});

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
      '## Нет в словаре',
    ]);
    expect(lines.filter((line) => line.startsWith('| `'))).toHaveLength(51);
    expect(markdown.endsWith(' |\n')).toBe(true);
  });
});
