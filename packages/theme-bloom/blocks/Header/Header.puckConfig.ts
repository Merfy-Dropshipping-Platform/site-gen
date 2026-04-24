import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Bloom Header override.
// Same prop SHAPE as base Header so content migrates 1:1 between themes.
// Distinct from base via: logo image upload, colorScheme selector, padding
// slider, richer radio/array options. Styling differences live in
// Header.classes.ts (Urbanist font, pink accent badge, pill buttons).

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
  label: 'Шапка (Bloom)',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название магазина' },
    logo: { type: 'image', label: 'Логотип (картинка)' },
    logoFont: {
      type: 'select',
      label: 'Шрифт текстового лого (если без картинки)',
      options: [
        { label: 'По умолчанию', value: 'default' },
        { label: 'Caveat', value: 'caveat' },
        { label: 'Bad Script', value: 'bad-script' },
        { label: 'Playfair Display', value: 'playfair-display' },
        { label: 'Cormorant Garamond', value: 'cormorant-garamond' },
      ],
    },
    logoPosition: {
      type: 'radio',
      label: 'Позиция логотипа',
      options: [
        { label: 'Сверху слева', value: 'top-left' },
        { label: 'По центру сверху', value: 'top-center' },
        { label: 'Сверху справа', value: 'top-right' },
        { label: 'Слева от меню', value: 'center-left' },
      ],
    },
    stickiness: {
      type: 'radio',
      label: 'Прилипание при прокрутке',
      options: [
        { label: 'Показывать при скролле вверх', value: 'scroll-up' },
        { label: 'Всегда приклеено', value: 'always' },
        { label: 'Не прилипает', value: 'none' },
      ],
    },
    menuType: {
      type: 'radio',
      label: 'Тип меню',
      options: [
        { label: 'Выпадающее', value: 'dropdown' },
        { label: 'Мега-меню', value: 'mega-menu' },
        { label: 'Боковое', value: 'sidebar' },
      ],
    },
    navigationLinks: {
      type: 'array',
      label: 'Пункты меню',
      arrayFields: {
        label: { type: 'text', label: 'Название' },
        href: { type: 'pagePicker', label: 'Ссылка' },
      },
      defaultItemProps: { label: 'Новый пункт', href: '/' },
      max: 12,
    },
    actionButtons: {
      type: 'object',
      label: 'Кнопки справа',
      objectFields: {
        showSearch: {
          type: 'radio',
          label: 'Поиск',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
        showCart: {
          type: 'radio',
          label: 'Корзина',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
        showProfile: {
          type: 'radio',
          label: 'Профиль',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
      },
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    siteTitle: 'Bloom',
    logo: '',
    logoPosition: 'top-center',
    stickiness: 'scroll-up',
    menuType: 'dropdown',
    navigationLinks: [
      { label: 'Каталог', href: '/catalog' },
      { label: 'О нас', href: '/about' },
      { label: 'Контакты', href: '/contacts' },
    ],
    actionButtons: { showSearch: true, showCart: true, showProfile: true },
    padding: { top: 0, bottom: 0 },
  },
  schema: HeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 40, step: 4 } },
};
