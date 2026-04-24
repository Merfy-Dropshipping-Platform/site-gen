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
  variant: z.enum(['3-col', '2-part', 'minimal']).optional(),
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

export const FooterPuckConfig: BlockPuckConfig<FooterProps> = {
  label: 'Подвал',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название сайта' },
    heading: {
      type: 'object',
      label: 'Заголовок',
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        size: { type: 'radio', label: 'Размер', options: sizeOptions },
        alignment: { type: 'alignment', label: 'Выравнивание' },
      },
    },
    text: {
      type: 'object',
      label: 'Описание',
      objectFields: {
        content: { type: 'textarea', label: 'Текст' },
        size: { type: 'radio', label: 'Размер', options: sizeOptions },
      },
    },
    newsletter: {
      type: 'object',
      label: 'Рассылка',
      objectFields: {
        enabled: {
          type: 'radio',
          label: 'Показывать форму',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
        heading: { type: 'text', label: 'Заголовок' },
        description: { type: 'textarea', label: 'Описание' },
        placeholder: { type: 'text', label: 'Плейсхолдер поля' },
      },
    },
    navigationColumn: {
      type: 'object',
      label: 'Колонка: Навигация',
      objectFields: {
        title: { type: 'text', label: 'Заголовок колонки' },
        links: linkArrayField,
      },
    },
    informationColumn: {
      type: 'object',
      label: 'Колонка: Информация',
      objectFields: {
        title: { type: 'text', label: 'Заголовок колонки' },
        links: linkArrayField,
      },
    },
    socialColumn: {
      type: 'object',
      label: 'Колонка: Соцсети',
      objectFields: {
        title: { type: 'text', label: 'Заголовок колонки' },
        email: { type: 'text', label: 'Email для связи' },
        socialLinks: {
          type: 'array',
          label: 'Соц. сети',
          arrayFields: {
            platform: {
              type: 'radio',
              label: 'Платформа',
              options: [
                { label: 'Telegram', value: 'telegram' },
                { label: 'VK', value: 'vk' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'TikTok', value: 'tiktok' },
                { label: 'Дзен', value: 'dzen' },
              ],
            },
            href: { type: 'text', label: 'Ссылка' },
          },
          defaultItemProps: { platform: 'telegram', href: '' },
          max: 5,
        },
      },
    },
    copyright: {
      type: 'object',
      label: 'Копирайт',
      objectFields: {
        companyName: { type: 'text', label: 'Название компании' },
        poweredBy: { type: 'text', label: 'Powered by текст' },
        showYear: {
          type: 'radio',
          label: 'Показывать год',
          options: [
            { label: 'Да', value: 'true' },
            { label: 'Нет', value: 'false' },
          ],
        },
      },
    },
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
};
