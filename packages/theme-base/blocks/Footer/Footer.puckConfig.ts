import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const FooterLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const SocialPlatformSchema = z.enum(['telegram', 'vk', 'youtube', 'tiktok', 'dzen']);

const SocialLinkSchema = z.object({
  platform: SocialPlatformSchema,
  href: z.string(),
});

export const FooterSchema = z.object({
  siteTitle: z.string().optional(),
  /** Theme-level layout switch (set via theme.json → blockDefaults.Footer.variant). */
  /**
   * 084 vanilla pilot — additive value `'2-part-asymmetric'` (vanilla
   * home asymmetric two-column footer with right column self-stretch).
   * Pre-084 values remain valid.
   */
  variant: z.enum(['3-col', '2-part', '2-part-asymmetric', 'minimal']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Optional bottom strip rendered
   * below the main footer (vanilla "Powered by Merfy" black bar).
   * Default `undefined` preserves pre-084 markup.
   */
  bottomStrip: z
    .object({
      enabled: z.boolean(),
      text: z.string().optional(),
    })
    .optional(),
  copyright: z
    .object({
      companyName: z.string().optional(),
      poweredBy: z.string().optional(),
      showYear: z.boolean().optional(),
    })
    .optional(),
  newsletter: z.object({
    enabled: z.boolean(),
    heading: z.string(),
    description: z.string(),
    placeholder: z.string(),
  }),
  heading: z.object({
    text: z.string(),
    size: z.enum(['small', 'medium', 'large']),
    alignment: z.enum(['left', 'center', 'right']),
  }),
  text: z.object({
    content: z.string(),
    size: z.enum(['small', 'medium', 'large']),
  }),
  // Responsive-выравнивание блока рассылки (заголовок+текст): отдельные значения
  // для десктопа и адаптива. contentAlign = десктоп (md:), contentAlignMobile = моб (base).
  contentAlign: z.enum(['left', 'center', 'right']).optional(),
  contentAlignMobile: z.enum(['left', 'center', 'right']).optional(),
  navigationColumn: z.object({
    title: z.string(),
    links: z.array(FooterLinkSchema),
  }),
  informationColumn: z.object({
    title: z.string(),
    links: z.array(FooterLinkSchema),
  }),
  socialColumn: z.object({
    title: z.string(),
    email: z.string(),
    socialLinks: z.array(SocialLinkSchema),
  }),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type FooterProps = z.infer<typeof FooterSchema>;

const sizeOptions = [
  { label: 'Маленький', value: 'small' },
  { label: 'Средний', value: 'medium' },
  { label: 'Большой', value: 'large' },
];

const linkArrayField = {
  type: 'array' as const,
  label: 'Ссылки',
  arrayFields: {
    label: { type: 'text' as const, label: 'Название' },
    href: { type: 'pagePicker' as const, label: 'Ссылка' },
  },
  defaultItemProps: { label: 'Новая ссылка', href: '/' },
  max: 10,
};

// Pre-existing issue: `Record<keyof Props, …>` constraint flags missing
// legacy/internal fields. Cast keeps runtime config shape unchanged.
export const FooterPuckConfig = {
  label: 'Footer',
  category: 'navigation',
  // Figma 314-34558: Рассылка (toggle) / Заголовок (sub-panel) / Размер заголовка /
  // Текст (sub-panel) / Размер текста / Цветовая схема / Отступы.
  fields: {
    newsletter: {
      type: 'object',
      label: 'Рассылка',
      objectFields: {
        enabled: {
          type: 'toggle',
          label: 'Скрыть/показать',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        },
        heading: { type: 'hidden', label: '' },
        description: { type: 'hidden', label: '' },
        placeholder: { type: 'hidden', label: '' },
      },
    },
    // Figma 314-34558: под «Рассылка» — Заголовок(aiText) / Размер заголовка / Текст(aiText)
    // / Размер текста, ВИДИМЫМИ в панели. `label:''` → под-поля плоскими группами (как Figma),
    // без дубля-обёртки «Заголовок». heading/text питают заголовок+описание рассылки.
    heading: {
      type: 'object',
      label: '',
      objectFields: {
        text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        size: { type: 'select', label: 'Размер заголовка', options: sizeOptions },
        // Выравнивание вынесено в top-level responsive-контрол (contentAlign/contentAlignMobile).
        alignment: { type: 'hidden', label: '' },
      },
    } as any,
    text: {
      type: 'object',
      label: '',
      objectFields: {
        content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        size: { type: 'select', label: 'Размер текста', options: sizeOptions },
      },
    } as any,
    // Новое (item 1): responsive-выравнивание блока рассылки — десктоп + адаптив.
    contentAlign: { type: 'alignment', label: 'Выравнивание' },
    contentAlignMobile: { type: 'alignment', label: 'Выравнивание (адаптив)' } as any,
    // Hidden — нет в Figma 314-34558.
    siteTitle: { type: 'hidden', label: '' },
    bottomStrip: { type: 'hidden', label: '' },
    // Columns hidden из main по Figma 314-34558 (footer-specific advanced).
    navigationColumn: {
      type: 'hidden' as const,
      label: '',
      objectFields: {
        title: { type: 'text', label: 'Заголовок колонки' },
        links: linkArrayField,
      },
    },
    informationColumn: {
      type: 'hidden' as const,
      label: '',
      objectFields: {
        title: { type: 'text', label: 'Заголовок колонки' },
        links: linkArrayField,
      },
    },
    socialColumn: { type: 'hidden' as const, label: '' },
    copyright: { type: 'hidden' as const, label: '' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    siteTitle: '',
    variant: 'minimal',
    copyright: {
      companyName: '',
      poweredBy: 'Powered by Merfy',
      showYear: true,
    },
    newsletter: {
      enabled: false,
      heading: 'Подпишитесь на рассылку',
      description: 'Будьте в курсе новых поступлений и акций',
      placeholder: 'Ваш email',
    },
    heading: { text: '', size: 'small', alignment: 'center' },
    text: { content: '', size: 'small' },
    // item 1 default = текущее поведение rose: десктоп слева, адаптив по центру.
    contentAlign: 'left',
    contentAlignMobile: 'center',
    navigationColumn: {
      title: 'Навигация',
      links: [
        { label: 'Магазин', href: '/catalog' },
        { label: 'О нас', href: '/about' },
        { label: 'Контакты', href: '/contacts' },
      ],
    },
    informationColumn: {
      title: 'Информация',
      links: [
        { label: 'Доставка', href: '/delivery' },
        { label: 'Возврат', href: '/returns' },
        { label: 'Оплата', href: '/payment' },
      ],
    },
    socialColumn: {
      title: 'Соцсети',
      email: '',
      socialLinks: [],
    },
    padding: { top: 80, bottom: 80 },
  },
  schema: FooterSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
} as unknown as BlockPuckConfig<FooterProps>;
