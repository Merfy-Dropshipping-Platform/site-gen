import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Vanilla Header override.
// Keeps the same prop SHAPE as @merfy/theme-base/blocks/Header so that merchant
// content migrates 1:1 between themes.

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
  /**
   * Font for the text logo (used when `logo` is empty). Vanilla default =
   * "caveat" (script) to match Figma Header mark. Constructor exposes this
   * as a select so merchants can switch to a serif or sans-serif wordmark.
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
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeaderProps = z.infer<typeof HeaderSchema>;

export const HeaderPuckConfig: BlockPuckConfig<HeaderProps> = {
  label: 'Шапка (Vanilla)',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название магазина' },
    logo: { type: 'text', label: 'URL логотипа' },
    logoFont: { type: 'select', label: 'Шрифт текстового лого' },
    logoPosition: { type: 'radio', label: 'Позиция логотипа' },
    stickiness: { type: 'radio', label: 'Прилипание' },
    menuType: { type: 'radio', label: 'Тип меню' },
    navigationLinks: { type: 'array', label: 'Ссылки меню' },
    actionButtons: { type: 'object', label: 'Кнопки' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Vanila',
    logo: '',
    logoPosition: 'top-center',
    logoFont: 'caveat',
    stickiness: 'scroll-up',
    menuType: 'dropdown',
    navigationLinks: [
      { label: 'Текстиль', href: '/catalog' },
      { label: 'Декор', href: '/catalog?collection=decor' },
      { label: 'История', href: '/about' },
    ],
    actionButtons: { showSearch: true, showCart: true, showProfile: true },
    padding: { top: 0, bottom: 0 },
  },
  schema: HeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 40, step: 4 } },
};
