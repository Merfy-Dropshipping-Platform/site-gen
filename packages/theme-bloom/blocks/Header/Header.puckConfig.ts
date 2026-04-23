import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Bloom Header override.
// Keeps the same prop SHAPE as @merfy/theme-base/blocks/Header so merchant
// content migrates 1:1 between themes. Differs from base via CSS tokens
// (Urbanist font, pink accent, pill button radius).

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
  logoPosition: z.enum(['top-left', 'top-center', 'top-right', 'center-left']),
  stickiness: z.enum(['scroll-up', 'always', 'none']),
  menuType: z.enum(['dropdown', 'mega-menu', 'sidebar']),
  navigationLinks: z.array(NavigationLinkSchema),
  actionButtons: z.object({
    showSearch: z.boolean(),
    showCart: z.boolean(),
    showProfile: z.boolean(),
  }),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeaderProps = z.infer<typeof HeaderSchema>;

export const HeaderPuckConfig: BlockPuckConfig<HeaderProps> = {
  label: 'Шапка (Bloom)',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название магазина' },
    logo: { type: 'text', label: 'URL логотипа' },
    logoPosition: { type: 'radio', label: 'Позиция логотипа' },
    stickiness: { type: 'radio', label: 'Прилипание' },
    menuType: { type: 'radio', label: 'Тип меню' },
    navigationLinks: { type: 'array', label: 'Ссылки меню' },
    actionButtons: { type: 'object', label: 'Кнопки' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Bloom Store',
    logo: '',
    logoPosition: 'top-left',
    stickiness: 'scroll-up',
    menuType: 'dropdown',
    navigationLinks: [
      { label: 'Главная', href: '/' },
      { label: 'Каталог', href: '/catalog' },
      { label: 'О нас', href: '/about' },
      { label: 'Контакты', href: '/contacts' },
    ],
    actionButtons: { showSearch: true, showCart: true, showProfile: true },
    padding: { top: 24, bottom: 24 },
  },
  schema: HeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 40, step: 4 } },
};
