import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { sharedSettings } from '../src/panel/fields';
import { parsePanel } from '../src/panel/panel';
import { panelShape, settingFieldShape } from '../src/panel/shape';
import type { PanelSchema } from '../src/panel/types';

// Сквозные настройки (блок 3 «Секций и SDK», раздел 3.7): пометка "shared": true — только у полей настроек панели темы.
const PANEL_URL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);
const raw: unknown = JSON.parse(readFileSync(PANEL_URL, 'utf8'));
const platform = parsePanel(raw, platformDictionary);

const CART_TYPE = { id: 'cart-type', label: 'Вид корзины', setting: { kind: 'string', default: '' } };
const panelWith = (field: object) => ({ v: 1, groups: [{ id: 'cart', title: 'Корзина', fields: [field] }] });
const titlesOf = (panel: PanelSchema): string[] =>
  sharedSettings(panel).map(({ group, field }) => `${group} → ${field.label} (${field.id})`);

describe('пометка сквозной настройки', () => {
  it('у поля настройки панели — только true', () => {
    expect(panelShape.safeParse(panelWith({ ...CART_TYPE, shared: true })).success).toBe(true);
    expect(panelShape.safeParse(panelWith({ ...CART_TYPE, shared: false })).success).toBe(false);
    expect(panelShape.safeParse(panelWith(CART_TYPE)).success).toBe(true);
  });

  it('у поля токена пометки нет', () => {
    const token = { id: 'cart-scheme', label: 'Схема', token: 'scheme-cart-drawer', control: 'scheme', shared: true };
    expect(panelShape.safeParse(panelWith(token)).success).toBe(false);
  });

  it('у поля секции пометки нет: форма поля секции — без shared', () => {
    expect(settingFieldShape.safeParse(CART_TYPE).success).toBe(true);
    expect(settingFieldShape.safeParse({ ...CART_TYPE, shared: true }).success).toBe(false);
  });

  it('sharedSettings — поля с пометкой и заголовок их группы, поля сайдбара тоже', () => {
    const toggle = { kind: 'toggle', default: true, labels: { on: 'Вкл', off: 'Выкл' } } as const;
    const panel: PanelSchema = {
      v: 1,
      groups: [
        {
          id: 'logo',
          title: 'Логотип',
          fields: [{ id: 'logo-image', label: 'Картинка', shared: true, setting: { kind: 'image', default: '', maxBytes: 1 } }],
        },
        {
          id: 'banner',
          title: 'Баннер',
          fields: [{ id: 'banner-text', label: 'Текст', setting: { kind: 'text', default: '' } }],
          sidebar: { title: 'Баннер cookie', fields: [{ id: 'cookie-banner-enabled', label: 'Баннер cookie', shared: true, setting: toggle }] },
        },
      ],
    };
    expect(titlesOf(panel)).toEqual(['Логотип → Картинка (logo-image)', 'Баннер → Баннер cookie (cookie-banner-enabled)']);
  });

  it('панель платформы: 9 сквозных', () => {
    expect(titlesOf(platform)).toEqual([
      'Логотип → Картинка (logo-image)',
      'Социальные сети → Telegram (social-telegram)',
      'Социальные сети → Вконтакте (social-vk)',
      'Социальные сети → Дзен (social-dzen)',
      'Социальные сети → Youtube (social-youtube)',
      'Социальные сети → TikTok (social-tiktok)',
      'Социальные сети → MAX (social-max)',
      'Корзина → Вид корзины (cart-type)',
      'Баннер → Баннер cookie (cookie-banner-enabled)',
    ]);
  });
});
