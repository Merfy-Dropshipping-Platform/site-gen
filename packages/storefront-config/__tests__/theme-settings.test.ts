import { describe, expect, it } from 'vitest';
import { buildStorefrontConfig, type StorefrontConfigInput } from '../src/build';
import { StorefrontConfigError } from '../src/errors';
import { checkStorefrontConfig } from '../src/schema';
import { configTag } from '../src/tag';
import { THEME_SETTING_NAMES } from '../src/theme-settings';
import { withField } from './support';

// Сквозные настройки темы в конфиге страницы (блок 9 «Секций и SDK», часть 9б; design.md блока 9, п. 16): только поля
// панели с "shared": true, поле за полем. Нет значений или ни одного сквозного — поля theme.settings нет.
const SHARED = {
  'logo-image': 'https://minio.merfy.ru/scarves/logo.png',
  'social-telegram': 'https://t.me/scarves',
  'social-vk': '',
  'social-dzen': '',
  'social-youtube': '',
  'social-tiktok': '',
  'social-max': '',
  'cart-type': 'page',
  'cookie-banner-enabled': false,
};
// Значения панели целиком, как у шаблона в Astro.props.theme: настройки не сквозные — в конфиг не идут.
const VALUES = { ...SHARED, 'cookie-banner-position': 'bar', 'cookie-banner-title': 'Мы используем cookie' };
const BARE_THEME = { id: 'nova', version: '0.0.4' };

const input = (settings?: Readonly<Record<string, unknown>>): StorefrontConfigInput => ({
  site: { id: '7d9f2a51-3c4e-4b8a-9f1d-2e6c8a4b5d70', name: 'Шарфы', publicUrl: 'https://scarves.example' },
  theme: { ...BARE_THEME, ...(settings === undefined ? {} : { settings }) },
  env: { apiUrl: 'https://gateway.dev.merfy.ru/api' },
  page: { id: 'home', path: '/' },
  mode: 'preview',
});

function errorOf(work: () => unknown): StorefrontConfigError {
  try {
    work();
  } catch (error) {
    if (error instanceof StorefrontConfigError) return error;
    throw error;
  }
  throw new Error('конфиг собран, а не должен');
}

describe('theme.settings в конфиге страницы', () => {
  it('сквозные настройки — в theme.settings, остальные настройки панели — нет', () => {
    const config = buildStorefrontConfig(input(VALUES));
    expect(config.theme).toEqual({ ...BARE_THEME, settings: SHARED });
    expect(JSON.stringify(config)).not.toContain('cookie-banner-position');
    expect(JSON.stringify(config)).not.toContain('cookie-banner-title');
  });

  it('нет значений, пусто или ни одного сквозного — поля нет, конфиг прежний', () => {
    expect(buildStorefrontConfig(input()).theme).toEqual(BARE_THEME);
    expect(buildStorefrontConfig(input({})).theme).toEqual(BARE_THEME);
    expect(buildStorefrontConfig(input({ 'cookie-banner-position': 'bar' })).theme).toEqual(BARE_THEME);
  });

  it('часть сквозных — только они', () => {
    expect(buildStorefrontConfig(input({ 'cart-type': 'drawer' })).theme.settings).toEqual({ 'cart-type': 'drawer' });
  });

  it('неверное значение — config-invalid с путём поля', () => {
    const wrongCart = errorOf(() => buildStorefrontConfig(input({ ...SHARED, 'cart-type': 'modal' })));
    expect([wrongCart.code, wrongCart.path]).toEqual(['config-invalid', 'theme.settings.cart-type']);
    expect(errorOf(() => buildStorefrontConfig(input({ 'cookie-banner-enabled': 'да' }))).path).toBe(
      'theme.settings.cookie-banner-enabled',
    );
    expect(errorOf(() => buildStorefrontConfig(input({ 'logo-image': 'x'.repeat(2049) }))).path).toBe(
      'theme.settings.logo-image',
    );
  });

  it('схема строгая: незнакомое имя в theme.settings — ошибка с путём имени', () => {
    const error = errorOf(() => checkStorefrontConfig(withField('theme.settings', { 'cart-typ': 'page' })));
    expect([error.code, error.path]).toEqual(['config-invalid', 'theme.settings.cart-typ']);
  });

  it('имена сквозных настроек — девять полей панели с "shared": true', () => {
    expect(THEME_SETTING_NAMES).toEqual([
      'logo-image',
      'social-telegram',
      'social-vk',
      'social-dzen',
      'social-youtube',
      'social-tiktok',
      'social-max',
      'cart-type',
      'cookie-banner-enabled',
    ]);
  });

  it('тег: </script> в адресе логотипа не закрывает тег, разбор даёт тот же конфиг', () => {
    const logo = 'https://minio.merfy.ru/a</script><script>alert(1)</script>.png';
    const config = buildStorefrontConfig(input({ 'logo-image': logo }));
    const tag = configTag(config);
    expect(tag).not.toContain('</script><script>');
    expect(JSON.parse(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</script>')))).toEqual(config);
  });
});
