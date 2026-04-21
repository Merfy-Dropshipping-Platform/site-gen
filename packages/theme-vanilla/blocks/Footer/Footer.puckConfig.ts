import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Vanilla Footer override.
// Keeps the same prop SHAPE as @merfy/theme-base/blocks/Footer so that merchant
// content migrates 1:1 between themes. Social platforms are restricted to the
// same whitelist (telegram, vk, youtube, tiktok, dzen).

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
  label: 'Подвал (Vanilla)',
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
      enabled: true,
      heading: 'Подпишитесь на рассылку',
      description: 'Получайте новости и специальные предложения.',
      placeholder: 'email@example.ru',
    },
    heading: { text: '', size: 'small', alignment: 'center' },
    text: { content: '', size: 'small' },
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
    colorScheme: 3,
    copyrightColorScheme: 3,
    padding: { top: 80, bottom: 80 },
  },
  schema: FooterSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
