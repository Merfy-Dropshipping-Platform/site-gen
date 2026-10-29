import { describe, expect, it } from 'vitest';
import { readManifest } from '../src/format';
import { fieldRuleProblems } from '../src/field-rules';
import { isWarning, problem } from '../src/problems';
import type { RuleField, RuleSection } from '../src/rule-types';
import { sectionRecordKeys } from '../src/section-data';
import { disabledWhenIssues } from '../src/visibility';
import { resolveWrapperView, WRAPPER_FIELDS, wrapperFieldsOf } from '../src/wrapper';

// Общие правки каркаса для базовых секций (29.10): подпись «Добавить …» у типа блока (addTitle), неактивное поле
// (disabledWhen), умолчания, предел и шаг общих настроек секции (wrapperSpec), общая настройка «Ширина» (width).

const TOGGLE = {
  id: 'agreement',
  label: 'Согласие на рассылку',
  setting: { kind: 'toggle', default: false, labels: { on: 'Вкл', off: 'Выкл' } },
};
const TEXT = { id: 'agreement-text', label: 'Текст согласия', setting: { kind: 'text', default: 'Согласен' } };
const manifestOf = (extra: Record<string, unknown>) => ({
  sdk: 1,
  name: 'promo-banner',
  kind: 'section',
  title: 'Промо-баннер',
  settings: [],
  ...extra,
});
const textOf = (manifest: unknown): string => JSON.stringify(manifest, null, 2);
const read = (manifest: unknown) => readManifest({ 'section.json': textOf(manifest) });
const problems = (manifest: unknown): string[] => {
  const result = read(manifest);
  return result.ok ? [] : result.problems.map((item) => `${item.code} ${item.message}`);
};
const parsed = (manifest: unknown) => {
  const result = read(manifest);
  if (!result.ok) throw new Error(result.problems.map((item) => item.message).join('; '));
  return result.value;
};

describe('addTitle — подпись «Добавить …» у типа блока', () => {
  const withBlock = (block: Record<string, unknown>) =>
    manifestOf({ blocks: { button: { title: 'Кнопка', limit: 1, settings: [], ...block } } });

  it('необязательна; винительный падеж со строчной буквы проходит', () => {
    expect(problems(withBlock({}))).toEqual([]);
    expect(problems(withBlock({ addTitle: 'кнопку' }))).toEqual([]);
    expect(problems(withBlock({ addTitle: 'кнопку «Смотреть все»' }))).toEqual([]);
    expect(parsed(withBlock({ addTitle: 'кнопку' })).blocks?.button?.addTitle).toBe('кнопку');
  });

  it('с прописной буквы, со словом «Добавить» или пустая — отказ с путём', () => {
    const text = 'blocks.button.addTitle: подпись после «Добавить» в винительном падеже со строчной буквы';
    expect(problems(withBlock({ addTitle: 'Кнопку' }))[0]).toContain(`manifest-invalid ${text}`);
    expect(problems(withBlock({ addTitle: 'добавить кнопку' }))[0]).toContain(`manifest-invalid ${text}`);
    expect(problems(withBlock({ addTitle: '' }))[0]).toMatch(/^manifest-invalid blocks\.button\.addTitle: /);
  });
});

