import { panelForTheme, parsePanel, settingFields } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import { pagePropsOf, type ShopTheme } from '../src/page';
import { changedInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// Настройки темы для секций, когда тема скрыла поле панели (блок 3 «Секций и SDK», часть 3в; design.md блока 3, 3.7).
const PLATFORM = parsePanel(panelJson, novaTokens.dictionary);
const HIDDEN = ['cart-type', 'social-telegram', 'logo-image'];
const THEMED = panelForTheme(PLATFORM, { hidden: HIDDEN });

const themeOf = (extra: Partial<ShopTheme> = {}): ShopTheme => ({
  tokens: novaTokens,
  render: fakeRender,
  panel: THEMED,
  ...extra,
});
const inputsWith = (settings: Record<string, string | boolean>) =>
  changedInputs((inputs) => {
    inputs.revision = { ...inputs.revision, settings };
  });

describe('настройки темы секциям: тема скрыла поля панели', () => {
  it('скрытое темой поле приходит с умолчанием платформы, а не пропадает', () => {
    const { theme } = pagePropsOf(inputsWith({}), themeOf({ platformPanel: PLATFORM }));
    expect(theme['cart-type']).toBe('drawer');
    expect(theme['social-telegram']).toBe('');
    expect(theme['logo-image']).toBe('');
  });

  it('ключи theme — все настройки полной панели платформы, скрытые тоже', () => {
    const { theme } = pagePropsOf(inputsWith({}), themeOf({ platformPanel: PLATFORM }));
    expect(Object.keys(theme).sort()).toEqual(
      settingFields(PLATFORM)
        .map((field) => field.id)
        .sort(),
    );
  });

  it('правка по скрытому полю не действует: мерчант его не видит, секция получает умолчание', () => {
    const inputs = inputsWith({ 'cart-type': 'page', 'social-telegram': 'https://t.me/scarves' });
    const { theme } = pagePropsOf(inputs, themeOf({ platformPanel: PLATFORM }));
    expect(theme['cart-type']).toBe('drawer');
    expect(theme['social-telegram']).toBe('');
  });

  it('правка по видимому полю действует', () => {
    const inputs = inputsWith({ 'social-vk': 'https://vk.com/scarves' });
    const { theme } = pagePropsOf(inputs, themeOf({ platformPanel: PLATFORM }));
    expect(theme['social-vk']).toBe('https://vk.com/scarves');
  });

  it('несохранённые правки из конструктора — те же правила', () => {
    const edits = { 'cart-type': 'page', 'social-vk': 'https://vk.com/scarves' };
    const { theme } = pagePropsOf(inputsWith({}), themeOf({ platformPanel: PLATFORM }), edits);
    expect([theme['cart-type'], theme['social-vk']]).toEqual(['drawer', 'https://vk.com/scarves']);
  });

  it('полной панели у темы нет — значения по панели темы, как раньше', () => {
    const { theme } = pagePropsOf(inputsWith({ 'social-vk': 'https://vk.com/scarves' }), themeOf());
    expect(theme['social-vk']).toBe('https://vk.com/scarves');
    expect(Object.keys(theme)).not.toContain('cart-type');
  });

  it('панели у темы нет — настроек нет', () => {
    const { theme } = pagePropsOf(inputsWith({}), { tokens: novaTokens, render: fakeRender });
    expect(theme).toEqual({});
  });
});
