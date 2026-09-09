import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

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
  hidden: z.boolean().optional(),
  // Pupa parity per-row.
  image: z.string().optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  title: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  description: z.string().optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
});

export const MultiRowsAuthoringSchema = z.object({
  rows: z.array(MultiRowItemSchema).min(1).max(10),
  // Pupa parity.
  heading: z.string().optional(),
  _headingLegacy: z.string().optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  rowsPosition: z.enum(['left', 'right']).optional(),
  buttonStyle: z.enum(['primary', 'secondary']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  containerEnabled: z.enum(['true', 'false']).optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export const MultiRowsSchema = MultiRowsAuthoringSchema;
export type MultiRowsProps = z.infer<typeof MultiRowsAuthoringSchema>;

export interface MultiRowsStoredInput {
  heading?: unknown;
  headingAlignment?: unknown;
  headingSize?: unknown;
  size?: unknown;
  width?: unknown;
  rowsPosition?: unknown;
  buttonStyle?: unknown;
  alignment?: unknown;
  colorScheme?: unknown;
  containerEnabled?: unknown;
  containerColorScheme?: unknown;
  padding?: unknown;
  rows?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;

export function normalizeMultiRowsStoredProps(input: unknown): MultiRowsProps | unknown {
  if (!isRecord(input)) return input;
  const raw = input as MultiRowsStoredInput;
  const heading = isRecord(raw.heading) ? raw.heading : undefined;
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((entry, index) => {
    const row = isRecord(entry) ? entry : {};
    const button = isRecord(row.button) ? row.button : undefined;
    const enabled = button?.enabled !== 'false';
    return {
      id: typeof row.id === 'string' ? row.id : `row-${index + 1}`,
      title: typeof row.title === 'string' ? row.title : typeof row.heading === 'string' ? row.heading : '',
      description: typeof row.description === 'string' ? row.description : typeof row.text === 'string' ? row.text : '',
      image: typeof row.image === 'string' ? row.image : typeof row.imageUrl === 'string' ? row.imageUrl : '',
      size: enumValue(row.size, ['small', 'medium', 'large'], 'medium'),
      ...(typeof row.width === 'string' ? { width: enumValue(row.width, ['small', 'medium', 'large', 'full'], 'large') } : {}),
      headingSize: enumValue(row.headingSize, ['small', 'medium', 'large'], 'small'),
      textSize: enumValue(row.textSize, ['small', 'medium', 'large'], 'small'),
      ...(row.imagePosition === 'left' || row.imagePosition === 'right' ? { imagePosition: row.imagePosition } : {}),
      ...(typeof row.hidden === 'boolean' ? { hidden: row.hidden } : {}),
      button: {
        text: enabled && typeof button?.text === 'string' ? button.text : '',
        href: typeof button?.href === 'string'
          ? button.href
          : typeof button?.link === 'string' ? button.link : '#',
      },
    };
  });
  const rawButtonStyle = resolveMultiRowsButtonStyle(raw.buttonStyle);
  return {
    heading: typeof raw.heading === 'string' ? raw.heading : typeof heading?.text === 'string' ? heading.text : '',
    headingAlignment: enumValue(raw.headingAlignment ?? heading?.alignment, ['left', 'center', 'right'], 'center'),
    headingSize: enumValue(raw.headingSize ?? heading?.size, ['small', 'medium', 'large'], 'medium'),
    ...(raw.size === 'small' || raw.size === 'medium' || raw.size === 'large' ? { size: raw.size } : {}),
    ...(raw.width === 'small' || raw.width === 'medium' || raw.width === 'large' || raw.width === 'full' ? { width: raw.width } : {}),
    rowsPosition: raw.rowsPosition === 'right' ? 'right' : 'left',
    buttonStyle: rawButtonStyle,
    alignment: enumValue(raw.alignment, ['left', 'center', 'right'], 'left'),
    ...(typeof raw.colorScheme === 'string' ? { colorScheme: raw.colorScheme } : {}),
    ...(typeof raw.containerEnabled === 'string' ? { containerEnabled: raw.containerEnabled } : {}),
    ...(typeof raw.containerColorScheme === 'string' ? { containerColorScheme: raw.containerColorScheme } : {}),
    padding: isRecord(raw.padding) ? raw.padding : { top: 80, bottom: 80 },
    rows,
  };
}

export const MultiRowsStoredSchema: z.ZodType<MultiRowsProps, z.ZodTypeDef, unknown> =
  z.preprocess(normalizeMultiRowsStoredProps, MultiRowsAuthoringSchema);

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
        { label: 'Вторичная', value: 'secondary' },
      ],
    },
    alignment: { type: 'alignment', label: 'Выравнивание' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    // Legacy data keeps this value, but the updated Figma contract has no
    // separate container on/off control for MultiRows.
    containerEnabled: { type: 'hidden', label: '' } as any,
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
          type: 'select',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        // Hidden — per-row "Ширина изображения" не читается рендером (.astro
        // применяет только per-row size→aspect); нет в каноне MultiColumns
        // arrayFields. Поле схемы сохранено для совместимости данных.
        width: { type: 'hidden', label: '' } as any,
        // Figma 1:33349 — divider «Содержание» в панели ряда (перед контентом).
        ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
        title: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        headingSize: {
          type: 'select',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        description: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        textSize: {
          type: 'select',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        button: {
          type: 'object',
          // Figma 1:33349 — плоско: «Кнопка» (текст) + «Ссылка» (пейдж-пикер),
          // без тёмного заголовка-объекта. Форма данных {text,link} не меняется.
          label: '',
          objectFields: {
            text: { type: 'text', label: 'Кнопка' },
            link: { type: 'pagePicker', label: 'Ссылка' },
          },
        },
      },
      defaultItemProps: {
        id: '',
        image: '',
        title: '',
        description: '',
        // Figma 1:33349 — дропдауны по умолчанию «Маленький» (не пустые «Выберите...»).
        size: 'small',
        headingSize: 'small',
        textSize: 'small',
        button: { text: 'Подробнее', link: '/catalog' },
      },
      max: 10,
    } as any,
  },
  defaults: {
    // rowsPosition: ряды ВСЕГДА чередуют сторону медиа по индексу; свитчер
    // Слева/Справа задаёт сторону ПЕРВОГО ряда. Дефолт 'left' (ряд 0 слева).
    rowsPosition: 'left',
    size: 'small',
    width: 'small',
    // Figma 1:19335 — плейсхолдер пустого состояния (ряды без своей картинки → landscape-плейсхолдер).
    rows: [
      {
        id: 'row-1',
        title: 'Изображение с текстом',
        description: 'Покажи и расскажи о своем товаре в одном блоке',
        imageUrl: '',
        size: 'small',
        headingSize: 'small',
        textSize: 'small',
        button: { text: 'Кнопка', href: '/about' },
      },
      {
        id: 'row-2',
        title: 'Изображение с текстом',
        description: 'Покажи и расскажи о своем товаре в одном блоке',
        imageUrl: '',
        size: 'small',
        headingSize: 'small',
        textSize: 'small',
        button: { text: 'Кнопка', href: '/about' },
      },
    ],
    headingSize: 'medium',
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiRowsAuthoringSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};

export function resolveMultiRowsImagePosition(
  rowsPosition: unknown,
  index: number,
  legacyItemPosition?: unknown,
): 'left' | 'right' {
  if (rowsPosition !== 'left' && rowsPosition !== 'right' && rowsPosition !== 'alternate') {
    if (legacyItemPosition === 'left' || legacyItemPosition === 'right') return legacyItemPosition;
  }
  const firstRowRight = rowsPosition === 'right';
  return (index % 2 === 0) === firstRowRight ? 'right' : 'left';
}

export function resolveMultiRowsButtonStyle(value: unknown): 'primary' | 'secondary' {
  return value === 'secondary' || value === 'white' ? 'secondary' : 'primary';
}

type MultiRowsSize = 'small' | 'medium' | 'large';
type MultiRowsWidth = MultiRowsSize | 'full';

export function resolveMultiRowsItemSize(
  sectionSize: unknown,
  legacyRowSize: unknown,
): MultiRowsSize {
  if (sectionSize === 'small' || sectionSize === 'medium' || sectionSize === 'large') return sectionSize;
  if (legacyRowSize === 'small' || legacyRowSize === 'medium' || legacyRowSize === 'large') return legacyRowSize;
  return 'medium';
}

export function resolveMultiRowsWidth(value: unknown): MultiRowsWidth {
  return value === 'small' || value === 'medium' || value === 'full' ? value : 'large';
}

export function getVisibleMultiRows<T extends { hidden?: unknown }>(rows: readonly T[]): T[] {
  return getVisibleMultiRowEntries(rows).map(({ item }) => item);
}

export function getVisibleMultiRowEntries<T extends { hidden?: unknown }>(
  rows: readonly T[],
): Array<{ item: T; originalIndex: number }> {
  return rows
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => item.hidden !== true);
}

export function resolveMultiRowsButton(value: unknown): { text: string; href: string } | null {
  if (!isRecord(value) || value.enabled === 'false' || typeof value.text !== 'string' || !value.text) {
    return null;
  }
  const href = typeof value.link === 'string'
    ? value.link
    : typeof value.href === 'string' ? value.href : '#';
  return { text: value.text, href };
}
