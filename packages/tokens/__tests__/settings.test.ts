import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { parsePanel } from '../src/panel/panel';
import { parseSettingsEdits, readSettingsEdits, resolveSettings, settingProblem } from '../src/panel/settings';
import { problemsOf } from './support';

// Все шесть типов настроек одной группой (design.md блока 8, раздел 4, 09.10).
const panel = parsePanel(
  {
    v: 1,
    groups: [
      {
        id: 'all-kinds',
        title: 'Все типы',
        fields: [
          { id: 'logo-image', label: 'Картинка', setting: { kind: 'image', default: '', maxBytes: 512000 } },
          {
            id: 'social-telegram',
            label: 'Telegram',
            setting: { kind: 'url', default: '', placeholder: 'https://t.me/...' },
          },
          { id: 'banner-title', label: 'Заголовок', setting: { kind: 'string', default: '' } },
          { id: 'banner-text', label: 'Текст', setting: { kind: 'text', default: 'Мы используем cookie.' } },
          {
            id: 'cart-type',
            label: 'Вид корзины',
            control: 'segment',
            setting: {
              kind: 'select',
              default: 'drawer',
              options: [
                { value: 'drawer', label: 'Сайдбар' },
                { value: 'page', label: 'Страница' },
              ],
            },
          },
          {
            id: 'banner-enabled',
            label: 'Баннер cookie',
            setting: { kind: 'toggle', default: true, labels: { on: 'Вкл', off: 'Выкл' } },
          },
        ],
      },
    ],
  },
  platformDictionary,
);

describe('resolveSettings: умолчание платформы ⊕ правка мерчанта', () => {
  it('без правок — умолчания всех настроек', () => {
    expect(resolveSettings(panel, {})).toEqual({
      'logo-image': '',
      'social-telegram': '',
      'banner-title': '',
      'banner-text': 'Мы используем cookie.',
      'cart-type': 'drawer',
      'banner-enabled': true,
    });
  });

  it('правка главнее умолчания; пустая строка — тоже правка', () => {
    const settings = resolveSettings(panel, { 'cart-type': 'page', 'banner-text': '', 'banner-enabled': false });
    expect(settings['cart-type']).toBe('page');
    expect(settings['banner-text']).toBe('');
    expect(settings['banner-enabled']).toBe(false);
  });
});

describe('parseSettingsEdits: что можно в значении', () => {
  it('годные правки проходят как есть, пустые строки — годные', () => {
    const edits = {
      'logo-image': 'https://minio.merfy.ru/merfy-sites/logo.png',
      'social-telegram': 't.me/shop',
      'banner-title': '',
      'banner-text': '',
      'cart-type': 'page',
      'banner-enabled': false,
    };
    expect(parseSettingsEdits(panel, edits)).toEqual(edits);
    expect(parseSettingsEdits(panel, { 'logo-image': '' })).toEqual({ 'logo-image': '' });
  });

  it('каждая проблема называет настройку и что можно', () => {
    const problems = problemsOf('settings-invalid', () =>
      parseSettingsEdits(panel, {
        'logo-image': 'javascript:alert(1)',
        'cart-type': 'modal',
        'banner-enabled': 'да',
        'banner-title': 'x'.repeat(201),
        'banner-text': 'x'.repeat(2001),
        'social-telegram': 'x'.repeat(2049),
        'logo-width': 120,
      }),
    );
    expect(problems).toEqual([
      'settings.logo-image: нужно пусто или адрес http(s):// до 2048 знаков',
      'settings.cart-type: нужно drawer или page',
      'settings.banner-enabled: нужно true или false',
      'settings.banner-title: нужно строка до 200 знаков',
      'settings.banner-text: нужно текст до 2000 знаков',
      'settings.social-telegram: нужно строка до 2048 знаков',
      'settings.logo-width: такой настройки нет в панели',
    ]);
  });

  it('не объект — проблема формы', () => {
    expect(readSettingsEdits(panel, ['cart-type']).problems).toEqual([expect.stringMatching(/^settings: /)]);
    expect(readSettingsEdits(panel, ['cart-type']).edits).toEqual({});
  });
});

describe('settingProblem', () => {
  it('годное значение — без проблемы', () => {
    expect(settingProblem('x', { kind: 'toggle', default: true, labels: { on: 'Вкл', off: 'Выкл' } }, false)).toBe(
      undefined,
    );
  });
});
