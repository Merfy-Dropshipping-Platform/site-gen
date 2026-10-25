import {
  THEME_SETTING_NAMES,
  buildStorefrontConfig,
  parseStorefrontConfig,
  type StorefrontConfig,
} from '@merfy/storefront-config';
import { panelForTheme, parsePanel, sharedSettings } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import panelJson from '../../theme-contract/panel/theme-panel.json';
import type { StandPageLocals } from '../src/locals';
import { pagePropsOf, renderShopPage, type ShopTheme } from '../src/page';
import { renderStandPage, standLocals, type StandBuild } from '../src/stand';
import { changedInputs, standInputs } from './support';
import { fakeRender, novaTokens } from './support-theme';

// theme.settings в конфиге страницы и стенда (блок 9 «Секций и SDK», часть 9б; design.md блока 9, п. 16): сквозные
// настройки темы — те же значения, что получают секции в Astro.props.theme (pagePropsOf, часть 3в блока 3).
const PLATFORM = parsePanel(panelJson, novaTokens.dictionary);
const CONFIG_OPEN = '<script type="application/json" id="merfy-config">';

const themeOf = (hidden: string[]): ShopTheme => ({
  tokens: novaTokens,
  render: fakeRender,
  panel: panelForTheme(PLATFORM, { hidden }),
  platformPanel: PLATFORM,
});
const text = (content: Uint8Array): string => Buffer.from(content).toString('utf8');

function configOf(html: string): StorefrontConfig {
  const start = html.indexOf(CONFIG_OPEN) + CONFIG_OPEN.length;
  return parseStorefrontConfig(html.slice(start, html.indexOf('</script>', start)));
}

// Сквозные из значений настроек — по именам схемы конфига.
const sharedOf = (values: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(THEME_SETTING_NAMES.map((name) => [name, values[name]]));

const withSettings = (settings: Record<string, string | boolean>) =>
  changedInputs((inputs) => {
    inputs.revision = { ...inputs.revision, settings };
  });

describe('theme.settings в конфиге страницы магазина', () => {
  it('сквозные — те же значения, что у секций; скрытое темой поле — с умолчанием, правка по нему не действует', async () => {
    const inputs = withSettings({
      'cart-type': 'page',
      'social-vk': 'https://vk.com/scarves',
      'cookie-banner-title': 'Cookie',
    });
    const theme = themeOf(['cart-type']);
    const config = configOf(text((await renderShopPage(inputs, '/', theme)).file.content));
    expect(config.theme.settings).toEqual(sharedOf(pagePropsOf(inputs, theme).theme));
    expect(config.theme.settings).toMatchObject({ 'cart-type': 'drawer', 'social-vk': 'https://vk.com/scarves' });
    expect(Object.keys(config.theme.settings ?? {})).toEqual(THEME_SETTING_NAMES);
  });

  it('правка видимого «Вида корзины» — в конфиге', async () => {
    const config = configOf(
      text((await renderShopPage(withSettings({ 'cart-type': 'page' }), '/', themeOf([]))).file.content),
    );
    expect(config.theme.settings?.['cart-type']).toBe('page');
  });

  it('панели у темы нет — поля theme.settings нет, конфиг прежний', async () => {
    const page = await renderShopPage(standInputs, '/', { tokens: novaTokens, render: fakeRender });
    expect(configOf(text(page.file.content)).theme).toEqual({ id: 'nova', version: standInputs.theme.version });
  });
});

describe('сквозные настройки: панель платформы и схема конфига', () => {
  const fields = sharedSettings(PLATFORM).map(({ field }) => field);
  const configWith = (settings: Readonly<Record<string, unknown>>): StorefrontConfig =>
    buildStorefrontConfig({
      site: { id: standInputs.site.id, name: 'Шарфы', publicUrl: null },
      theme: { id: 'nova', version: '0.0.4', settings },
      env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
      page: { id: 'home', path: '/' },
      mode: 'preview',
    });

  it('имена — поля панели с "shared": true, в том же порядке', () => {
    expect(fields.map((field) => field.id)).toEqual(THEME_SETTING_NAMES);
  });

  it('умолчания и каждый вариант выбора проходят схему конфига', () => {
    const defaults = Object.fromEntries(fields.map((field) => [field.id, field.setting.default]));
    expect(configWith(defaults).theme.settings).toEqual(defaults);
    const options = fields.flatMap((field) =>
      field.setting.kind === 'select' ? field.setting.options.map((option) => ({ [field.id]: option.value })) : [],
    );
    expect(options.length).toBeGreaterThan(1);
    options.forEach((settings) => expect(configWith(settings).theme.settings).toEqual(settings));
  });
});

describe('theme.settings в конфиге стенда', () => {
  const standTheme = { tokens: novaTokens, panel: panelForTheme(PLATFORM, undefined) };

  it('превью: сквозные из правок черновика — те же, что в настройках стенда', () => {
    const locals = standLocals(
      {
        site: { id: standInputs.site.id, name: 'Шарфы', publicUrl: 'scarf.dev.merfy.ru' },
        theme: { id: 'nova', version: '0.0.4' },
        env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
        revision: { tokens: {}, settings: { 'cart-type': 'page' } },
      },
      standTheme,
    );
    const settings = configOf(locals.head.configHtml).theme.settings;
    expect(settings?.['cart-type']).toBe('page');
    expect(settings).toEqual(sharedOf(locals.settings));
  });

  it('опубликованный стенд: правки настроек — из ревизии, в настройках стенда и в theme.settings', async () => {
    const seen: StandPageLocals[] = [];
    const stand: StandBuild = {
      ...standTheme,
      renderStand: (locals) => {
        seen.push(locals);
        return Promise.resolve('<html></html>');
      },
    };
    await renderStandPage(withSettings({ 'cart-type': 'page' }), stand);
    expect(seen[0]?.settings['cart-type']).toBe('page');
    expect(configOf(seen[0]?.head.configHtml ?? '').theme.settings?.['cart-type']).toBe('page');
  });
});
