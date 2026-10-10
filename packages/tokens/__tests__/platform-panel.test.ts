import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { settingFields, tokenFields } from '../src/panel/fields';
import { panelForTheme, parsePanel } from '../src/panel/panel';
import { resolveSettings } from '../src/panel/settings';

// Схема панели платформы (design.md блока 8, раздел 1 и П8-4 Б): вся нынешняя панель — 11 групп и правый сайдбар
// баннера, 44 поля: 30 полей вида — токены (design.md блока 1, раздел 4.4), 14 настроек не про вид.
const PANEL_URL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);
const raw: unknown = JSON.parse(readFileSync(PANEL_URL, 'utf8'));
const panel = parsePanel(raw, platformDictionary);

const VIEW_TOKENS = [
  'width-logo',
  'background',
  'heading',
  'foreground',
  'primary',
  'primary-hover',
  'primary-foreground',
  'primary-hover-foreground',
  'primary-border',
  'secondary',
  'secondary-hover',
  'secondary-foreground',
  'secondary-hover-foreground',
  'secondary-border',
  'font-heading',
  'weight-heading',
  'font-body',
  'weight-body',
  'spacing-section-gap',
  'radius-button',
  'radius-input',
  'choice-card-style',
  'choice-card-align',
  'border-width-card',
  'radius-card',
  'spacing-card',
  'scheme-card',
  'radius-media',
  'scheme-cart-drawer',
  'scheme-cookie-banner',
];

describe('theme-contract/panel/theme-panel.json', () => {
  it('11 групп нынешней панели, в том же порядке', () => {
    expect(panel.groups.map((group) => group.title)).toEqual([
      'Логотип',
      'Цвета',
      'Типографика',
      'Страница',
      'Кнопки',
      'Поля ввода',
      'Карточки товара',
      'Медиа',
      'Социальные сети',
      'Корзина',
      'Баннер',
    ]);
  });

  it('44 поля: 30 токенов вида — ровно таблица 4.4 блока 1, каждый один раз', () => {
    expect(tokenFields(panel).map((field) => field.token)).toEqual(VIEW_TOKENS);
    expect(settingFields(panel)).toHaveLength(14);
  });

  it('14 настроек и их умолчания — как у нынешней панели и баннера cookie', () => {
    expect(resolveSettings(panel, {})).toEqual({
      'logo-image': '',
      'social-telegram': '',
      'social-vk': '',
      'social-dzen': '',
      'social-youtube': '',
      'social-tiktok': '',
      'social-max': '',
      'cart-type': 'drawer',
      'cookie-banner-enabled': true,
      'cookie-banner-title': '',
      'cookie-banner-text':
        'Мы используем файлы cookie, чтобы сайт работал корректно. Продолжая пользоваться сайтом, вы соглашаетесь с их использованием.',
      'cookie-banner-primary-label': 'Принять',
      'cookie-banner-secondary-label': '',
      'cookie-banner-position': 'bottom-left',
    });
  });

  it('сайдбар — только у баннера; схема корзины и баннера видны по условию', () => {
    expect(panel.groups.filter((group) => group.sidebar).map((group) => group.id)).toEqual(['banner']);
    const conditions = tokenFields(panel)
      .filter((field) => field.visibleWhen)
      .map((field) => [field.id, field.visibleWhen]);
    expect(conditions).toEqual([
      ['cart-drawer-scheme', { setting: 'cart-type', equals: 'drawer' }],
      ['cookie-banner-scheme', { setting: 'cookie-banner-enabled', equals: true }],
    ]);
  });

  it('тема без panel в theme.json получает панель целиком; $schema ведёт на файл генерации', () => {
    expect(panelForTheme(panel, undefined)).toEqual(panel);
    const schemaPath = /"\$schema": "([^"]+)"/.exec(readFileSync(PANEL_URL, 'utf8'))?.[1] ?? '';
    expect(existsSync(new URL(schemaPath, PANEL_URL))).toBe(true);
  });
});
