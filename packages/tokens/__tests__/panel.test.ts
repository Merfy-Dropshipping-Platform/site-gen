import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { fieldVisible, panelFields, settingFields, tokenFields } from '../src/panel/fields';
import { panelForTheme, parsePanel } from '../src/panel/panel';
import type { PanelSchema } from '../src/panel/types';
import { problemsOf } from './support';

// Сырой JSON, который тест портит как хочет: поля — просто объекты.
type RawField = Record<string, unknown>;
type RawGroup = {
  id: string;
  title: string;
  layout?: string;
  fields: RawField[];
  sidebar?: { title: string; fields: RawField[] };
};
type RawPanel = { v: number; groups: RawGroup[] };

// Маленькая схема панели: ползунок, выбор, цвет в группе схем, переключатель и поле, видимое по условию.
const smallPanel = (): RawPanel => ({
  v: 1,
  groups: [
    {
      id: 'buttons',
      title: 'Кнопки',
      fields: [
        {
          id: 'button-radius',
          label: 'Скругление',
          token: 'radius-button',
          control: 'slider',
          range: { min: 0, max: 100, step: 4 },
        },
        {
          id: 'card-style',
          label: 'Стиль',
          token: 'choice-card-style',
          control: 'segment',
          options: [
            { value: 'standard', label: 'Стандарт' },
            { value: 'card', label: 'Карточка' },
          ],
        },
      ],
    },
    {
      id: 'colors',
      title: 'Цвета',
      layout: 'schemes',
      fields: [{ id: 'scheme-primary', label: 'Фон', section: 'Основная кнопка', token: 'primary', control: 'color' }],
    },
    {
      id: 'banner',
      title: 'Баннер',
      fields: [
        {
          id: 'banner-enabled',
          label: 'Баннер cookie',
          setting: { kind: 'toggle', default: true, labels: { on: 'Вкл', off: 'Выкл' } },
        },
        {
          id: 'banner-scheme',
          label: 'Цветовая схема',
          token: 'scheme-cookie-banner',
          control: 'scheme',
          visibleWhen: { setting: 'banner-enabled', equals: true },
        },
      ],
      sidebar: {
        title: 'Баннер',
        fields: [{ id: 'banner-title', label: 'Заголовок', setting: { kind: 'string', default: '' } }],
      },
    },
  ],
});

const panelProblems = (raw: unknown): readonly string[] =>
  problemsOf('panel-invalid', () => parsePanel(raw, platformDictionary));

describe('parsePanel: форма', () => {
  it('годная схема проходит, поля сайдбара — в общем списке после полей группы', () => {
    const panel = parsePanel(smallPanel(), platformDictionary);
    expect(panelFields(panel).map((field) => field.id)).toEqual([
      'button-radius',
      'card-style',
      'scheme-primary',
      'banner-enabled',
      'banner-scheme',
      'banner-title',
    ]);
    expect(tokenFields(panel)).toHaveLength(4);
    expect(settingFields(panel).map((field) => field.id)).toEqual(['banner-enabled', 'banner-title']);
  });

  it('поле и с токеном, и с настройкой — проблема формы с путём до поля', () => {
    const raw = smallPanel();
    raw.groups[2].sidebar = {
      title: 'Баннер',
      fields: [{ id: 'banner-title', label: 'Заголовок', setting: { kind: 'string', default: '' }, token: 'primary' }],
    };
    expect(panelProblems(raw)).toEqual([expect.stringMatching(/^panel\.groups\.2\.sidebar\.fields\.0: /)]);
  });

  it('поле без токена и без настройки — проблема формы', () => {
    const raw = { v: 1, groups: [{ id: 'empty', title: 'Пусто', fields: [{ id: 'nothing', label: 'Ничего' }] }] };
    expect(panelProblems(raw)).toEqual([expect.stringMatching(/^panel\.groups\.0\.fields\.0: /)]);
  });

  it('версия формата — только 1', () => {
    expect(panelProblems({ ...smallPanel(), v: 2 })).toEqual([expect.stringMatching(/^panel\.v: /)]);
  });
});

