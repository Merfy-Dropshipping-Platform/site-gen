import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const PageLinkSchema = z.union([
  z.string(),
  z.object({
    href: z.string(),
    text: z.string().optional(),
  }),
]);

const SlideSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  subtitle: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  button: z.object({
    text: z.string().optional(),
    link: PageLinkSchema.optional(),
  }).optional(),
  // Pupa parity: per-slide layout + theme.
  image: z.string().optional(),
  // Figma node 1:33170: «Затемнение» — per-slide (панель «Слайд»). Порты читают
  // s.overlay с fallback на section-level p.overlay (backward-compat).
  overlay: z.number().int().min(0).max(100).optional(),
  container: z.enum(['true', 'false']).optional(),
  // Per-slide 9-grid позиция (как Hero): размещает контент-блок слайда по сетке
  // 3×3. `center` = середина-центр. Legacy left/center/right совместимы (резолвятся
  // как center-left/center/center-right в Slideshow.astro).
  position: z.enum([
    'center',
    'top-left', 'top-center', 'top-right',
    'center-left', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
    'left', 'right',
  ]).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
});

export const SlideshowSchema = z.object({
  slides: z.array(SlideSchema).min(1).max(5),
  // Pixel-perfect 314-34834: slider 1-20 step 1 (раньше было 3/5/7/9 enum).
  interval: z.number().int().min(1).max(60),
  autoplay: z.boolean(),
  // Pupa parity. 314-34834 показывает 2 опции — fullscreen / contained.
  // Legacy left/right values сохраняются для backward-compat.
  imagePosition: z.enum(['fullscreen', 'contained', 'left', 'right']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  // 'counter' (Счётчик) добавлен по Figma 314-34834. Legacy 'lines'/'none' тоже.
  pagination: z.enum(['numbers', 'dots', 'lines', 'none', 'counter']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Vertical alignment of slide
   * content (heading/subtitle/cta) within the slide. `center` (default)
   * preserves pre-084 behaviour. `left` aligns content to the start so
   * Vanilla home can render the offset hero card.
   */
  contentAlign: z.enum(['center', 'left']).optional(),
  /**
   * 084 vanilla pilot — additive variant. CTA button visual style.
   * `solid` (default) preserves pre-084 themed bg+border. `outlined`
   * renders transparent fill + 1.3px white border + uppercase, matching
   * Vanilla scheme-1 Figma reference.
   */
  buttonStyle: z.enum(['solid', 'outlined']).optional(),
  /**
   * 084 vanilla pilot: additive `imageFullBleed` variant. When true, slide
   * background image breaks out of parent container to span full viewport
   * width (100vw). Used by vanilla hero (1920×880 per Figma) while content
   * stays inside container max-width. Default false preserves rose/satin
   * /bloom/flux behaviour where image is constrained by container.
   */
  imageFullBleed: z.boolean().optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type SlideshowProps = z.infer<typeof SlideshowSchema>;

export const SlideshowPuckConfig: BlockPuckConfig<SlideshowProps> = {
  label: 'Слайд-шоу',
  category: 'hero',
  fields: {
    slides: {
      type: 'array',
      label: 'Слайды (макс 5)',
      arrayFields: {
        // Figma node 1:33170 — панель «Слайд», порядок сверху вниз: Изображение,
        // Затемнение, Содержание(разделитель), Заголовок, Размер заголовка, Текст,
        // Размер текста, Кнопка, Ссылка, Контейнер(тумблер), Позиция, Выравнивание,
        // Цветовая схема. heading/text/button = объект с label:'' → FocusedItemPanel
        // рендерит под-поля ПЛОСКИМИ отдельными группами (как Figma) БЕЗ смены формы
        // данных (heading остаётся {text,size} и т.д.).
        image: { type: 'image', label: 'Изображение' },
        // Legacy-дубль скрыт (Figma показывает одно «Изображение»).
        imageUrl: { type: 'hidden', label: '' },
        overlay: { type: 'slider', label: 'Затемнение', min: 0, max: 100, step: 5 } as any,
        contentHeader: { type: 'section-header', label: 'Содержание' } as any,
        heading: {
          type: 'object',
          label: '',
          objectFields: {
            text: { type: 'aiText', label: 'Заголовок', fieldType: 'title' } as any,
            size: {
              type: 'select',
              label: 'Размер заголовка',
              options: [
                { label: 'Маленький', value: 'small' },
                { label: 'Средний', value: 'medium' },
                { label: 'Большой', value: 'large' },
              ],
            },
          },
        },
        text: {
          type: 'object',
          label: '',
          objectFields: {
            content: { type: 'aiText', label: 'Текст', fieldType: 'description' } as any,
            size: {
              type: 'select',
              label: 'Размер текста',
              options: [
                { label: 'Маленький', value: 'small' },
                { label: 'Средний', value: 'medium' },
                { label: 'Большой', value: 'large' },
              ],
            },
          },
        },
        button: {
          type: 'object',
          label: '',
          objectFields: {
            text: { type: 'text', label: 'Кнопка', placeholder: '*Оставьте пустой, чтобы скрыть' } as any,
            link: { type: 'pagePicker', label: 'Ссылка' },
          },
        },
        container: {
          type: 'toggle',
          label: 'Контейнер',
          toggleLabel: 'Скрыть/показать',
          options: [
            { label: 'Показать', value: 'true' },
            { label: 'Скрыть', value: 'false' },
          ],
        } as any,
        position: {
          type: 'select',
          label: 'Позиция',
          options: [
            { label: 'Сверху слева', value: 'top-left' },
            { label: 'Сверху в центре', value: 'top-center' },
            { label: 'Сверху справа', value: 'top-right' },
            { label: 'По центру слева', value: 'center-left' },
            { label: 'По центру', value: 'center' },
            { label: 'По центру справа', value: 'center-right' },
            { label: 'Снизу слева', value: 'bottom-left' },
            { label: 'Снизу по центру', value: 'bottom-center' },
            { label: 'Снизу справа', value: 'bottom-right' },
          ],
        },
        alignment: { type: 'alignment', label: 'Выравнивание' },
        colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
      },
      defaultItemProps: {
        id: '',
        imageUrl: '',
        heading: { text: '', size: 'medium' },
        text: { content: '', size: 'medium' },
        button: { text: 'Подробнее', link: '/catalog' },
        container: 'true',
        position: 'center',
        alignment: 'center',
      },
      max: 5,
    },
    // По Figma 314-34834: 5 sections — Слайды (array header) / Положение
    // изображения (2-pill) / Размер (select) / Интервал (slider) /
    // Нумерация страниц (select). Затем стандарт — Цветовая схема + Отступы.
    imagePosition: {
      type: 'radio',
      label: 'Положение изображения',
      options: [
        { label: 'На весь экран', value: 'fullscreen' },
        { label: 'Окно', value: 'contained' },
      ],
    },
    size: {
      type: 'select',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    interval: { type: 'slider', label: 'Интервал', min: 1, max: 20, step: 1 } as any,
    pagination: {
      type: 'select',
      label: 'Нумерация страниц',
      options: [
        { label: 'Числа', value: 'numbers' },
        { label: 'Точки', value: 'dots' },
        { label: 'Счётчик', value: 'counter' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-34834.
    overlay: { type: 'hidden', label: '' },
    autoplay: { type: 'hidden', label: '' },
    contentAlign: { type: 'hidden', label: '' },
    buttonStyle: { type: 'hidden', label: '' },
    imageFullBleed: { type: 'hidden', label: '' } as any,
  },
  defaults: {
    // Figma 1:19335 — плейсхолдер пустого состояния (слайды без картинки → landscape-плейсхолдер).
    slides: [
      {
        id: 'slide-1',
        imageUrl: '',
        heading: 'Слайд-шоу',
        subtitle: 'Добавь несколько изображений с информацией о своём бренде',
        ctaText: 'Кнопка',
        ctaUrl: '/catalog',
      },
      {
        id: 'slide-2',
        imageUrl: '',
        heading: 'Слайд-шоу',
        subtitle: 'Добавь несколько изображений с информацией о своём бренде',
        ctaText: 'Кнопка',
        ctaUrl: '/catalog',
      },
    ],
    interval: 5,
    autoplay: true,
    imagePosition: 'fullscreen',
    size: 'large',
    pagination: 'numbers',
    padding: { top: 80, bottom: 80 },
  },
  schema: SlideshowSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxSlides: 5,
    intervals: [3, 5, 7, 9],
  },
};
