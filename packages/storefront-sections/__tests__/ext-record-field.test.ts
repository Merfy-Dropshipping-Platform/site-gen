import { describe, expect, it } from 'vitest';
import { authorProblems } from '../src/author-rules';
import { extRecordSpec, extRecordText } from '../src/ext-record-field';
import { settingFieldsOf } from '../src/fields';
import { readManifest } from '../src/format';
import { nameIssue } from '../src/name-check';
import { SDK_KINDS, type OwnNames } from '../src/names';
import { resolveSectionSettings } from '../src/settings';

// Параметр секции «запись расширения» (ext-record): ссылка на запись из records манифеста расширения. Значение в ревизии —
// id записи, пусто — "" или null; умолчание — null. Расширение — test-ext.
const ITEM = {
  id: 'item',
  label: 'Запись',
  setting: { kind: 'ext-record', ext: 'test-ext', record: 'item', default: null },
};
const NAMES_OWN: OwnNames = {
  item: { kinds: ['ext-record'], label: 'Запись', about: 'Запись расширения для секции', asks: ['запись'] },
};
const manifestOf = (settings: unknown[], extra: object = {}) => ({
  sdk: 1,
  name: 'gallery',
  kind: 'section',
  title: 'Подборка',
  settings,
  ...extra,
});
const read = (manifest: unknown) => readManifest({ 'section.json': JSON.stringify(manifest) });
const problemsOf = (manifest: unknown): string[] => {
  const result = read(manifest);
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`);
};
function fieldsOf(settings: unknown[]) {
  const result = read(manifestOf(settings, { names: NAMES_OWN }));
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return settingFieldsOf(result.value.settings);
}

describe('вид ext-record', () => {
  it('вид есть в SDK_KINDS; умолчание — null, ключ default можно не писать', () => {
    expect(SDK_KINDS).toContain('ext-record');
    const fields = fieldsOf([{ ...ITEM, setting: { kind: 'ext-record', ext: 'test-ext', record: 'item' } }]);
    expect(fields.map((field) => [field.id, field.setting.kind, field.setting.default])).toEqual([
      ['item', 'ext-record', null],
    ]);
  });

  it('форма строгая: нужны ext и record; умолчание не null, лишний ключ, id расширения и вид не по правилам', () => {
    const bad = (setting: object) => ({ ...ITEM, setting });
    const settings = [
      bad({ kind: 'ext-record', record: 'item' }),
      bad({ kind: 'ext-record', ext: 'test-ext' }),
      bad({ kind: 'ext-record', ext: 'test-ext', record: 'item', default: 'r1' }),
      bad({ kind: 'ext-record', ext: 'test-ext', record: 'item', limit: 3 }),
      bad({ kind: 'ext-record', ext: 'Test-ext', record: 'item' }),
      bad({ kind: 'ext-record', ext: 'test-ext', record: 'my-item' }),
    ];
    const problems = problemsOf(manifestOf(settings, { names: NAMES_OWN }));
    expect(problems).toHaveLength(6);
    expect(problems.every((text) => text.startsWith('manifest-invalid settings.'))).toBe(true);
    expect(problems.map((text) => text.split(': ')[0])).toEqual([
      'manifest-invalid settings.0.setting.ext',
      'manifest-invalid settings.1.setting.record',
      'manifest-invalid settings.2.setting.default',
      'manifest-invalid settings.3.setting',
      'manifest-invalid settings.4.setting.ext',
      'manifest-invalid settings.5.setting.record',
    ]);
  });

  it('значения: id записи, пусто — "" или null; иначе — текст с id поля', () => {
    const fields = fieldsOf([ITEM]);
    const uuid = '019a2f4e-7c1d-7b3e-9a10-4f2d8e6c1b00';
    for (const value of ['rec-1', 'Подборка_2026', uuid, '', null]) {
      expect(resolveSectionSettings(fields, { item: value }).invalid).toEqual([]);
    }
    expect(resolveSectionSettings(fields, { item: 'a b' }).invalid).toEqual([
      'item: нужен id записи расширения: буквы, цифры, «-» и «_», до 200 знаков, или пусто',
    ]);
    expect(resolveSectionSettings(fields, { item: 7 }).invalid).toHaveLength(1);
    expect(resolveSectionSettings(fields, { item: 'a'.repeat(201) }).invalid).toHaveLength(1);
    expect(resolveSectionSettings(fields, { item: { id: 'r1' } }).invalid).toHaveLength(1);
  });

  it('значение попадает в шаблон и скрипт как есть — id строкой, запись при сборке не разворачивается', () => {
    const fields = fieldsOf([ITEM]);
    expect(resolveSectionSettings(fields, { item: 'rec-1' }).values).toEqual({ item: 'rec-1' });
    expect(resolveSectionSettings(fields, {}).values).toEqual({ item: null });
  });

  it('в блоке — только у настроек секции', () => {
    const manifest = manifestOf([], {
      names: NAMES_OWN,
      blocks: { card: { title: 'Карточка', limit: 4, settings: [ITEM] } },
    });
    expect(problemsOf(manifest)).toEqual(['setting-invalid blocks.card.settings.0: вид ext-record — только у настроек секции']);
  });

  it('имя из names секции с видом ext-record проходит; другой вид под тем же именем — setting-name-kind', () => {
    expect(problemsOf(manifestOf([ITEM], { names: NAMES_OWN }))).toEqual([]);
    expect(nameIssue('item', 'ext-record', NAMES_OWN)).toBeUndefined();
    expect(nameIssue('item', 'string', NAMES_OWN)?.code).toBe('setting-name-kind');
  });
});

describe('extRecordText и extRecordSpec', () => {
  it('значение: пусто, id; всё остальное — текст', () => {
    expect(extRecordText('item', null)).toBeUndefined();
    expect(extRecordText('item', '')).toBeUndefined();
    expect(extRecordText('item', 'r1')).toBeUndefined();
    expect(extRecordText('item', 'r 1')).toContain('item: нужен id записи расширения');
    expect(extRecordText('item', undefined)).toContain('item: нужен id записи расширения');
  });

  it('спецификация: разбор ключей', () => {
    expect(extRecordSpec.parse({ kind: 'ext-record', ext: 'test-ext', record: 'item' })).toEqual({
      kind: 'ext-record',
      ext: 'test-ext',
      record: 'item',
      default: null,
    });
    expect(extRecordSpec.safeParse({ kind: 'ext-record', ext: 'te', record: 'item' }).success).toBe(false);
  });
});

describe('секция расширения выбирает записи только своего расширения', () => {
  const section = (ext: string) => {
    const result = read(manifestOf([{ ...ITEM, setting: { ...ITEM.setting, ext } }], { names: NAMES_OWN }));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    return result.value;
  };

  it('свой ext — можно; чужой — ext-foreign с id поля', () => {
    expect(authorProblems(section('test-ext'), 'test-ext')).toEqual([]);
    const foreign = authorProblems(section('other-ext'), 'test-ext');
    expect(foreign.map((item) => item.code)).toEqual(['ext-foreign']);
    expect(foreign[0].message).toContain('item');
    expect(foreign[0].message).toContain('other-ext');
  });

  it('секция магазина выбирает записи любого расширения', () => {
    expect(authorProblems(section('other-ext'), 'shop')).toEqual([]);
  });
});
