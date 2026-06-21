import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Satin MultiRows — КОНТРОЛЫ (fields/schema/label/category) приведены к КАНОНУ
// theme-base/blocks/MultiRows/MultiRows.puckConfig.ts ДОСЛОВНО (inline-копия —
// value-импорт из @merfy/theme-base не резолвится в compiled dist; cross-package
// import ломает билд-компилятор блоков). Сайдбар satin = идентичен другим темам.
// ДЕФОЛТЫ (объект defaults) — satin'овские СОХРАНЕНЫ как манера темы (2 ряда,
// padding 80/80, ALL-CAPS заголовки). Рендер satin не меняется: live-порт
// themes/satin/src/components/sections/MultiRows.astro уже читает канон-пропсы.

const MultiRowItemSchema = z.object({
  id: z.string(),
  heading: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  imagePosition: z.enum(['left', 'right']).optional(),
  button: z.object({
    text: z.string().optional(),
    href: z.string().optional(),
    link: z.string().optional(),
  }).optional(),
  // Pupa parity per-row.
  image: z.string().optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  title: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  description: z.string().optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
});

export const MultiRowsSchema = z.object({
  rows: z.array(MultiRowItemSchema).min(1).max(10),
  // Pupa parity.
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  _headingLegacy: z.string().optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  rowsPosition: z.enum(['left', 'right', 'alternate']).optional(),
  buttonStyle: z.enum(['primary', 'black', 'white']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiRowsProps = z.infer<typeof MultiRowsSchema>;

export const MultiRowsPuckConfig: BlockPuckConfig<MultiRowsProps> = {
  label: 'Мультиряды',
  category: 'layout',
  // Figma 314-34963: Высота / Ширина / Позиция рядов (toggle) /
  // Содержание (header) / Заголовок (aiText) / Размер заголовка /
  // Выбор кнопки (select) / Выравнивание / Цветовая схема /
  // Цветовая схема (контейнер) / Отступы.
  fields: {
    size: {
      type: 'select',
      label: 'Высота',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
      ],
    },
    width: {
      type: 'select',
      label: 'Ширина',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
      ],
    },
    rowsPosition: {
      type: 'radio',
      label: 'Позиция рядов',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Справа', value: 'right' },
      ],
    },
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
    buttonStyle: {
      type: 'select',
      label: 'Выбор кнопки',
      options: [
        { label: 'Основная', value: 'primary' },
        { label: 'Чёрная', value: 'black' },
        { label: 'Белая', value: 'white' },
      ],
    },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-34963.
    headingAlignment: { type: 'hidden', label: '' },
    _headingLegacy: { type: 'hidden', label: '' } as any,
    rows: {
      type: 'array',
      label: 'Ряды (макс 10)',
      hiddenInMainPanel: true,
      arrayFields: {
        image: { type: 'image', label: 'Изображение' },
        size: {
          type: 'radio',
          label: 'Высота',
          options: [
            { label: 'Маленькая', value: 'small' },
            { label: 'Средняя', value: 'medium' },
            { label: 'Большая', value: 'large' },
          ],
        },
        // Hidden — per-row "Ширина изображения" не читается рендером (.astro
        // применяет только per-row size→aspect); нет в каноне MultiColumns
        // arrayFields. Поле схемы сохранено для совместимости данных.
        width: { type: 'hidden', label: '' } as any,
        title: { type: 'text', label: 'Заголовок' },
        headingSize: {
          type: 'radio',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        description: { type: 'textarea', label: 'Описание' },
        textSize: {
          type: 'radio',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        button: {
          type: 'object',
          label: 'Кнопка',
          objectFields: {
            text: { type: 'text', label: 'Текст' },
            link: { type: 'pagePicker', label: 'Ссылка' },
          },
        },
      },
      defaultItemProps: {
        id: '',
        image: '',
        title: '',
        description: '',
        button: { text: 'Подробнее', link: '/catalog' },
      },
      max: 10,
    } as any,
  },
  // ДЕФОЛТЫ satin (манера темы) — СОХРАНЕНЫ. НЕ канон-дефолты: 2 ряда с
  // фото-плейсхолдерами и ALL-CAPS заголовками satin, padding 80/80, без
  // top-level heading. Live-порт читает heading/text/imageUrl/imagePosition/
  // button.href как канон-пропсы → вид satin байт-в-байт.
  defaults: {
    // Figma 1:19335 — плейсхолдер пустого состояния (ряды без картинки → landscape-плейсхолдер).
    rows: [
      {
        id: 'row-1',
        heading: 'Изображение с текстом',
        text: 'Покажи и расскажи о своем товаре в одном блоке',
        imageUrl: '',
        imagePosition: 'left',
        button: { text: 'Кнопка', href: '/about' },
      },
      {
        id: 'row-2',
        heading: 'Изображение с текстом',
        text: 'Покажи и расскажи о своем товаре в одном блоке',
        imageUrl: '',
        imagePosition: 'right',
        button: { text: 'Кнопка', href: '/about' },
      },
    ],
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiRowsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};
