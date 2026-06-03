import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Rose Footer override.
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
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type FooterProps = z.infer<typeof FooterSchema>;

export const FooterPuckConfig: BlockPuckConfig<FooterProps> = {
  label: 'Footer',
  category: 'navigation',
  fields: {
    newsletter: { type: 'object', label: 'Рассылка' },
    heading: { type: 'object', label: 'Заголовок' },
    text: { type: 'object', label: 'Текст' },
    navigationColumn: { type: 'object', label: 'Навигация' },
    informationColumn: { type: 'object', label: 'Информация' },
    socialColumn: { type: 'object', label: 'Соц. сети' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    newsletter: {
      enabled: true,
      heading: 'Подпишитесь на нашу рассылку',
      description: 'Введите электронную почту и получайте информацию нашего бренда.',
      placeholder: 'rose@example.ru',
    },
    heading: { text: '', size: 'small', alignment: 'center' },
    text: { content: '', size: 'small' },
    navigationColumn: {
      title: 'Навигация',
      links: [
        { label: 'Главная', href: '/' },
        { label: 'Каталог', href: '/catalog' },
        { label: 'Контакты', href: '/contacts' },
      ],
    },
    informationColumn: {
      title: 'Информация',
      links: [
        { label: 'Политика доставки', href: '/delivery' },
        { label: 'Политика возврата', href: '/returns' },
        { label: 'Условия обслуживания', href: '/terms' },
      ],
    },
    socialColumn: {
      title: 'Социальные сети',
      email: 'rose@example.ru',
      socialLinks: [],
    },
    padding: { top: 80, bottom: 80 },
  },
  schema: FooterSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
