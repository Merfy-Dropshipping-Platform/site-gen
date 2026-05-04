import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const NavigationLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
  submenu: z.array(z.object({
    label: z.string(),
    href: z.string(),
  })).optional(),
});

export const HeaderSchema = z.object({
  siteTitle: z.string(),
  logo: z.string(),
  /**
   * 084 vanilla pilot — additive value `'center-absolute'` in the
   * existing logoPosition enum. Pre-084 values remain valid. Vanilla
   * uses this for the absolute-centered logo (3-column header layout).
   */
  logoPosition: z.enum([
    'top-left',
    'top-center',
    'top-right',
    'center-left',
    'center-absolute',
  ]),
  /**
   * 084 vanilla pilot — additive variant. Visual indicator under the
   * currently-active nav link. Default `none` keeps pre-084 behaviour
   * (no indicator). `underline` renders a thin span under the active
   * link (vanilla home parity).
   */
  activeLinkIndicator: z.enum(['none', 'underline']).optional(),
  /**
   * Font for the text logo (used when `logo` is empty). Maps to a family key
   * known to constructor-theme-bridge — see FONT_FAMILIES there. Leave
   * undefined to use the theme's body font.
   */
  logoFont: z.enum(['default', 'caveat', 'bad-script', 'playfair-display', 'cormorant-garamond']).optional(),
  stickiness: z.enum(['scroll-up', 'always', 'none']),
  menuType: z.enum(['dropdown', 'mega-menu', 'sidebar']),
  navigationLinks: z.array(NavigationLinkSchema),
  actionButtons: z.object({
    showSearch: z.boolean(),
    showCart: z.boolean(),
    showProfile: z.boolean(),
  }),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeaderProps = z.infer<typeof HeaderSchema>;

export const HeaderPuckConfig: BlockPuckConfig<HeaderProps> = {
  label: 'Header',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название магазина' },
    logo: { type: 'text', label: 'URL логотипа' },
    logoFont: { type: 'select', label: 'Шрифт текстового лого' },
    logoPosition: { type: 'radio', label: 'Позиция логотипа' },
    activeLinkIndicator: {
      type: 'radio',
      label: 'Индикатор активной ссылки',
      options: [
        { label: 'Нет', value: 'none' },
        { label: 'Подчёркивание', value: 'underline' },
      ],
    },
    stickiness: { type: 'radio', label: 'Прилипание' },
    menuType: { type: 'radio', label: 'Тип меню' },
    navigationLinks: { type: 'array', label: 'Ссылки меню' },
    actionButtons: { type: 'object', label: 'Кнопки' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Мой магазин',
    logo: '',
    logoPosition: 'top-left',
    stickiness: 'scroll-up',
    menuType: 'dropdown',
    navigationLinks: [
      { label: 'Магазин', href: '/catalog' },
      { label: 'О нас', href: '/about' },
      { label: 'Контакты', href: '/contacts' },
    ],
    actionButtons: { showSearch: true, showCart: true, showProfile: true },
    padding: { top: 16, bottom: 16 },
  },
  schema: HeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 40, step: 4 } },
};
