import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Секция «Запись блога» — тело системной страницы «Запись блога»
 * (`/blogs/{handle}/{slug}`, PUB-1): заголовок, дата публикации по-русски,
 * обложка, текст записи и ссылка назад, на блог.
 *
 * Какую запись показывать, решает сборка страницы: она кладёт в пропсы секции
 * `publicationId` (не поле панели). В конструкторе записи нет — показывается
 * самая свежая запись магазина (src/render/section-policy.ts).
 *
 * Поля панели — цветовая схема и отступы, как у других тел системных страниц.
 */
export const BlogPostSectionSchema = z.object({
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Номер схемы 1..5. Дефолт 2 — белая схема у всех pupa-сайтов (см. WishlistSection).
  colorScheme: z.number().optional(),
  /** Запись страницы — кладёт сборка, не панель. */
  publicationId: z.string().optional(),
});

export type BlogPostSectionProps = z.infer<typeof BlogPostSectionSchema>;

export const BlogPostSectionPuckConfig: BlockPuckConfig<BlogPostSectionProps> = {
  label: 'Запись блога',
  category: 'content',
  fields: {
    padding: { type: 'padding', label: 'Отступы' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    publicationId: { type: 'hidden', label: '' },
  },
  defaults: {
    colorScheme: 2,
    padding: { top: 80, bottom: 80 },
  },
  schema: BlogPostSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
