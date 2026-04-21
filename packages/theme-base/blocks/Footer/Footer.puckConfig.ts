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
  colorScheme: z.number().int().min(1).max(4),
  copyrightColorScheme: z.number().int().min(1).max(4),
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
    newsletter: { type: 'object', label: 'Рассылка' },
    heading: { type: 'object', label: 'Заголовок' },
    text: { type: 'object', label: 'Текст' },
    navigationColumn: { type: 'object', label: 'Навигация' },
    informationColumn: { type: 'object', label: 'Информация' },
    socialColumn: { type: 'object', label: 'Соц. сети' },
    colorScheme: { type: 'number', label: 'Цветовая схема' },
    copyrightColorScheme: { type: 'number', label: 'Схема копирайта' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
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
    colorScheme: 1,
    copyrightColorScheme: 1,
    padding: { top: 80, bottom: 80 },
  },
  schema: FooterSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
