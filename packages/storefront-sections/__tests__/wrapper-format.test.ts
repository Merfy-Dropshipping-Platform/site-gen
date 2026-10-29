import { describe, expect, it } from 'vitest';
import { settingFieldsOf } from '../src/fields';
import { readManifest } from '../src/format';
import { fieldRuleProblems } from '../src/field-rules';
import { WRAPPER_FIELDS, wrapperIdsOf } from '../src/wrapper';

// Ключ wrapper и ссылки { "wrapper": "<id>" } в settings (часть 5 блока 1 «Секций и SDK», Р1-5-5).
const LOGO = {
  id: 'logo-position',
  label: 'Положение логотипа',
  setting: {
    kind: 'select',
    default: 'top-left',
    options: [
      { value: 'top-left', label: 'Слева' },
      { value: 'top-center', label: 'По центру' },
    ],
  },
};
const MENU_TYPE = {
  id: 'menu-type',
  label: 'Тип меню',
  setting: {
    kind: 'select',
    default: 'dropdown',
    options: [
      { value: 'dropdown', label: 'Выпадающее' },
      { value: 'sidebar', label: 'Боковое' },
    ],
  },
};
const manifestOf = (extra: Record<string, unknown>) => ({
  sdk: 1,
  name: 'header',
  kind: 'section',
  title: 'Шапка',
  ...extra,
});
const textOf = (manifest: unknown): string => JSON.stringify(manifest, null, 2);
const read = (manifest: unknown) => readManifest({ 'section.json': textOf(manifest) });
const problems = (manifest: unknown): string[] => {
  const result = read(manifest);
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`);
};
const HEADER = manifestOf({
  wrapper: ['scheme', 'padding', 'sticky'],
  settings: [LOGO, { wrapper: 'sticky' }, { wrapper: 'scheme' }, { wrapper: 'padding' }, MENU_TYPE],
});

describe('объявление общих настроек', () => {
  it('четыре поля: схема, отступы, закрепление, ширина — подписи и формы из design.md 3.15, блока 7 и прода', () => {
    expect(WRAPPER_FIELDS.map((field) => [field.id, field.label, field.setting.kind])).toEqual([
      ['scheme', 'Цветовая схема', 'color-scheme'],
      ['padding', 'Отступы', 'padding'],
      ['sticky', 'Статичность', 'select'],
      ['width', 'Ширина', 'select'],
    ]);
    // «Ширина» — как у «Изображения с текстом» на проде: маленькая, средняя, большая; по умолчанию большая.
    expect(WRAPPER_FIELDS[3]?.setting).toMatchObject({
      default: 'large',
      options: [
        { value: 'small', label: 'Маленькая' },
        { value: 'medium', label: 'Средняя' },
        { value: 'large', label: 'Большая' },
      ],
    });
    expect(WRAPPER_FIELDS[1]?.setting).toMatchObject({ default: null, max: 160, step: 8 });
    expect(WRAPPER_FIELDS[2]?.setting).toMatchObject({
      default: 'scroll-up',
      options: [
        { value: 'none', label: 'Никогда' },
        { value: 'scroll-up', label: 'При прокрутке вверх' },
        { value: 'always', label: 'Всегда' },
      ],
    });
  });

  it('список секции: нет ключа — схема и отступы; пустой список — нет общих настроек', () => {
    const plain = read(manifestOf({ settings: [LOGO] }));
    const none = read(manifestOf({ wrapper: [], settings: [LOGO] }));
    expect(plain.ok && wrapperIdsOf(plain.value)).toEqual(['scheme', 'padding']);
    expect(none.ok && wrapperIdsOf(none.value)).toEqual([]);
  });
});

describe('ключ wrapper и ссылки в settings', () => {
  it('«Шапка» как на проде проходит; поля без ссылок — settingFieldsOf', () => {
    expect(problems(HEADER)).toEqual([]);
    const result = read(HEADER);
    expect(result.ok && settingFieldsOf(result.value.settings).map((field) => field.id)).toEqual([
      'logo-position',
      'menu-type',
    ]);
  });

  it.each([
    ['неизвестный id в wrapper', manifestOf({ wrapper: ['margin'], settings: [] }), /^manifest-invalid wrapper\.0: /],
    ['id в wrapper дважды', manifestOf({ wrapper: ['scheme', 'scheme'], settings: [] }), /^manifest-invalid wrapper: /],
    [
      'ссылка на id вне списка wrapper',
      manifestOf({ wrapper: ['scheme'], settings: [{ wrapper: 'sticky' }] }),
      /^manifest-invalid settings\.0\.wrapper: .*sticky.*wrapper/,
    ],
    [
      'та же ссылка дважды',
      manifestOf({ wrapper: ['scheme'], settings: [{ wrapper: 'scheme' }, LOGO, { wrapper: 'scheme' }] }),
      /^manifest-invalid settings\.2\.wrapper: /,
    ],
    ['ссылка на неизвестный id', manifestOf({ settings: [{ wrapper: 'margin' }] }), /^manifest-invalid settings\.0/],
    [
      'ссылка на «Ширину» вне списка wrapper',
      manifestOf({ settings: [{ wrapper: 'width' }] }),
      /^manifest-invalid settings\.0\.wrapper: width нет в списке wrapper секции/,
    ],
    [
      'ссылка и поле в одном элементе',
      manifestOf({ settings: [{ ...LOGO, wrapper: 'scheme' }] }),
      /^manifest-invalid settings\.0/,
    ],
    [
      'ссылка в настройках блока',
      manifestOf({ blocks: { item: { title: 'Пункт', limit: 3, settings: [{ wrapper: 'scheme' }] } } }),
      /^manifest-invalid blocks\.item\.settings\.0/,
    ],
    [
      'wrapper у глобального скрипта',
      { sdk: 1, name: 'geo', kind: 'global', title: 'Город', settings: [], wrapper: ['scheme'] },
      /^manifest-invalid wrapper: у глобального скрипта/,
    ],
  ])('отказ: %s — с путём', (_name, manifest, expected) => {
    const found = problems(manifest);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatch(expected);
  });

  it('ошибки обычных полей — прежние тексты, а не «Invalid input» объединения', () => {
    const found = problems(manifestOf({ settings: [{ ...LOGO, setting: { kind: 'select', default: 'top-left' } }] }));
    expect(found.join('\n')).not.toMatch(/: (Invalid input|Неверный ввод)$/);
    expect(found[0]).toMatch(/^manifest-invalid settings\.0\.setting\./);
  });

  it('правила полей: номер поля в пути — номер элемента settings, ссылки на него не влияют', () => {
    const manifest = manifestOf({
      wrapper: ['scheme', 'padding', 'sticky'],
      settings: [{ wrapper: 'sticky' }, { wrapper: 'scheme' }, { ...LOGO, id: 'logoPosition' }],
    });
    const text = textOf(manifest);
    const result = read(manifest);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    const found = fieldRuleProblems(result.value, text);
    expect(found).toHaveLength(1);
    // «logoPosition» — третий элемент settings: строка и столбец указывают на него, а не на второй.
    const lines = text.split('\n');
    expect(lines[(found[0]?.line ?? 1) - 1]).toContain('logoPosition');
  });
});
