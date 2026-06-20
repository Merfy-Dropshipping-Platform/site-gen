import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Page («Страница») — WYSIWYG content section for static/asset pages
 * (О нас, Контакты, Доставка, custom). Shopify «main-page»-style: the merchant
 * authors the page body (headings, paragraphs, lists, emphasis, links) in a
 * rich-text editor. Renders sanitized HTML (see Page.sanitize + Page.astro).
 *
 * Replaces the prior page-link embed card (pageId/pagePicker) — removed.
 */
export const PageSchema = z.object({
  // Sanitized rich HTML. Empty → placeholder render.
  content: z.string().optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type PageProps = z.infer<typeof PageSchema>;

export const PagePuckConfig: BlockPuckConfig<PageProps> = {
  label: 'Страница',
  category: 'content',
  fields: {
    // 'wysiwyg' — TipTap rich-text editor field (constructor FieldRenderer).
    content: { type: 'wysiwyg', label: 'Содержимое' } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    content: '',
    colorScheme: 'scheme-1',
    padding: { top: 80, bottom: 80 },
  },
  schema: PageSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
