import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const MultiColumnItemSchema = z.object({
  id: z.string().optional(),
  heading: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  // Pupa parity per-column: image/title/headingSize/description/textSize/link.
  image: z.string().optional(),
  imageSize: z.enum(['small', 'medium', 'large']).optional(),
  title: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  description: z.string().optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
  linkText: z.string().optional(),
  link: z.string().optional(),
  hidden: z.boolean().optional(),
});

export const MultiColumnsAuthoringSchema = z.object({
  heading: z.string().optional(),
  // Pupa parity: heading object с alignment + size (legacy `heading` text — fallback).
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAspectRatio: z.enum(['adapt', 'square', 'portrait', 'landscape']).optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  // Pupa parity: nested heading {text,alignment,size} + textPosition + background + containerColorScheme.
  textPosition: z.enum(['left', 'center']).optional(),
  containerEnabled: z.enum(['true', 'false']).optional(),
  containerColorScheme: z.string().optional(),
  link: z.string().optional(),
  columns: z.array(MultiColumnItemSchema).min(1).max(10),
  displayColumns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export const MultiColumnsSchema = MultiColumnsAuthoringSchema;
export type MultiColumnsProps = z.infer<typeof MultiColumnsAuthoringSchema>;

type LegacyToggle = { enabled?: unknown };
type LegacyHeading = { enabled?: unknown; text?: unknown; alignment?: unknown; size?: unknown };
type LegacyLink = { enabled?: unknown; text?: unknown; href?: unknown };

export interface MultiColumnsStoredInput {
  heading?: unknown;
  headingAlignment?: unknown;
  headingSize?: unknown;
  width?: unknown;
  imageAspectRatio?: unknown;
  button?: unknown;
  buttonText?: unknown;
  buttonLink?: unknown;
  link?: unknown;
  textPosition?: unknown;
  background?: LegacyToggle;
  containerEnabled?: unknown;
  containerColorScheme?: unknown;
  columnsCount?: unknown;
  displayColumns?: unknown;
  columns?: unknown;
  colorScheme?: unknown;
  padding?: unknown;
}

const DEFAULT_PADDING = { top: 80, bottom: 80 } as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;

export function normalizeMultiColumnsStoredProps(input: unknown): MultiColumnsProps | unknown {
  if (!isRecord(input)) return input;
  const raw = input as MultiColumnsStoredInput;
  const heading = isRecord(raw.heading) ? raw.heading as LegacyHeading : undefined;
  const legacySectionLink = isRecord(raw.link) ? raw.link as LegacyLink : undefined;
  const rawColumns = Array.isArray(raw.columns) ? raw.columns : [];
  const columns = rawColumns.map((entry, index) => {
    const column = isRecord(entry) ? entry : {};
    const legacyLink = isRecord(column.link) ? column.link as LegacyLink : undefined;
    const enabled = legacyLink?.enabled !== 'false';
    return {
      id: typeof column.id === 'string' ? column.id : `col-${index + 1}`,
      title: typeof column.title === 'string' ? column.title : typeof column.heading === 'string' ? column.heading : '',
      description: typeof column.description === 'string' ? column.description : typeof column.text === 'string' ? column.text : '',
      image: typeof column.image === 'string' ? column.image : typeof column.imageUrl === 'string' ? column.imageUrl : '',
      imageSize: enumValue(column.imageSize, ['small', 'medium', 'large'], 'small'),
      headingSize: enumValue(column.headingSize, ['small', 'medium', 'large'], 'small'),
      textSize: enumValue(column.textSize, ['small', 'medium', 'large'], 'small'),
      linkText: typeof column.linkText === 'string'
        ? column.linkText
        : enabled && typeof legacyLink?.text === 'string' ? legacyLink.text : '',
      link: typeof column.link === 'string'
        ? column.link
        : typeof legacyLink?.href === 'string' ? legacyLink.href : '',
      ...(typeof column.hidden === 'boolean' ? { hidden: column.hidden } : {}),
    };
  });

  return {
    heading: typeof raw.heading === 'string' ? raw.heading : typeof heading?.text === 'string' ? heading.text : '',
    headingAlignment: enumValue(raw.headingAlignment ?? heading?.alignment, ['left', 'center', 'right'], 'center'),
    headingSize: enumValue(raw.headingSize ?? heading?.size, ['small', 'medium', 'large'], 'medium'),
    width: enumValue(raw.width, ['small', 'medium', 'large', 'full'], 'large'),
    imageAspectRatio: enumValue(raw.imageAspectRatio, ['adapt', 'square', 'portrait', 'landscape'], 'square'),
    buttonText: typeof raw.buttonText === 'string' ? raw.buttonText : typeof raw.button === 'string' ? raw.button : '',
    buttonLink: typeof raw.buttonLink === 'string'
      ? raw.buttonLink
      : typeof raw.link === 'string' ? raw.link : typeof legacySectionLink?.href === 'string' ? legacySectionLink.href : '',
    textPosition: enumValue(raw.textPosition, ['left', 'center'], 'left'),
    containerEnabled: String(raw.containerEnabled ?? raw.background?.enabled ?? 'false') === 'true' ? 'true' : 'false',
    ...(typeof raw.containerColorScheme === 'string' ? { containerColorScheme: raw.containerColorScheme } : {}),
    displayColumns: resolveMultiColumnsDisplayColumns(raw),
    columns,
    ...(typeof raw.colorScheme === 'string' ? { colorScheme: raw.colorScheme } : {}),
    padding: isRecord(raw.padding) ? raw.padding : DEFAULT_PADDING,
  };
}

export const MultiColumnsStoredSchema: z.ZodType<MultiColumnsProps, z.ZodTypeDef, unknown> =
  z.preprocess(normalizeMultiColumnsStoredProps, MultiColumnsAuthoringSchema);

export const MultiColumnsPuckConfig: BlockPuckConfig<MultiColumnsProps> = {
  label: 'Мультиколонны',
  category: 'layout',
  // Figma 314-34917: Заголовок (aiText) / Размер заголовка / Ширина /
  // Соотношение изображений / Кнопка / Ссылка / Колонки (slider) /
  // Положение колонн (toggle) / Контейнер (toggle) / Цветовая схема / Отступы.
  fields: {
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
    width: {
      type: 'select',
      label: 'Ширина',
      options: [
        { label: 'Маленькая', value: 'small' },
        { label: 'Средняя', value: 'medium' },
        { label: 'Большая', value: 'large' },
      ],
    },
    imageAspectRatio: {
      type: 'select',
      label: 'Соотношение изображения',
      options: [
        { label: 'Адаптировать', value: 'adapt' },
        { label: 'Квадрат', value: 'square' },
        { label: 'Портрет', value: 'portrait' },
        { label: 'Альбом', value: 'landscape' },
      ],
    },
    // Figma 1236-42153: «Кнопка» (поле ввода) + «Ссылка» (page picker) в сайдбаре
    // секции — общая CTA под колоннами (возврат по дизайну, перекрывает #23).
    buttonText: { type: 'text', label: 'Кнопка', placeholder: '*Оставьте пустой, чтобы скрыть' } as any,
    buttonLink: { type: 'pagePicker', label: 'Ссылка' } as any,
    displayColumns: {
      type: 'slider',
      label: 'Колонки',
      min: 1,
      max: 4,
      step: 1,
    },
    textPosition: {
      type: 'radio',
      label: 'Положение текста',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Центр', value: 'center' },
      ],
    },
    // user #23: Контейнер дублировался (object с вложенным toggle). Заменил
    // на flat toggle field — рендерится FieldRenderer без nesting.
    containerEnabled: {
      type: 'toggle',
      label: 'Контейнер',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    // Figma 1236-42153 показывает ОДНУ «Цветовую схему» в сайдбаре секции →
    // «Цветовая схема контейнера» скрыта из main panel.
    containerColorScheme: { type: 'hidden', label: '' } as any,
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-34917.
    headingAlignment: { type: 'hidden', label: '' },
    link: { type: 'hidden', label: '' },
    columns: {
      type: 'array',
      label: 'Колонки (макс 10)',
      hiddenInMainPanel: true,
      // Sub-panel "Колонна" — Figma 314:34941.
      // Schema-driven: каждое поле — declarative, рендерится через FieldRenderer.
      // Никаких hardcoded panel-компонентов. Чтобы получить Figma layout —
      // declarative field types (section-header / image / aiText / select /
      // text / pagePicker) + правильные labels/placeholders.
      arrayFields: {
        _section_images: {
          type: 'section-header',
          label: 'Изображения',
        } as any,
        image: { type: 'image', label: '' } as any,
        imageSize: {
          type: 'select',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        _section_content: {
          type: 'section-header',
          label: 'Содержание',
        } as any,
        title: {
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
        description: {
          type: 'aiText',
          label: 'Текст',
          fieldType: 'text',
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
        linkText: {
          type: 'text',
          label: 'Название ссылки',
          placeholder: '*Оставьте пустой, чтобы скрыть',
        } as any,
        link: {
          type: 'pagePicker',
          label: 'Ссылка',
        } as any,
      },
      defaultItemProps: {
        id: '',
        image: '',
        imageSize: 'medium',
        title: 'Новая колонка',
        headingSize: 'small',
        description: '',
        textSize: 'small',
        linkText: '',
        link: '',
      },
      max: 10,
    },
  },
  defaults: {
    heading: '',
    // Figma 1:19335 — плейсхолдер пустого состояния (3 пустые колонки «Колонна»).
    columns: [
      { id: 'col-1', heading: 'Колонна', text: 'Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.', imageUrl: '' },
      { id: 'col-2', heading: 'Колонна', text: 'Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.', imageUrl: '' },
      { id: 'col-3', heading: 'Колонна', text: 'Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.', imageUrl: '' },
    ],
    displayColumns: 3,
    headingSize: 'medium',
    // Канон соседних секций (Collections/Gallery/MultiRows) = 1320px контейнер.
    width: 'large',
    imageAspectRatio: 'square',
    textPosition: 'left',
    containerEnabled: 'false',
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiColumnsAuthoringSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 4,
    maxItems: 10,
  },
};

export function resolveMultiColumnsContainerEnabled(raw: {
  containerEnabled?: unknown;
  background?: { enabled?: unknown };
}): boolean {
  const value = raw.containerEnabled ?? raw.background?.enabled ?? 'false';
  return String(value) === 'true';
}

export function resolveMultiColumnsDisplayColumns(raw: {
  displayColumns?: unknown;
  columnsCount?: unknown;
}): 1 | 2 | 3 | 4 {
  const value = raw.displayColumns ?? raw.columnsCount ?? 3;
  const numeric = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return numeric === 1 || numeric === 2 || numeric === 3 || numeric === 4 ? numeric : 3;
}

export function resolveMultiColumnsSectionLink(raw: {
  buttonLink?: unknown;
  link?: unknown;
}): string {
  if (typeof raw.buttonLink === 'string') return raw.buttonLink;
  if (typeof raw.link === 'string') return raw.link;
  if (isRecord(raw.link) && typeof raw.link.href === 'string') return raw.link.href;
  return '/';
}

export function getVisibleMultiColumns<T extends { hidden?: unknown }>(columns: readonly T[]): T[] {
  return getVisibleMultiColumnEntries(columns).map(({ item }) => item);
}

export function getVisibleMultiColumnEntries<T extends { hidden?: unknown }>(
  columns: readonly T[],
): Array<{ item: T; originalIndex: number }> {
  return columns
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => item.hidden !== true);
}

export function resolveMultiColumnLink(column: {
  linkText?: unknown;
  link?: unknown;
}): { text: string; href: string } | null {
  if (typeof column.link === 'object' && column.link !== null) {
    const legacy = column.link as LegacyLink;
    if (legacy.enabled === 'false') return null;
    return typeof legacy.text === 'string' && legacy.text
      ? { text: legacy.text, href: typeof legacy.href === 'string' ? legacy.href : '#' }
      : null;
  }
  return typeof column.linkText === 'string' && column.linkText
    ? { text: column.linkText, href: typeof column.link === 'string' ? column.link : '#' }
    : null;
}
