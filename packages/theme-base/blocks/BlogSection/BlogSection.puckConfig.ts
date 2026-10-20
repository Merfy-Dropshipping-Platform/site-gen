import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Секция «Блог» — тело системной страницы «Блог» (`/blogs/{handle}`, PUB-2).
 *
 * Список опубликованных записей ОДНОГО блога из таблицы publications: новые
 * сверху, по 12 на страницу (`BLOG_PAGE_SIZE`), переход по страницам — как в
 * каталоге (`?page=N`). Карточка: обложка, заголовок, дата по-русски, анонс.
 *
 * Какой блог показывать, решает сборка страницы: она кладёт в пропсы секции
 * `blogHandle` и `blogTitle` (это не поля панели). В конструкторе блога нет —
 * показывается блог по умолчанию «Новости» (src/render/section-policy.ts).
 *
 * Поля панели — как у других тел системных страниц («Избранное», «Вход»):
 * цветовая схема и отступы. Секция одна на странице.
 */
export const BlogSectionSchema = z.object({
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Номер схемы 1..5. Дефолт 2 — белая схема у всех pupa-сайтов (см. WishlistSection).
  colorScheme: z.number().optional(),
  /** Адрес блога — кладёт сборка страницы, не панель. */
  blogHandle: z.string().optional(),
  /** Название блога — заголовок страницы; кладёт сборка страницы. */
  blogTitle: z.string().optional(),
});

export type BlogSectionProps = z.infer<typeof BlogSectionSchema>;

export const BlogSectionPuckConfig: BlockPuckConfig<BlogSectionProps> = {
  label: 'Блог',
  category: 'content',
  fields: {
    padding: { type: 'padding', label: 'Отступы' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    blogHandle: { type: 'hidden', label: '' },
    blogTitle: { type: 'hidden', label: '' },
  },
  defaults: {
    colorScheme: 2,
    padding: { top: 80, bottom: 80 },
  },
  schema: BlogSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
