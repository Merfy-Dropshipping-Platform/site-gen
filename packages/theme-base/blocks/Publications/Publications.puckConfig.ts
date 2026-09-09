import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const PublicationsAuthoringSchema = z.object({
  heading: z.string(),
  columns: z.number().int().min(1).max(4),
  cards: z.number().int().min(1).max(4),
  // Pupa parity.
  publicationType: z.string().optional(),
  cardsCount: z.number().int().min(1).max(4).optional(),
  columnsCount: z.number().int().min(1).max(4).optional(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  dateTime: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  showDateTime: z.enum(['true', 'false']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type PublicationsProps = z.infer<typeof PublicationsAuthoringSchema>;

export const PublicationsSchema = PublicationsAuthoringSchema;

export interface PublicationsStoredInput {
  heading?: unknown;
  headingSize?: unknown;
  headingAlignment?: unknown;
  columns?: unknown;
  cards?: unknown;
  publicationType?: unknown;
  categoryFilter?: unknown;
  cardsCount?: unknown;
  columnsCount?: unknown;
  dateTime?: unknown;
  showDateTime?: unknown;
  colorScheme?: unknown;
  padding?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function normalizePublicationsStoredProps(input: unknown): PublicationsProps | unknown {
  if (!isRecord(input)) return input;
  const raw = input as PublicationsStoredInput;
  const heading = isRecord(raw.heading) ? raw.heading : undefined;
  const cards = clampPublicationCount(raw.cardsCount ?? raw.cards);
  const columns = clampPublicationCount(raw.columnsCount ?? raw.columns);
  const dateTime = isRecord(raw.dateTime) ? raw.dateTime : undefined;
  return {
    heading: typeof raw.heading === 'string'
      ? raw.heading
      : heading?.enabled === 'false' ? '' : typeof heading?.text === 'string' ? heading.text : 'Публикации',
    headingSize: raw.headingSize === 'small' || raw.headingSize === 'large'
      ? raw.headingSize
      : heading?.size === 'small' || heading?.size === 'large' ? heading.size : 'medium',
    ...(raw.headingAlignment === 'left' || raw.headingAlignment === 'center' || raw.headingAlignment === 'right'
      ? { headingAlignment: raw.headingAlignment }
      : {}),
    columns,
    cards,
    columnsCount: columns,
    cardsCount: cards,
    publicationType: resolvePublicationsType(raw),
    showDateTime: String(raw.showDateTime ?? dateTime?.enabled ?? 'true') === 'false' ? 'false' : 'true',
    ...(typeof raw.colorScheme === 'string' ? { colorScheme: raw.colorScheme } : {}),
    padding: isRecord(raw.padding) ? raw.padding : { top: 80, bottom: 80 },
  };
}

export const PublicationsStoredSchema: z.ZodType<PublicationsProps, z.ZodTypeDef, unknown> =
  z.preprocess(normalizePublicationsStoredProps, PublicationsAuthoringSchema);

export const PublicationsPuckConfig: BlockPuckConfig<PublicationsProps> = {
  label: 'Публикации',
  category: 'content',
  // Figma 314-35098: Выбор публикации (page picker) / Карточки (slider) /
  // Содержание (header) / Заголовок (aiText) / Размер заголовка /
  // Колонки (slider) / Дата и время (toggle) / Цветовая схема / Отступы.
  fields: {
    publicationType: { type: 'pagePicker', label: 'Выбор публикации' } as any,
    cardsCount: { type: 'slider', label: 'Карточки', min: 1, max: 4, step: 1 },
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
    columnsCount: { type: 'slider', label: 'Колонки', min: 1, max: 4, step: 1 },
    // user #31: упростил object с вложенным toggle до flat toggle
    // (rendering FieldRenderer same as другие — mobile pattern с
    // animated "Показать"/"Скрыть").
    dateTime: { type: 'hidden', label: '' } as any,
    showDateTime: {
      type: 'toggle',
      label: 'Дата и время',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-35098.
    headingAlignment: { type: 'hidden', label: '' },
    columns: { type: 'hidden', label: '' },
    cards: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Публикации',
    columns: 3,
    cards: 3,
    cardsCount: 3,
    columnsCount: 3,
    headingSize: 'medium',
    showDateTime: 'true',
    padding: { top: 80, bottom: 80 },
  },
  schema: PublicationsAuthoringSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minCards: 1,
    maxCards: 4,
    minColumns: 1,
    maxColumns: 4,
  },
};

export function clampPublicationCount(value: unknown, fallback = 3): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(4, Math.max(1, numeric));
}

export function resolvePublicationsDateTime(raw: {
  showDateTime?: unknown;
  dateTime?: { enabled?: unknown };
}): boolean {
  const value = raw.showDateTime ?? raw.dateTime?.enabled ?? 'true';
  return String(value) !== 'false';
}

const PUBLICATION_TYPE_ALIASES: Record<string, string> = {
  news: 'news',
  'новости': 'news',
  blog: 'blog',
  'блог': 'blog',
  articles: 'articles',
  'статьи': 'articles',
};

export function resolvePublicationsType(raw: {
  publicationType?: unknown;
  categoryFilter?: unknown;
}): string {
  const value = typeof raw.publicationType === 'string' && raw.publicationType.trim()
    ? raw.publicationType
    : raw.categoryFilter;
  if (typeof value !== 'string' || !value.trim()) return 'all';
  const normalized = value.trim().toLowerCase();
  return PUBLICATION_TYPE_ALIASES[normalized] ?? normalized;
}

export function filterPublicationsByType<T extends { category?: string }>(
  items: readonly T[],
  publicationType: unknown,
): T[] {
  if (typeof publicationType !== 'string' || !publicationType.trim() || publicationType === 'all') {
    return [...items];
  }
  const category = PUBLICATION_TYPE_ALIASES[publicationType.trim().toLowerCase()];
  return category ? items.filter((item) => item.category === category) : [...items];
}
