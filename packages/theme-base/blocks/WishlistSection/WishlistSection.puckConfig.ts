import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Секция «Избранное» — тело страницы /wishlist.
 *
 * Состав параметров — КАНОН и зафиксирован осознанно: тестировщик 14.09,
 * дословно — «В сайдбаре только цветовая схема и отступы». Ровно два поля,
 * ни одного сверх; подписи и типы взяты один-в-один у тех же полей секции
 * «Корзина» (CartSection.puckConfig.ts) — формулировки не выдумываются.
 * Сторож состава: conformance/panel-canon.json + `pnpm test:panel-canon`,
 * адресный гард — src/themes/__tests__/wishlist-section.spec.ts.
 *
 * Единственность на странице (maxInstances: 1) — как у корзины: тело страницы
 * одно, второй экземпляр рисовал бы второй грид на тот же localStorage.
 */
export const WishlistSectionSchema = z.object({
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Номер схемы 1..5. Дефолт 2 — та схема, которая у всех pupa-сайтов белая
  // (см. CartSection: scheme-1 на непересеянных сайтах чёрная).
  colorScheme: z.number().optional(),
});

export type WishlistSectionProps = z.infer<typeof WishlistSectionSchema>;

export const WishlistSectionPuckConfig: BlockPuckConfig<WishlistSectionProps> = {
  label: 'Избранное',
  category: 'layout',
  fields: {
    padding: { type: 'object', label: 'Отступы' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
  },
  defaults: {
    colorScheme: 2,
    padding: { top: 80, bottom: 80 },
  },
  schema: WishlistSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
