import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Pupa parity: PromoBanner has exactly 5 fields.
 *   text, link {text, href}, size, colorScheme, padding
 * No more, no less. Legacy linkText/linkUrl preserved for back-compat read.
 */
export const PromoBannerSchema = z.object({
  text: z.string(),
  link: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
  /**
   * 084 vanilla pilot — additive value `'thin'` added to the existing
   * size enum. Pre-084 values (`small`/`medium`/`large`) remain valid.
   */
  size: z.enum(['thin', 'small', 'medium', 'large']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Forces text transform on the
   * banner copy. `none` (default) preserves pre-084 letter casing as
   * authored. `uppercase` applies CSS uppercase for vanilla parity.
   */
  textTransform: z.enum(['none', 'uppercase']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  // Legacy back-compat fields (hidden from picker UI, read-only fallback in .astro).
  linkText: z.string().optional(),
  linkUrl: z.string().optional(),
});

export type PromoBannerProps = z.infer<typeof PromoBannerSchema>;

// Pre-existing issue: legacy `linkText`/`linkUrl` props are read-only
// fallbacks (no picker UI) so they're not in `fields:`. The Record<keyof
// Props, …> constraint flags this. Cast to keep runtime config unchanged.
export const PromoBannerPuckConfig = {
  label: 'Промо-баннер',
  category: 'hero',
  fields: {
    text: { type: 'text', label: 'Текст' },
    link: {
      type: 'object',
      label: 'Ссылка',
      objectFields: {
        text: { type: 'text', label: 'Текст ссылки' },
        href: { type: 'pagePicker', label: 'Адрес' },
      },
    },
    size: {
      type: 'radio',
      label: 'Размер',
      options: [
        { label: 'Тонкий', value: 'thin' },
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    textTransform: {
      type: 'radio',
      label: 'Регистр текста',
      options: [
        { label: 'Как введено', value: 'none' },
        { label: 'Заглавные', value: 'uppercase' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
  },
  defaults: {
    text: 'Бесплатная доставка от 3000 ₽',
    link: { text: 'Подробнее', href: '/delivery' },
    size: 'medium',
    padding: { top: 12, bottom: 12 },
  },
  schema: PromoBannerSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
} as unknown as BlockPuckConfig<PromoBannerProps>;
