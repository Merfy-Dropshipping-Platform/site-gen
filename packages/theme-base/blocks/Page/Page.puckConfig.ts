import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Page — embed-блок, отображающий контент другой страницы магазина.
 * Sidebar (Figma 314-35117):
 *   - Выбор страницы (pagePicker)
 *   - Цветовая схема
 *   - Отступы
 */
export const PageSchema = z.object({
  pageId: z.string().optional(),
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
    pageId: { type: 'pagePicker', label: 'Выбор страницы' } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    pageId: '',
    colorScheme: 'scheme-1',
    padding: { top: 80, bottom: 80 },
  },
  schema: PageSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