describe('disabledWhen — поле видно, но неактивно', () => {
  const field = (id: string, kind: string, disabledWhen?: RuleField['disabledWhen']): RuleField => ({
    id,
    label: id,
    disabledWhen,
    setting: { kind },
  });
  const sectionOf = (fields: RuleField[]): RuleSection => ({
    lists: [{ of: 'section', path: ['settings'], owner: 'секции', fields }],
    blocks: [],
  });

  it('по полю вида toggle со значением его вида — без проблем', () => {
    const fields = [
      field('agreement', 'toggle'),
      field('agreement-text', 'text', { setting: 'agreement', equals: false }),
    ];
    expect(disabledWhenIssues(sectionOf(fields))).toEqual([]);
  });

  it('цель не в списке, не того вида, не то значение, само поле — disabled-when-invalid с путём', () => {
    const fields = [
      field('agreement', 'toggle'),
      field('heading', 'string'),
      field('a', 'text', { setting: 'nothing', equals: true }),
      field('b', 'text', { setting: 'heading', equals: 'x' }),
      field('c', 'text', { setting: 'agreement', equals: 'off' }),
      field('d', 'toggle', { setting: 'd', equals: true }),
    ];
    expect(
      disabledWhenIssues(sectionOf(fields)).map((issue) => [issue.code, issue.path.join('.'), issue.message]),
    ).toEqual([
      [
        'disabled-when-invalid',
        'settings.2.disabledWhen',
        'поле `a`: условие ссылается на поле `nothing`, его нет среди полей секции',
      ],
      [
        'disabled-when-invalid',
        'settings.3.disabledWhen',
        'поле `b`: условие — только по полю вида `toggle`, `select`, `radio` или `alignment`, у `heading` — `string`',
      ],
      [
        'disabled-when-invalid',
        'settings.4.disabledWhen',
        'поле `c`: в условии `off`, у поля `agreement` значения — `true` или `false`',
      ],
      ['disabled-when-invalid', 'settings.5.disabledWhen', 'поле `d`: условие неактивности — по другому полю'],
    ]);
  });

  it('в section.json — у полей секции и блоков; проверка при сохранении даёт место в файле; код — отказ', () => {
    const good = manifestOf({ settings: [TOGGLE, { ...TEXT, disabledWhen: { setting: 'agreement', equals: false } }] });
    expect(problems(good)).toEqual([]);
    const bad = manifestOf({ settings: [TOGGLE, { ...TEXT, disabledWhen: { setting: 'agreement', equals: 'нет' } }] });
    // Имена agreement и agreement-text — свои имена «Подписки на рассылку», здесь их нет: смотрим только условия.
    const found = fieldRuleProblems(parsed(bad), textOf(bad)).filter((item) => item.code.endsWith('-when-invalid'));
    expect(found.map((item) => item.code)).toEqual(['disabled-when-invalid']);
    expect(found[0]?.line).toBeGreaterThan(0);
    expect(isWarning(problem('disabled-when-invalid', 'section.json', 'текст'))).toBe(false);
    expect(problems(manifestOf({ settings: [{ ...TEXT, disabledWhen: { setting: 'agreement' } }] }))[0]).toMatch(
      /^manifest-invalid settings\.0\.disabledWhen\.equals: /,
    );
  });
});

describe('wrapperSpec — умолчания, предел и шаг общих настроек секции', () => {
  const PROMO = manifestOf({
    wrapper: ['scheme', 'padding'],
    wrapperSpec: { scheme: { default: 'scheme-4' }, padding: { default: { top: 0, bottom: 0 } } },
  });

  it('без правки — умолчания секции: тёмная схема и без отступов, как у промо-баннера на проде', () => {
    expect(problems(PROMO)).toEqual([]);
    expect(resolveWrapperView(parsed(PROMO), undefined)).toEqual({
      view: { classes: ['color-scheme-4', 'pt-0', 'pb-0'], attributes: {} },
      invalid: [],
    });
  });

  it('правка экземпляра — поверх умолчаний секции; null у отступов — умолчание секции', () => {
    const manifest = parsed(PROMO);
    expect(resolveWrapperView(manifest, { scheme: 'scheme-2', padding: { top: 16, bottom: 24 } }).view.classes).toEqual(
      ['color-scheme-2', 'pt-4', 'pb-6'],
    );
    expect(resolveWrapperView(manifest, { scheme: '', padding: null }).view.classes).toEqual(['pt-0', 'pb-0']);
  });

  it('секция без wrapperSpec — как раньше: умолчания платформы (старые копии в магазинах)', () => {
    const plain = parsed(manifestOf({ wrapper: ['scheme', 'padding'] }));
    expect(resolveWrapperView(plain, undefined).view.classes).toEqual(['py-section']);
    expect(wrapperFieldsOf(plain)).toEqual(WRAPPER_FIELDS.slice(0, 2));
  });

  it('объявления секции: свои умолчание, предел и шаг поверх объявления платформы', () => {
    const header = parsed(
      manifestOf({
        wrapper: ['scheme', 'padding', 'sticky'],
        wrapperSpec: { padding: { default: { top: 8, bottom: 8 }, max: 64, step: 4 } },
      }),
    );
    expect(wrapperFieldsOf(header).map((field) => field.id)).toEqual(['scheme', 'padding', 'sticky']);
    expect(wrapperFieldsOf(header)[1]).toEqual({
      id: 'padding',
      label: 'Отступы',
      setting: { kind: 'padding', default: { top: 8, bottom: 8 }, max: 64, step: 4 },
    });
    expect(resolveWrapperView(header, { padding: { top: 68, bottom: 0 } }).invalid).toEqual([
      'padding: нужны два целых числа от 0 до 64, кратные 4, или null',
    ]);
  });

  it.each([
    [
      'настройки нет в списке wrapper',
      manifestOf({ wrapper: ['scheme'], wrapperSpec: { padding: { max: 64 } } }),
      'manifest-invalid wrapperSpec.padding: padding нет в списке wrapper секции',
    ],
    [
      'умолчание больше предела секции',
      manifestOf({ wrapperSpec: { padding: { default: { top: 80, bottom: 0 }, max: 64 } } }),
      'manifest-invalid wrapperSpec.padding.default: нужны два целых числа от 0 до 64, кратные 4, или null',
    ],
    [
      'id схемы не по форме',
      manifestOf({ wrapperSpec: { scheme: { default: 'Тёмная' } } }),
      'manifest-invalid wrapperSpec.scheme.default: нужно "" или id схемы',
    ],
    [
      'шаг не кратен 4',
      manifestOf({ wrapperSpec: { padding: { step: 6 } } }),
      'manifest-invalid wrapperSpec.padding.step: шаг кратен 4',
    ],
    [
      'лишний ключ',
      manifestOf({ wrapperSpec: { scheme: { default: '', max: 1 } } }),
      'manifest-invalid wrapperSpec.scheme',
    ],
    [
      'у глобального скрипта',
      { sdk: 1, name: 'geo', kind: 'global', title: 'Город', settings: [], wrapperSpec: {} },
      'manifest-invalid wrapperSpec: у глобального скрипта нет места на странице',
    ],
  ])('отказ: %s', (_name, manifest, expected) => {
    expect(problems(manifest)).toContainEqual(expect.stringContaining(expected));
  });
});

