import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Hero block — supports 4 variants:
 *   - centered  — single bg image + centered text (default)
 *   - split     — side-by-side image + text
 *   - overlay   — fullbleed bg image + overlay + centered text
 *   - grid-4    — 2x2 image grid + centered text (Rose-style collage)
 *
 * `image` is the canonical single-image shape (used by centered/split/overlay).
 * `images` is an optional array (4 items used by grid-4; falls back to repeating `image`).
 */
export const HeroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  images: z.array(z.object({ url: z.string(), alt: z.string() })).max(8).optional(),
  cta: z.object({ text: z.string(), href: z.string() }),
  variant: z.enum(['centered', 'split', 'overlay', 'grid-4', 'split-bloom']),
  // Pupa parity: nested heading/text + primary/secondary buttons + extended position.
  heading: z.object({
    text: z.string(),
    // size optional — поле убрано из UI (единый секционный «Размер» p.size);
    // старые данные с size валидны, новый heading без size не дропается.
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  text: z.object({
    content: z.string(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  // link принимает обе формы: string ('/catalog') или object ({ href: '/catalog' }).
  // Constructor defaultPagesData пишет object form — при строгом schema=string
  // primaryButton дропался при safeParse → кнопка пропадала при изменении других
  // props. Hero.astro и так нормализует обе формы.
  primaryButton: z.object({
    text: z.string(),
    link: z.union([z.string(), z.object({ href: z.string() })]),
  }).optional(),
  secondaryButton: z.object({
    text: z.string(),
    link: z.union([z.string(), z.object({ href: z.string() })]),
  }).optional(),
  contentPosition: z.enum([
    'center',
    'top-left', 'top-center', 'top-right',
    'center-left', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]).optional(),
  position: z.enum([
    'center',
    'top-left', 'top-center', 'top-right',
    'center-left', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right',
  ]).optional(),
  backgroundImage: z.string().optional(),
  backgroundImage2: z.string().optional(),
  backgroundImages: z.object({
    url1: z.string().optional(),
    url2: z.string().optional(),
  }).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  overlay: z.number().int().min(0).max(100).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  container: z.enum(['true', 'false']).optional(),
  colorScheme: z.string().optional(),
  // 084 vanilla pilot — additive carousel mode. Default 'single' preserves
  // pre-edit rose render byte-for-byte. 'carousel' enables slides[] +
  // pagination + autoplay (ported from Slideshow block).
  mode: z.enum(['single', 'carousel']).optional(),
  slides: z.array(z.object({
    id: z.string(),
    imageUrl: z.string(),
    heading: z.object({
      text: z.string(),
      size: z.enum(['small', 'medium', 'large']),
    }).optional(),
    text: z.object({
      content: z.string(),
      size: z.enum(['small', 'medium', 'large']),
    }).optional(),
    buttonText: z.string().optional(),
    buttonLink: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
  })).max(8).optional(),
  pagination: z.enum(['numbers', 'dots', 'lines', 'none']).optional(),
  autoplay: z.boolean().optional(),
  interval: z.number().int().min(1).max(60).optional(),
  imageFullBleed: z.boolean().optional(),
  contentAlign: z.enum(['center', 'left']).optional(),
  buttonStyle: z.enum(['solid', 'outlined']).optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type HeroProps = z.infer<typeof HeroSchema>;

export const HeroPuckConfig: BlockPuckConfig<HeroProps> = {
  label: 'Изображение',
  category: 'hero',
  fields: {
    // Порядок по Figma 314-34815:
    // 1. Изображения, 2. Размер, 3. Затемнение, 4. (раздел «Содержание»),
    // 5. Позиция, 6. Выравнивание, 7. Контейнер, 8. Цветовая схема, 9. Отступы.
    backgroundImages: { type: 'imagePair', label: 'Изображения' } as any,
    // Hidden — нет в Figma 314-34815, данные сохраняются для рендера.
    variant: { type: 'hidden', label: '' },
    contentPosition: { type: 'hidden', label: '' } as any,
    // Legacy fields — скрыты из sidebar; данные сохраняются для backward-compat,
    // но редактирование идёт через backgroundImages (imagePair).
    backgroundImage: { type: 'hidden', label: '' },
    backgroundImage2: { type: 'hidden', label: '' },
    // heading / text / primaryButton / secondaryButton — видны только в
    // sub-panel'е при click на subsection в превью (NamedFocusedPanel).
    // hiddenInMainPanel=true → CustomFieldsPanel dynamic renderer пропускает
    // в main panel, но field config остаётся валидным для sub-panel.
    heading: {
      type: 'object',
      label: 'Заголовок',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        // «Размер заголовка» (heading.size) — ОТДЕЛЬНОЕ поле размера ШРИФТА заголовка,
        // НЕ путать с секционным «Размер» (p.size = ВЫСОТА секции). Возвращено по
        // решению владельца (откат unify ee611471): два независимых регулятора —
        // высота секции (p.size) и кегль заголовка (heading.size). Опционально:
        // отсутствие → дефолтный (крупный) шрифт темы, старые ревизии без size не меняются.
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
    } as any,
    text: {
      type: 'object',
      label: 'Текст',
      hiddenInMainPanel: true,
      objectFields: {
        content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        // «Размер текста» (text.size) — ОТДЕЛЬНОЕ поле размера ШРИФТА текста,
        // независимо от секционного «Размер» (p.size = высота). Возвращено по решению
        // владельца. Опционально → отсутствие = дефолтный размер темы (совместимость).
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
    } as any,
    primaryButton: {
      type: 'object',
      label: 'Кнопка основная',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    } as any,
    secondaryButton: {
      type: 'object',
      label: 'Кнопка вторичная',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'text', label: 'Текст' },
        link: { type: 'pagePicker', label: 'Ссылка' },
      },
    } as any,
    // Legacy fields — скрыты, заменены на heading / text / backgroundImages /
    // primaryButton. Данные сохраняются 1-в-1 (backward-compat при rollback).
    title: { type: 'hidden', label: '' },
    subtitle: { type: 'hidden', label: '' },
    image: { type: 'hidden', label: '' },
    images: { type: 'hidden', label: '' },
    cta: { type: 'hidden', label: '' },
    // Pupa parity: дополнительные параметры секции.
    size: {
      type: 'select',
      label: 'Размер',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    overlay: { type: 'slider', label: 'Затемнение', min: 0, max: 100, step: 5 },
    // Раздел «Содержание» — black 16px subheader перед Позиция / Выравнивание /
    // Контейнер. Не контрол, не сохраняется в props (decorative only).
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
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
        { label: 'Справа снизу', value: 'bottom-right' },
      ],
    },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    // Figma 314-34815: Контейнер = toggle switch «Скрыть/показать»,
    // не две кнопки. FieldRenderer переключает toggle ↔ boolean,
    // legacy 'true'/'false' strings совместимы (Hero.astro приводит).
    // toggleLabel removed (user #7) — FieldRenderer falls through to
    // dynamic inlineLabel = isOn ? "Показать" : "Скрыть" (mobile pattern).
    container: {
      type: 'toggle',
      label: 'Контейнер',
    } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    // Carousel mode + slides — advanced, скрыты по умолчанию в sidebar.
    // Theme rendering обрабатывает existing data normally если есть, но
    // редактирование slides убрано чтобы не загромождать sidebar.
    mode: { type: 'hidden', label: '' },
    slides: {
      type: 'hidden',
      label: 'Слайды (карусель)',
      arrayFields: {
        id: { type: 'text', label: 'ID' },
        imageUrl: { type: 'image', label: 'Фото' },
        heading: {
          type: 'object',
          label: 'Заголовок',
          objectFields: {
            text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
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
          label: 'Текст',
          objectFields: {
            content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
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
        buttonText: { type: 'text', label: 'Текст кнопки' },
        buttonLink: { type: 'pagePicker', label: 'Ссылка кнопки' },
        alignment: { type: 'alignment', label: 'Выравнивание' },
      },
      defaultItemProps: { id: '', imageUrl: '' },
      max: 8,
    },
    pagination: { type: 'hidden', label: '' },
    autoplay: { type: 'hidden', label: '' },
    interval: { type: 'hidden', label: '' },
    // Hidden — нет в Figma 314-34815.
    imageFullBleed: { type: 'hidden', label: '' },
    contentAlign: { type: 'hidden', label: '' },
    buttonStyle: { type: 'hidden', label: '' },
    // В Figma 314-34815 «Отступы» нет — скрыто из sidebar. Padding в данных
    // сохраняется (для Hero.astro), но мерчант не редактирует.
    padding: { type: 'hidden', label: '' } as any,
  },
  defaults: {
    title: 'Добро пожаловать',
    subtitle: '',
    image: { url: '', alt: '' },
    images: undefined,
    cta: { text: 'Смотреть каталог', href: '/catalog' },
    variant: 'centered',
    contentPosition: 'center',
    padding: { top: 80, bottom: 80 },
  },
  schema: HeroSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
