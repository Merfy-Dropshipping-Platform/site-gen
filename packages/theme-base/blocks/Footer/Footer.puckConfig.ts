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
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type FooterProps = z.infer<typeof FooterSchema>;

export const FooterPuckConfig: BlockPuckConfig<FooterProps> = {
  label: 'Подвал',
  category: 'navigation',
  fields: {
    siteTitle: { type: 'text', label: 'Название сайта' },
    copyright: { type: 'object', label: 'Копирайт' },
    newsletter: { type: 'object', label: 'Рассылка' },
    heading: { type: 'object', label: 'Заголовок' },
    text: { type: 'object', label: 'Текст' },
    navigationColumn: { type: 'object', label: 'Навигация' },
    informationColumn: { type: 'object', label: 'Информация' },
    socialColumn: { type: 'object', label: 'Соц. сети' },
    padding: { type: 'object', label: 'Отступы' },
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
