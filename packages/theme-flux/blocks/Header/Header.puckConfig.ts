import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Flux Header override.
// Keeps the same prop SHAPE as @merfy/theme-base/blocks/Header. Tech/electronics
// aesthetic — dark bg option, orange accent cart badge, 6px button radius.

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
    logoPosition: { type: 'radio', label: 'Позиция логотипа' },
    stickiness: { type: 'radio', label: 'Прилипание' },
    menuType: { type: 'radio', label: 'Тип меню' },
    navigationLinks: { type: 'array', label: 'Ссылки меню' },
    actionButtons: { type: 'object', label: 'Кнопки' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Flux Store',
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
    padding: { top: 20, bottom: 20 },
  },
  schema: HeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 40, step: 4 } },
};
