import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Gallery item: image OR product OR collection picker. Stored as flat
// `type` + payload fields; merchant picks kind in constructor.
const GalleryItemSchema = z.object({
  id: z.string(),
  type: z.enum(['image', 'product', 'collection']),
  url: z.string().optional(),
  alt: z.string().optional(),
  productId: z.string().nullable().optional(),
  collectionId: z.string().nullable().optional(),
});

export const GallerySchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  subheading: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  // Потолок ЗДЕСЬ НЕ СТОИТ намеренно. Канон галереи — три плитки, но живёт он
  // там, где действует: в панели (`fields.items.max`, конструктор не даёт
  // добавить четвёртую) и в портах (`items.slice(0, 3)`, рисуются первые три).
  // Схема остаётся принимающей, потому что `safeParse` — не ограничитель, а
  // приговор: жёсткий `.max(3)` отбраковал бы ЦЕЛИКОМ ревизию мерчанта,
  // успевшего добавить лишние плитки за сутки с поднятым потолком (c46a9d9e,
  // 2026-09-12 → снято), и секция умерла бы вместо того, чтобы нарисовать три.
  // min(0) — пустая галерея валидна: секция остаётся со своими текстами.
  items: z.array(GalleryItemSchema).min(0),
  layout: z.enum(['grid', 'side-by-side', 'featured']),
  // Pupa parity.
  imagePosition: z.enum(['left', 'right']).optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type GalleryProps = z.infer<typeof GallerySchema>;

export const GalleryPuckConfig: BlockPuckConfig<GalleryProps> = {
  label: 'Галерея',
  category: 'media',
  // Figma 314-34875: Содержание (header) / Заголовок (aiText) / Размер
  // заголовка / Текст (aiText) / Размер текста / Положение изображения /
  // Цветовая схема / Отступы.
  fields: {
    ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
    heading: {
      type: 'aiText',
      label: 'Заголовок',
      fieldType: 'title',
      placeholder: 'Ввести текст...',
    } as any,
    headingSize: {
      type: 'select',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    text: {
      type: 'aiText',
      label: 'Текст',
      fieldType: 'description',
      placeholder: 'Ввести текст...',
    } as any,
    textSize: {
      type: 'select',
      label: 'Размер текста',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    imagePosition: {
      type: 'radio',
      label: 'Положение изображения',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Items — sub-panel array, редактирование через subsection click.
    items: {
      type: 'array',
      label: 'Элементы (макс 3)',
      hiddenInMainPanel: true,
      arrayFields: {
        type: {
          type: 'radio',
          label: 'Тип',
          options: [
            { label: 'Изображение', value: 'image' },
            { label: 'Товар', value: 'product' },
            { label: 'Коллекция', value: 'collection' },
          ],
        },
        // Figma 1236-42152: элемент «Изображение» = шапка панели «Изображение»
        // (тип) + ГОЛЫЙ бокс «Добавить фото» без field-лейбла (label='' →
        // FocusedItemPanel рендерит без FieldGroup-заголовка).
        url: { type: 'image', label: '' },
        // alt-текст убран из сайдбара Галереи (по требованию тестера). Значение
        // item.alt сохраняется в схеме для рендера <img alt> (SEO).
        alt: { type: 'hidden', label: '' },
        // Figma 1236-42152: «Товар» = «Выбор товара», «Коллекция» = «Выбор
        // коллекции» (лейбл над picker'ом; шапка панели = имя типа).
        productId: { type: 'productPicker', label: 'Выбор товара' },
        collectionId: { type: 'collectionPicker', label: 'Выбор коллекции' },
      },
      defaultItemProps: { id: '', type: 'image', url: '', alt: '' },
      // Канон: три плитки. Владелец, 2026-09-13 — «в галерее сделал так, что
      // можно добавлять больше фоток, хотя такого не должно быть».
      max: 3,
    } as any,
    // Hidden — нет в Figma 314-34875.
    layout: { type: 'hidden', label: '' },
    headingAlignment: { type: 'hidden', label: '' },
    subheading: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: '',
    subheading: '',
    items: [
      { id: 'item-1', type: 'image', url: '', alt: 'Изображение' },
      { id: 'item-2', type: 'product', productId: null },
      { id: 'item-3', type: 'collection', collectionId: null },
    ],
    layout: 'featured',
    imagePosition: 'left',
    headingSize: 'medium',
    textSize: 'medium',
    // 80/80 снят: инлайн-стиль отступа ПЕРЕБИВАЕТ классную лесенку порта
    // (замер рендером: с пропом `style="padding-top:80px"`, без пропа —
    // стиля нет и работают классы темы: rose 56→140px, vanilla 80→112,
    // flux 40→64, satin 32→56, bloom 80→120). Дефолт панели не «подсказка»:
    // updateProp вписывает его в секцию при ЛЮБОЙ правке, поэтому все пять
    // тем сплющивало в одинаковые 80/80. Отсутствие значения = ритм темы;
    // panel-field-defaults держит для `padding` явное исключение с причиной.
  },
  schema: GallerySchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 }, maxItems: 3 },
};
