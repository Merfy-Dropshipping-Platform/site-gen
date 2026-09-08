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
  /**
   * Служебный проп видимости секции (тот же, что ставит «глаз» в outline
   * конструктора): true → секция вырезается из рендера (extractPageBlocks /
   * page-generator фильтруют `props.hidden === true`). В панели промо-баннера
   * он выведен тумблером «Скрыть/показать» — по просьбе пользователя рядом с
   * «Отступами», как у остальных секций.
   */
  hidden: z.boolean().optional(),
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
    // Тумблер показа секции (props.hidden). Первый вариант = «включено», поэтому
    // «Показать» → hidden:false. Пишет ровно тот проп, что и «глаз» в outline.
    hidden: {
      type: 'toggle',
      label: 'Показ',
      toggleLabel: 'Скрыть/показать',
      options: [
        { label: 'Показать', value: false },
        { label: 'Скрыть', value: true },
      ],
    } as any,
    // «Отступы» — как у остальных секций (пользователь #17). Высоту полосы
    // задаёт «Размер» (min-h 24/32/40/48), отступы добавляются поверх неё.
    padding: { type: 'padding', label: 'Отступы' } as any,
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
    // «Регистр текста» — по просьбе пользователя выведен в панель. Настройка
    // была живой, но скрытой: полоса рисовалась заглавными, а снять капс из
    // конструктора было нечем. Дефолт задаёт ТЕМА (`theme.json → blockDefaults`),
    // потому что фолбэк рендера у тем разный: bloom/satin/vanilla без пропа
    // дают капс, rose/flux — нет.
    textTransform: {
      type: 'select',
      label: 'Регистр текста',
      options: [
        { label: 'Как введено', value: 'none' },
        { label: 'Заглавными', value: 'uppercase' },
      ],
    } as any,
  },
  defaults: {
    text: 'Бесплатная доставка от 3000 ₽',
    link: { text: 'Подробнее', href: '/delivery' },
    size: 'medium',
    padding: { top: 0, bottom: 0 },
    hidden: false,
  },
  schema: PromoBannerSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
} as unknown as BlockPuckConfig<PromoBannerProps>;
