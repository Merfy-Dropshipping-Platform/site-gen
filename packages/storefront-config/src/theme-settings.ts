import { z } from 'zod';

// Сквозные настройки темы в конфиге страницы (блок 9 «Секций и SDK», часть 9б; design.md блока 9, п. 16 и 9.8): поля
// панели темы с пометкой "shared": true (блок 3). Значения — те же, что получает шаблон в Astro.props.theme; ядро
// витрины отдаёт их коду секции как ctx.theme. Новое необязательное поле v1: у страницы без панели темы его нет.
// Новая сквозная настройка панели — новая строка здесь; расхождение с панелью ловит тест сборки
// (storefront-build, __tests__/theme-settings.test.ts).
export const CART_TYPES = ['drawer', 'page'] as const;

// Предел строки — как у полей image и url панели (@merfy/tokens, settings.ts: URL_MAX).
const SETTING_TEXT_MAX = 2048;
const settingText = z.string().max(SETTING_TEXT_MAX);

export const themeSettingsSchema = z.strictObject({
  'logo-image': settingText.optional(),
  'social-telegram': settingText.optional(),
  'social-vk': settingText.optional(),
  'social-dzen': settingText.optional(),
  'social-youtube': settingText.optional(),
  'social-tiktok': settingText.optional(),
  'social-max': settingText.optional(),
  'cart-type': z.enum(CART_TYPES).optional(),
  'cookie-banner-enabled': z.boolean().optional(),
});

export type ThemeSettings = z.infer<typeof themeSettingsSchema>;

export const THEME_SETTING_NAMES: readonly string[] = Object.keys(themeSettingsSchema.shape);

type SettingsField = { settings?: Record<string, unknown> };

// Поле theme.settings из значений панели (pagePropsOf(...).theme сборки): только сквозные имена, поле за полем; ни
// одного — поля нет, конфиг прежний. Типы значений проверяет схема конфига.
export function themeSettingsOf(values: Readonly<Record<string, unknown>> = {}): SettingsField {
  const names = THEME_SETTING_NAMES.filter((name) => Object.hasOwn(values, name));
  const settings = Object.fromEntries(names.map((name): [string, unknown] => [name, values[name]]));
  return names.length === 0 ? {} : { settings };
}