describe('width — общая настройка «Ширина»', () => {
  const IMAGE_TEXT = parsed(manifestOf({ wrapper: ['scheme', 'padding', 'width'], settings: [{ wrapper: 'width' }] }));

  it('«Большая» (по умолчанию) — ширина страницы темы, класса нет; «Средняя» и «Маленькая» — своя --width-page', () => {
    expect(resolveWrapperView(IMAGE_TEXT, undefined).view.classes).toEqual(['py-section']);
    expect(resolveWrapperView(IMAGE_TEXT, { width: 'medium' }).view.classes).toEqual([
      'py-section',
      '[--width-page:1024px]',
    ]);
    expect(resolveWrapperView(IMAGE_TEXT, { width: 'small' }).view.classes).toEqual([
      'py-section',
      '[--width-page:768px]',
    ]);
  });

  it('неизвестное значение — в invalid, ширина страницы остаётся; у секции без width в списке — в invalid', () => {
    expect(resolveWrapperView(IMAGE_TEXT, { width: 'full' })).toEqual({
      view: { classes: ['py-section'], attributes: {} },
      invalid: ['width: нужно small, medium или large'],
    });
    const plain = parsed(manifestOf({}));
    expect(resolveWrapperView(plain, { width: 'small' }).invalid).toEqual([
      'width: общей настройки нет в списке wrapper секции',
    ]);
  });

  it('секция ставит «Ширину» ссылкой; ширина своим полем по-прежнему отказ словаря', () => {
    expect(problems(manifestOf({ wrapper: ['width'], settings: [{ wrapper: 'width' }] }))).toEqual([]);
  });

  it('своё умолчание ширины — через wrapperSpec', () => {
    const narrow = parsed(manifestOf({ wrapper: ['width'], wrapperSpec: { width: { default: 'small' } } }));
    expect(resolveWrapperView(narrow, undefined).view.classes).toEqual(['[--width-page:768px]']);
  });
});

describe('товар и коллекция в полях блока', () => {
  const withField = (kind: string) =>
    manifestOf({
      blocks: {
        tile: { title: 'Элемент', limit: 3, settings: [{ id: kind, label: 'Выбор', setting: { kind } }] },
      },
    });

  it('product и collection в блоке — можно; blog, policy, hint и menu — только у секции', () => {
    expect(problems(withField('product'))).toEqual([]);
    expect(problems(withField('collection'))).toEqual([]);
    expect(problems(withField('blog'))).toEqual([
      'setting-invalid blocks.tile.settings.0: вид blog — только у настроек секции',
    ]);
  });

  it('во входы сборки — blockRecordFields по типам блоков; тип без таких полей не входит', () => {
    const manifest = parsed(
      manifestOf({
        blocks: {
          tile: {
            title: 'Элемент',
            limit: 3,
            settings: [
              { id: 'product', label: 'Выбор товара', setting: { kind: 'product' } },
              { id: 'collection', label: 'Выбор коллекции', setting: { kind: 'collection' } },
            ],
          },
          note: { title: 'Текст', limit: 1, settings: [TEXT] },
        },
      }),
    );
    expect(sectionRecordKeys(manifest)).toEqual({
      blockRecordFields: { tile: { product: 'product', collection: 'collection' } },
    });
    expect(sectionRecordKeys(parsed(manifestOf({})))).toEqual({});
  });
});
