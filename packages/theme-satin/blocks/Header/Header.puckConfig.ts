// Theme-satin override — sidebar IDENTICAL to theme-base (Figma 314:34540).
// Only `defaults` differ per-theme (siteTitle, navigationLinks).
// To change sidebar fields → edit theme-base, then sync here.
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
   * Additive layout variant. `standard` (default) — single row: hamburger,
   * logo, nav menu, actions. `two-tier` (flux pilot) — two rows: row 1 is
   * logo + actions; row 2 is centered nav menu. Other themes default to
   * `standard` so behaviour не меняется.
   */
  variant: z.enum(['standard', 'two-tier']).optional(),
  /**
   * Optional promo strip rendered ABOVE the header (Figma flux 1:26341).
   * Disabled by default; flux opts in via `theme.json blockDefaults.Header.promoBar.enabled`.
   */
  promoBar: z.object({
    enabled: z.boolean().optional(),
    text: z.string().optional(),
    linkText: z.string().optional(),
    linkHref: z.string().optional(),
  }).optional(),
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
  /**
   * Figma constructor sidebar 314:34540 — отдельная схема для блока «Меню»
   * (отличается от основной цветовой схемы хедера). Влияет на dropdown
   * mega-menu / sidebar wrapper. NULL = наследует от `colorScheme`.
   */
  menuColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeaderProps = z.infer<typeof HeaderSchema>;

export const HeaderPuckConfig: BlockPuckConfig<HeaderProps> = {
  label: 'Header',
  category: 'navigation',
  // Sidebar собран строго по Figma 314:34540 (Platform - Constructor - Landing).
  // Порядок полей и опций — как в макете. Поля, которых в макете нет
  // (siteTitle/logo URL/logoFont/activeLinkIndicator/variant/promoBar/
  // actionButtons), помечены `type:'hidden'` — они нужны для рендера
  // (берутся из branding / theme-default), но в sidebar не показываются.
  fields: {
    // ── Figma — основа ──
    // Все три enum-поля — `select` (dropdown с chevron по Figma 314:34540),
    // не `radio` — иначе Puck UI рисует пилюли вместо выпадашки.
    logoPosition: {
      type: 'select',
      label: 'Положение логотипа',
      options: [
        { label: 'Сверху слева', value: 'top-left' },
        { label: 'Сверху в центре', value: 'top-center' },
        { label: 'Слева', value: 'center-left' },
        { label: 'По центру', value: 'center-absolute' },
      ],
    },
    stickiness: {
      type: 'select',
      label: 'Статичность',
      options: [
        { label: 'Никогда', value: 'none' },
        { label: 'При прокрутке вверх', value: 'scroll-up' },
        { label: 'Всегда', value: 'always' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },

    // ── Figma — Меню ──
    menuColorScheme: { type: 'colorScheme', label: 'Цветовая схема меню' },
    menuType: {
      type: 'select',
      label: 'Тип меню',
      options: [
        { label: 'Боковое', value: 'sidebar' },
        { label: 'Выпадающее', value: 'dropdown' },
        { label: 'Расширенное', value: 'mega-menu' },
      ],
    },
    navigationLinks: { type: 'array', label: 'Изменить пункты меню' },

    // ── скрыто (не в Figma sidebar; заполняется через branding / theme) ──
    siteTitle: { type: 'hidden', label: '' },
    logo: { type: 'hidden', label: '' },
    logoFont: { type: 'hidden', label: '' },
    activeLinkIndicator: { type: 'hidden', label: '' },
    variant: { type: 'hidden', label: '' },
    promoBar: { type: 'hidden', label: '' },
    actionButtons: { type: 'hidden', label: '' },
  },
  defaults: {
    siteTitle: 'Satin Store',
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
    // Header padding — компактные 12px сверху/снизу. Раньше пробовали 80
    // (как value slider в Figma sidebar 314:34548), но это растягивало
    // header до ~240px — некомфортно. Реальный header высота ~64-80px:
    // 12 padding + ~40 content = ~64px.
    padding: { top: 12, bottom: 12 },
  },
  schema: HeaderSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 64, step: 4 } },
};
