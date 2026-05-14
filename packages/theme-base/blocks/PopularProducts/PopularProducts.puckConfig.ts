import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PopularProductsSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  // Figma 314-34614: «Размер заголовка» — отдельное top-level поле (Маленький/Средний/Большой).
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  subtitle: z.string().optional(),
  text: z.union([
    z.string(),
    z.object({
      content: z.string().optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  // Figma 314-34614: «Размер текста» — отдельное top-level поле.
  textSize: z.enum(['small', 'medium', 'large']).optional(),
  // Figma 314-34614: «Вид изображения» — Квадрат / Портрет / Адаптация.
  imageView: z.enum(['square', 'portrait', 'adaptive']).optional(),
  // Figma 314-34614: «Стиль кнопки» — Ссылка / Основная / Дополнительная.
  buttonStyle: z.enum(['link', 'primary', 'secondary']).optional(),
  // Figma 314-34614: «Следующее фото при наведении» — switch.
  nextPhotoOnHover: z.boolean().optional(),
  // Figma 314-34614: «Быстрое добавление» — Нет / Стандарт / Количество.
  quickAddMode: z.enum(['none', 'standard', 'count']).optional(),
  cards: z.number().int().min(2).max(24),
  columns: z.number().int().min(1).max(6),
  // Pupa parity.
  collection: z.string().nullable().optional(),
  productCard: z.object({
    columns: z.number().int().optional(),
    buttonStyle: z.enum(['link', 'primary', 'secondary']).optional(),
    cardStyle: z.enum(['auto', 'portrait', 'square', 'wide']).optional(),
    nextPhoto: z.enum(['true', 'false']).optional(),
    quickAdd: z.enum(['true', 'false']).optional(),
    buttonText: z.string().optional(),
  }).optional(),
  containerColorScheme: z.string().optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
  quickAdd: z.boolean().default(false),
  quickAddText: z.string().default('В КОРЗИНУ'),
  /**
   * 084 vanilla pilot — additive variant. Renders a 3-pip swatch overlay
   * over each product image (top-right) when the product has variant
   * groups with options. Default `undefined` (or `false`) preserves the
   * pre-084 cardMedia render — no overlay.
   */
  swatchOverlay: z.boolean().optional(),
  /**
   * 084 vanilla pilot — additive variant. Caption (title + price) casing
   * for product cards. Default `default` preserves pre-084 behaviour
   * (regular case). `uppercase` matches Vanilla home cards.
   */
  cardCaptionStyle: z.enum(['default', 'uppercase']).optional(),
  /**
   * Layout variant for product cards. `minimal` (default) keeps existing
   * rose/vanilla/bloom render. `rich` (flux per Figma 1:26389) wraps each
   * card in surface bg with colour swatches, memory chips, badges and
   * in-card CTA. Theme-set via theme.json blockDefaults.
   */
  cardVariant: z.enum(['minimal', 'rich']).optional(),
  viewAll: z.object({
    show: z.boolean().optional(),
    text: z.string().optional(),
    href: z.string().optional(),
  }).optional(),
});

export type PopularProductsProps = z.infer<typeof PopularProductsSchema>;

const sizeOptions = [
  { label: 'Маленький', value: 'small' },
  { label: 'Средний', value: 'medium' },
  { label: 'Большой', value: 'large' },
];

export const PopularProductsPuckConfig: BlockPuckConfig<PopularProductsProps> = {
  label: 'Коллекция товаров',
  category: 'products',
  // Figma 314-34614: точный порядок и набор контролов в правом сайдбаре.
  //  1. Выбор коллекции
  //  2. Карточки
  //  3. (header) Содержание
  //  4. Заголовок (aiText)
  //  5. Размер заголовка
  //  6. Текст (aiText)
  //  7. Размер текста
  //  8. (header) Карточка товара
  //  9. Стиль кнопки
  // 10. Вид изображения
  // 11. Следующее фото при наведении
  // 12. Быстрое добавление
  // 13. Колонки
  // 14. Цветовая схема
  // 15. Отступы
  fields: {
    collection: { type: 'collectionPicker', label: 'Выбор коллекции' },
    cards: { type: 'slider', label: 'Карточки', min: 2, max: 24, step: 1 },

    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    heading: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    headingSize: { type: 'select', label: 'Размер заголовка', options: sizeOptions },
    text: {
      type: 'aiText',
      label: 'Текст',
      fieldType: 'description',
      placeholder: 'Добавь текст в объявление.',
    } as any,
    textSize: { type: 'select', label: 'Размер текста', options: sizeOptions },

    ['_cardSection' as never]: { type: 'section-header', label: 'Карточка товара' } as any,
    buttonStyle: {
      type: 'select',
      label: 'Стиль кнопки',
      options: [
        { label: 'Ссылка', value: 'link' },
        { label: 'Основная', value: 'primary' },
        { label: 'Дополнительная', value: 'secondary' },
      ],
    },
    imageView: {
      type: 'select',
      label: 'Вид изображения',
      options: [
        { label: 'Квадрат', value: 'square' },
        { label: 'Портрет', value: 'portrait' },
        { label: 'Адаптация', value: 'adaptive' },
      ],
    },
    nextPhotoOnHover: {
      type: 'toggle',
      label: 'Следующее фото при наведении',
      options: [
        { label: 'Вкл', value: true },
        { label: 'Выкл', value: false },
      ],
    } as any,
    quickAddMode: {
      type: 'select',
      label: 'Быстрое добавление',
      options: [
        { label: 'Нет', value: 'none' },
        { label: 'Стандарт', value: 'standard' },
        { label: 'Количество', value: 'count' },
      ],
    },
    columns: { type: 'slider', label: 'Колонки', min: 1, max: 6, step: 1 },

    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },

    // Hidden — данные ревизий сохраняются, но в Figma 314-34614 эти контролы
    // отсутствуют. Astro-рендер может читать их через fallback chain.
    subtitle: { type: 'hidden', label: '' },
    productCard: { type: 'hidden', label: '' },
    containerColorScheme: { type: 'hidden', label: '' },
    quickAdd: { type: 'hidden', label: '' },
    quickAddText: { type: 'hidden', label: '' },
    viewAll: { type: 'hidden', label: '' },
    swatchOverlay: { type: 'hidden', label: '' },
    cardCaptionStyle: { type: 'hidden', label: '' },
    cardVariant: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Коллекция товаров',
    headingSize: 'small',
    text: '',
    textSize: 'small',
    imageView: 'square',
    buttonStyle: 'link',
    nextPhotoOnHover: false,
    quickAddMode: 'none',
    cards: 6,
    columns: 4,
    padding: { top: 80, bottom: 80 },
    quickAdd: false,
    quickAddText: 'В КОРЗИНУ',
  },
  // ts-jest types `.default(false)` input as `boolean | undefined` which
  // conflicts with the inferred `quickAdd: boolean` in Props. Pre-existing
  // issue unrelated to 084. Cast keeps the runtime schema unchanged.
  schema: PopularProductsSchema as unknown as BlockPuckConfig<PopularProductsProps>['schema'],
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 2,
    maxCards: 24,
    minColumns: 1,
    maxColumns: 6,
  },
};
