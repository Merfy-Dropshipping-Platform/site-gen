import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin Footer — КОНТРОЛЫ (fields + schema) = канон theme-base/rose:
// Рассылка, Заголовок/Текст в основной панели, Выравнивание, Навигация/Информация/
// Соцсети/Копирайт, Цветовая схема, Отступы. siteTitle/bottomStrip hidden.
// ДЕФОЛТЫ ниже — satin'овские (newsletter ВКЛ + ALL-CAPS). Рендер:
// themes/satin/.../Footer.astro читает те же канон-пропсы, что rose.

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
  variant: z.enum(['3-col', '2-part', '2-part-asymmetric', 'minimal']).optional(),
  /** Optional bottom strip rendered below the main footer ("Powered by …" bar). */
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
  /** «Выравнивание» блока подвала (канон theme-base/rose — top-level responsive). */
  contentAlign: z.enum(['left', 'center', 'right']).optional(),
  heading: z.object({
    text: z.string(),
    size: z.enum(['small', 'medium', 'large']),
    alignment: z.enum(['left', 'center', 'right']),
  }),
  text: z.object({
    content: z.string(),
    size: z.enum(['small', 'medium', 'large']),
  }),
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
// legacy/internal fields (variant). Cast keeps runtime config shape unchanged
// (паритет theme-base/blocks/Footer).
export const FooterPuckConfig = {
  label: 'Подвал',
  category: 'navigation',
  // Канон theme-base/rose: Рассылка / Заголовок / Текст / Выравнивание /
  // Навигация / Информация / Соцсети / Копирайт / Цветовая схема / Отступы.
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
    heading: {
      type: 'object',
      label: '',
      objectFields: {
        text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        size: { type: 'select', label: 'Размер заголовка', options: sizeOptions },
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
    // Скрыто по решению владельца (как в theme-base): в панели подвала остаются
    // «Рассылка» и оформление. Колонки/соцсети/копирайт наполняются из настроек
    // магазина автоматически.
    contentAlign: { type: 'hidden', label: '' },
    siteTitle: { type: 'hidden', label: '' },
    bottomStrip: { type: 'hidden', label: '' },
    navigationColumn: { type: 'hidden', label: '' },
    informationColumn: { type: 'hidden', label: '' },
    socialColumn: { type: 'hidden', label: '' },
    copyright: { type: 'hidden', label: '' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  // ДЕФОЛТЫ satin (манера темы) — СОХРАНЕНЫ как есть (newsletter ВКЛ + ALL-CAPS,
  // satin-колонки). Новые superset-ключи (variant/siteTitle/bottomStrip/copyright/
  // colorScheme) опциональны → опущены; рендер использует литеральные фолбэки
  // (satin «пиксель»), как и до фикса.
  defaults: {
    newsletter: {
      enabled: true,
      heading: 'ПОДПИСАТЬСЯ НА РАССЫЛКУ',
      description: 'Получайте новости и специальные предложения.',
      placeholder: 'email@example.ru',
    },
    heading: { text: '', size: 'small', alignment: 'center' },
    text: { content: '', size: 'small' },
    contentAlign: 'left',
    navigationColumn: {
      title: 'Навигация',
      links: [
        { label: 'Каталог', href: '/catalog' },
        { label: 'О нас', href: '/about' },
        { label: 'Контакты', href: '/contacts' },
      ],
    },
    informationColumn: {
      title: 'Информация',
      links: [
        { label: 'Политика доставки', href: '#' },
        { label: 'Политика возврата', href: '#' },
        { label: 'Условия обслуживания', href: '#' },
      ],
    },
    socialColumn: {
      title: 'Социальные сети',
      email: 'info@example.ru',
      socialLinks: [],
    },
    padding: { top: 80, bottom: 80 },
  },
  schema: FooterSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
} as unknown as BlockPuckConfig<FooterProps>;
