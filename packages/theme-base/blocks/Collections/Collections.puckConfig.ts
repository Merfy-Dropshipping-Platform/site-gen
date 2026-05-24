import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CollectionItemSchema = z.object({
  id: z.string(),
  collectionId: z.string().nullable(), // nullable until merchant picks
  heading: z.string(),
  description: z.string().optional(),
  // Merchant-uploaded image URL; when absent the Astro template falls back
  // to `/placeholder-collection-<id>.jpg`.
  image: z.string().optional(),
});

export const CollectionsSchema = z.object({
  heading: z.string(),
  subtitle: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  subtitleSize: z.enum(['small', 'medium', 'large']).optional(),
  // Pupa parity.
  titleAlignment: z.enum(['left', 'center', 'right']).optional(),
  /** Visual aspect ratio of tiles — square / portrait (Figma) / wide. */
  imageView: z.enum(['square', 'portrait', 'wide']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Caption (heading + description)
   * casing for collection cards. Default `default` preserves pre-084
   * behaviour (regular case). `uppercase` matches Vanilla home cards.
   */
  cardCaptionStyle: z.enum(['default', 'uppercase']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Tile aspect ratio override.
   * Default `auto` keeps the existing `imageView`-driven aspect (3:4 portrait
   * for vanilla). `1:1` forces square tiles for the Vanilla home grid.
   */
  gridAspect: z.enum(['auto', '1:1']).optional(),
  /**
   * Additive layout variant. `standard` (default) keeps rose/vanilla/bloom
   * behaviour. `tile` (flux pilot, Figma 1:26298) — square rounded-12
   * cards, left-aligned heading и caption, font-light, hover muted→text.
   */
  variant: z.enum(['standard', 'tile']).optional(),
  /**
   * `auto` pulls from the shop's collections feed at build time; `manual`
   * uses only the items in `collections[]`. Default auto.
   */
  dataSource: z.enum(['auto', 'manual']).optional(),
  collections: z.array(CollectionItemSchema).min(1).max(10),
  columns: z.number().int().min(1).max(6),
  colorScheme: z.string().optional(),
  /**
   * Prefix for collection-card hrefs. Defaults to `/catalog?collection=` so
   * clicks filter the catalog grid (rose reference). Merchants can switch
   * to `/collections/` for dedicated collection pages.
   */
  cardLinkBase: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CollectionsProps = z.infer<typeof CollectionsSchema>;

export const CollectionsPuckConfig: BlockPuckConfig<CollectionsProps> = {
  label: 'Список коллекций',
  category: 'products',
  // Figma 314-34726: раздел «Содержание» (Заголовок / Размер / Текст /
  // Размер) → Колонки → Цветовая схема → Отступы.
  // Скрытые поля (нет в Figma): titleAlignment, imageView, dataSource,
  // cardCaptionStyle, gridAspect, variant, cardLinkBase. Данные ревизий
  // сохраняются; Astro-рендер использует их по дефолтам.
  fields: {
    // section-header — decorative subheader без контрола
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
    subtitle: {
      type: 'aiText',
      label: 'Текст',
      fieldType: 'description',
      placeholder: 'Ввести текст...',
    } as any,
    subtitleSize: {
      type: 'select',
      label: 'Размер текста',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    columns: { type: 'slider', label: 'Колонки', min: 1, max: 6, step: 1 } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — collections редактируется через outline/array sub-panel,
    // не в main sidebar (Figma 314-34726 показывает только настройки секции).
    collections: {
      type: 'array',
      label: 'Коллекции',
      hiddenInMainPanel: true,
      // user #10 / Figma 1:17042 — Коллекция sub-panel показывает ТОЛЬКО
      // "Выбор коллекции" (collectionPicker). heading/description/image —
      // data сохраняется, но не редактируется в sidebar. Сами поля для
      // карточки автоматически берутся из выбранной коллекции на render.
      arrayFields: {
        collectionId: { type: 'collectionPicker', label: 'Выбор коллекции' } as any,
        heading: { type: 'hidden', label: '' },
        description: { type: 'hidden', label: '' },
        image: { type: 'hidden', label: '' },
      },
      defaultItemProps: { id: '', collectionId: null, heading: '', description: '', image: '' },
      max: 10,
    } as any,
    // Legacy hidden — нет в Figma 314-34726.
    titleAlignment: { type: 'hidden', label: '' },
    imageView: { type: 'hidden', label: '' },
    dataSource: { type: 'hidden', label: '' },
    cardCaptionStyle: { type: 'hidden', label: '' },
    gridAspect: { type: 'hidden', label: '' },
    variant: { type: 'hidden', label: '' },
    cardLinkBase: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Коллекции',
    subtitle: '',
    headingSize: 'medium',
    subtitleSize: 'small',
    imageView: 'square',
    dataSource: 'auto',
    collections: [
      { id: 'col-1', collectionId: null, heading: 'Коллекция 1', description: '' },
      { id: 'col-2', collectionId: null, heading: 'Коллекция 2', description: '' },
      { id: 'col-3', collectionId: null, heading: 'Коллекция 3', description: '' },
    ],
    columns: 3,
    cardLinkBase: '/catalog?collection=',
    padding: { top: 80, bottom: 80 },
  },
  schema: CollectionsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 6,
    maxItems: 10,
  },
};