describe('parsePanel: смысл', () => {
  it('токена нет в словаре', () => {
    const raw = smallPanel();
    raw.groups[0].fields[0].token = 'radius-buton';
    expect(panelProblems(raw)).toEqual(['button-radius: токена radius-buton нет в словаре']);
  });

  it('поле не подходит виду токена', () => {
    const raw = smallPanel();
    raw.groups[0].fields[0].control = 'color';
    expect(panelProblems(raw)).toEqual(['button-radius: поле color не подходит токену вида radius']);
  });

  it('ползунок без диапазона и диапазон вне пределов вида', () => {
    const noRange = smallPanel();
    delete noRange.groups[0].fields[0].range;
    expect(panelProblems(noRange)).toEqual(['button-radius: у ползунка нужен диапазон { min, max, step }']);
    const outside = smallPanel();
    outside.groups[0].fields[0].range = { min: 50, max: 1200, step: 4 };
    expect(panelProblems(outside)).toEqual([
      'button-radius: 1200 вне пределов radius — нужно от 0 до 999 px или { min, max }, min ≤ max',
    ]);
  });

  it('min не меньше max', () => {
    const raw = smallPanel();
    raw.groups[0].fields[0].range = { min: 8, max: 8, step: 4 };
    expect(panelProblems(raw)).toEqual(['button-radius: min диапазона меньше max']);
  });

  it('варианты выбора — ровно значения токена; у ползунка вариантов нет', () => {
    const raw = smallPanel();
    raw.groups[0].fields[1].options = [{ value: 'standard', label: 'Стандарт' }];
    raw.groups[0].fields[0].options = [{ value: 'x', label: 'X' }];
    expect(panelProblems(raw)).toEqual([
      'button-radius: варианты — только у выбора',
      'card-style: варианты — ровно значения токена: standard, card',
    ]);
  });

  it('диапазон только у ползунка', () => {
    const raw = smallPanel();
    raw.groups[0].fields[1].range = { min: 0, max: 1, step: 1 };
    expect(panelProblems(raw)).toEqual(['card-style: диапазон — только у ползунка']);
  });

  it('id — kebab-case и не повторяются', () => {
    const raw = smallPanel();
    raw.groups[0].fields[1].id = 'button-radius';
    raw.groups[1].id = 'Colors';
    expect(panelProblems(raw)).toEqual(['Colors: id — kebab-case латиницей', 'button-radius: id повторяется']);
  });

  it('условие видимости — на существующую настройку и годным значением', () => {
    const missing = smallPanel();
    missing.groups[2].fields[1].visibleWhen = { setting: 'cart-type', equals: true };
    expect(panelProblems(missing)).toEqual(['banner-scheme: условие ссылается на настройку cart-type, её нет']);
    const wrongValue = smallPanel();
    wrongValue.groups[2].fields[1].visibleWhen = { setting: 'banner-enabled', equals: 'да' };
    expect(panelProblems(wrongValue)).toEqual(['banner-scheme: значение условия: нужно true или false']);
  });

  it('умолчание настройки — по правилам её типа; варианты не повторяются', () => {
    const raw = smallPanel();
    raw.groups[2].sidebar = {
      title: 'Баннер',
      fields: [
        {
          id: 'banner-title',
          label: 'Место',
          setting: {
            kind: 'select',
            default: 'top',
            options: [
              { value: 'left', label: 'Слева' },
              { value: 'left', label: 'Слева' },
            ],
          },
        },
      ],
    };
    expect(panelProblems(raw)).toEqual([
      'banner-title: варианты повторяются',
      'banner-title: умолчание: нужно left или left',
    ]);
  });

  it('в группе схем — только поля цвета', () => {
    const raw = smallPanel();
    raw.groups[0].layout = 'schemes';
    expect(panelProblems(raw)).toEqual([
      'button-radius: в группе схем только поля цвета',
      'card-style: в группе схем только поля цвета',
    ]);
  });
});

describe('fieldVisible', () => {
  const panel: PanelSchema = parsePanel(smallPanel(), platformDictionary);
  const scheme = tokenFields(panel).find((field) => field.id === 'banner-scheme');

  it('поле без условия видно всегда, с условием — когда настройка равна значению', () => {
    expect(fieldVisible(panelFields(panel)[0], {})).toBe(true);
    expect(scheme && fieldVisible(scheme, { 'banner-enabled': true })).toBe(true);
    expect(scheme && fieldVisible(scheme, { 'banner-enabled': false })).toBe(false);
  });
});

describe('panelForTheme: тема скрывает поля (theme.json → panel.hidden)', () => {
  const panel = parsePanel(smallPanel(), platformDictionary);

  it('без panel в theme.json — панель целиком', () => {
    expect(panelForTheme(panel, undefined)).toEqual(panel);
  });

  it('скрытое поле убрано; группа без полей — тоже; пустой сайдбар — тоже', () => {
    const themed = panelForTheme(panel, { hidden: ['scheme-primary', 'banner-title'] });
    expect(themed.groups.map((group) => group.id)).toEqual(['buttons', 'banner']);
    expect(themed.groups[1].sidebar).toBeUndefined();
    expect(panelFields(themed).map((field) => field.id)).toEqual([
      'button-radius',
      'card-style',
      'banner-enabled',
      'banner-scheme',
    ]);
  });

  it('скрыть можно и поле настройки; сайдбар с полями остаётся', () => {
    const themed = panelForTheme(panel, { hidden: ['banner-enabled', 'banner-scheme'] });
    expect(themed.groups[2].fields).toEqual([]);
    expect(themed.groups[2].sidebar?.fields.map((field) => field.id)).toEqual(['banner-title']);
  });

  it('незнакомое поле и лишний ключ — ошибка panel-invalid', () => {
    expect(problemsOf('panel-invalid', () => panelForTheme(panel, { hidden: ['logo-image'] }))).toEqual([
      'panel.hidden: поля logo-image нет в панели',
    ]);
    expect(problemsOf('panel-invalid', () => panelForTheme(panel, { show: [] }))).toEqual([
      expect.stringMatching(/^panel: /),
    ]);
  });
});
