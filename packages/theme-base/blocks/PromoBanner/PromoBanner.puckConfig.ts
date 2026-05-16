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
  // Figma 314-34592: main panel — только Цветовая схема. Text/link/size
  // редактируются через sub-panel «Объявление» при subsection click.
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Sub-panel «Объявление» (314:34600) — text + link + size editable.
    text: { type: 'text', label: 'Текст', hiddenInMainPanel: true } as any,
    link: {
      type: 'object',
      label: 'Ссылка',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст ссылки' },
        href: { type: 'pagePicker', label: 'Адрес' },
      },
    } as any,
    size: {
      type: 'select',
      label: 'Размер',
      hiddenInMainPanel: true,
      options: [
        { label: 'Тонкий', value: 'thin' },
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    } as any,
    textTransform: { type: 'hidden', label: '' },
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
