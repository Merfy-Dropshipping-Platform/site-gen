import { describe, expect, it } from 'vitest';
import { sectionSettingProblem, type SectionField } from '../src/fields';
import { readManifest } from '../src/format';
import { emptySettings, resolveSectionSettings } from '../src/settings';

// Виды полей части 5 блока 1 «Секций и SDK» (design.md 3.14, Р1-5-2, Р1-5-3): форма в section.json, проверка значения,
// пустое значение. Имена полей словарь не проверяет: он работает в prepareSection, не в readManifest.
// Константы полей типизированы SectionField (пакет запрещает приведение типов в тестах, как в Уточнении 23.10).
const IMAGES: SectionField = {
  id: 'images',
  label: 'Изображения',
  setting: { kind: 'image-pair', default: { url1: '', url2: '' }, maxBytes: 2_097_152 },
};
const HEIGHT: SectionField = {
  id: 'height',
  label: 'Высота',
  setting: {
    kind: 'radio',
    default: 'large',
    options: [
      { value: 'small', label: 'Маленькая' },
      { value: 'large', label: 'Большая' },
    ],
  },
};
const OVERLAY: SectionField = {
  id: 'overlay',
  label: 'Затемнение',
  setting: { kind: 'range', default: 30, min: 0, max: 100, step: 5 },
};
const ALIGN: SectionField = { id: 'align', label: 'Выравнивание', setting: { kind: 'alignment', default: 'center' } };
const TINT: SectionField = { id: 'tint', label: 'Цветовая схема', setting: { kind: 'color-scheme', default: '' } };
const SPACE: SectionField = {
  id: 'space',
  label: 'Отступы',
  setting: { kind: 'padding', default: null, max: 120, step: 8 },
};
const TITLE: SectionField = {
  id: 'heading',
  label: 'Заголовок',
  setting: { kind: 'string', default: 'Шарфы', ai: 'title' },
};
const BODY: SectionField = {
  id: 'body',
  label: 'Текст',
  setting: { kind: 'text', default: 'Тёплые', ai: 'description' },
};

const withSetting = (field: SectionField, change: object): object => ({
  ...field,
  setting: { ...field.setting, ...change },
});
const read = (...settings: unknown[]) =>
  readManifest({
    'section.json': JSON.stringify({ sdk: 1, name: 'probe', kind: 'section', title: 'Проба', settings }),
  });
const problems = (...settings: unknown[]): string[] => {
  const result = read(...settings);
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`);
};

describe('форма полей в section.json', () => {
  it('все новые виды и ai проходят', () => {
    expect(problems(IMAGES, HEIGHT, OVERLAY, ALIGN, TINT, SPACE, TITLE, BODY)).toEqual([]);
  });

  it.each<[string, object]>([
    ['image-pair без url2', withSetting(IMAGES, { default: { url1: '' } })],
    ['image-pair без maxBytes', withSetting(IMAGES, { maxBytes: undefined })],
    ['image-pair с лишним ключом', withSetting(IMAGES, { default: { url1: '', url2: '', url3: '' } })],
    ['radio с одним вариантом', withSetting(HEIGHT, { options: [{ value: 'small', label: 'Маленькая' }] })],
    ['radio: умолчание не из вариантов', withSetting(HEIGHT, { default: 'huge' })],
    ['range: min не меньше max', withSetting(OVERLAY, { min: 10, max: 10 })],
    ['range: умолчание больше max', withSetting(OVERLAY, { default: 105 })],
    ['range: умолчание не на шаге', withSetting(OVERLAY, { default: 33 })],
    ['range: шаг ноль', withSetting(OVERLAY, { step: 0 })],
    ['alignment: умолчание не из трёх', withSetting(ALIGN, { default: 'justify' })],
    ['color-scheme: умолчание не id схемы', withSetting(TINT, { default: 'Схема 2' })],
    ['padding: умолчание не кратно 4', withSetting(SPACE, { default: { top: 3, bottom: 0 } })],
    ['padding: нет bottom', withSetting(SPACE, { default: { top: 0 } })],
    ['padding: шаг не кратен 4', withSetting(SPACE, { step: 6 })],
    ['padding: max больше 200', withSetting(SPACE, { max: 240 })],
    ['ai не из двух', withSetting(TITLE, { ai: 'headline' })],
    ['ai у вида url', { id: 'link', label: 'Ссылка', setting: { kind: 'url', default: '', ai: 'title' } }],
  ])('отказ: %s — с путём к полю', (_name, field) => {
    const found = problems(field);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatch(/^(manifest|setting)-invalid settings\.0\./);
  });
});

describe('значения по виду', () => {
  const ok: [SectionField, unknown][] = [
    [IMAGES, { url1: '', url2: 'https://cdn.example/a.jpg' }],
    [HEIGHT, 'small'],
    [OVERLAY, 45],
    [ALIGN, 'right'],
    [TINT, 'scheme-2'],
    [TINT, ''],
    [SPACE, null],
    [SPACE, { top: 40, bottom: 80 }],
  ];
  const bad: [SectionField, unknown][] = [
    [IMAGES, { url1: 'javascript:alert(1)', url2: '' }],
    [IMAGES, 'https://cdn.example/a.jpg'],
    [HEIGHT, 'huge'],
    [OVERLAY, 33],
    [OVERLAY, 105],
    [OVERLAY, '30'],
    [ALIGN, 'justify'],
    [TINT, 'Схема 2'],
    [TINT, 2],
    [SPACE, { top: 41, bottom: 80 }],
    [SPACE, { top: 40, bottom: 130 }],
    [SPACE, { top: 40 }],
    [SPACE, 40],
  ];

  it.each(ok)('%j — годится значение %j', (field, value) => {
    expect(sectionSettingProblem('v', field.setting, value)).toBeUndefined();
  });

  it.each(bad)('%j — не годится значение %j: текст с путём', (field, value) => {
    expect(sectionSettingProblem('v', field.setting, value)).toMatch(/^v: нужн/);
  });

  it('resolveSectionSettings: числа, объекты и null сохраняются; неверные — умолчание и текст', () => {
    const fields = [IMAGES, OVERLAY, SPACE, TITLE];
    const images = { url1: 'https://cdn.example/a.jpg', url2: '' };
    const good = resolveSectionSettings(fields, { overlay: 55, space: { top: 40, bottom: 80 }, images });
    expect(good.invalid).toEqual([]);
    expect(good.values).toMatchObject({ overlay: 55, space: { top: 40, bottom: 80 }, images });
    const bad = resolveSectionSettings(fields, { overlay: 33, heading: 5 });
    expect(bad.values).toMatchObject({ overlay: 30, heading: 'Шарфы' });
    expect(bad.invalid.map((text) => text.split(':')[0])).toEqual(['overlay', 'heading']);
  });

  it('пустое значение: у image-pair — две пустые строки, у остальных новых видов — умолчание', () => {
    const fields = [IMAGES, OVERLAY, SPACE, TITLE];
    expect(emptySettings(fields)).toEqual({ images: { url1: '', url2: '' }, overlay: 30, space: null, heading: '' });
  });
});
