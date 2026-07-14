import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// КОНТРОЛЫ (fields/schema/label/category) = КАНОН theme-base/blocks/MultiColumns
// (inline-копия, НЕ cross-package import — иначе билд-компилятор блоков ломается).
// Сайдбар satin идентичен другим темам. ДЕФОЛТЫ ниже — satin'овские (манера):
// 3 фичи-колонки (ДОСТАВКА/ВОЗВРАТ/ПОДДЕРЖКА), padding 80, без heading.
// Рендер satin (themes/satin/.../MultiColumns.astro) читает канон-пропсы и при
// этих дефолтах даёт вид satin байт-в-байт.

// КАНОН theme-base MultiColumnItemSchema (единая форма колонны, Figma 314:34941):
// canon-ключи image/title/description + imageSize/headingSize/textSize + flat-пара
// linkText(строка) + link(строка href). legacy heading/text/imageUrl оставлены
// optional для обратной совместимости старых ревизий; РЕНДЕР читает canon-first
// (title→heading, description→text, image→imageUrl) — эталон theme-base
// MultiColumns.astro:80-81. `link` — СТРОКА (pagePicker пишет href-строку), НЕ
// объект {text,href} (это и есть форм-рассинхрон field↔schema↔renderer до фикса).
const MultiColumnItemSchema = z.object({
  id: z.string().optional(),
  heading: z.string().optional(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  image: z.string().optional(),
  imageSize: z.enum(['small', 'medium', 'large']).optional(),
  title: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  description: z.string().optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
  linkText: z.string().optional(),
  // Канон field = pagePicker → пишет СТРОКУ href (единая форма). Union принимает
  // legacy-объект {text,href} только для парса старых ревизий; рендер читает
  // строку-href ПЕРВОЙ (canonical-first), затем legacy-объект — форма остаётся
  // одной (строковой) на стороне конструктора.
  link: z.union([
    z.string(),
    z.object({ text: z.string().optional(), href: z.string().optional() }),
  ]).optional(),
});

export const MultiColumnsSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  // Pupa parity: heading object с alignment + size (legacy `heading` text — fallback).
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  width: z.enum(['small', 'medium', 'large', 'full']).optional(),
  imageAspectRatio: z.enum(['adapt', 'square', 'portrait', 'landscape']).optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  // Pupa parity: nested heading {text,alignment,size} + textPosition + container + containerColorScheme.
  textPosition: z.enum(['left', 'center']).optional(),
  // КАНОН theme-base: `containerEnabled` — ключ СХЕМЫ (не только field). До фикса
  // field `containerEnabled` существовал, а в схеме был только legacy `background`,
  // → safeParse СРЕЗАЛ значение тумблера (field↔schema drift). legacy `background`
  // остаётся optional для миграции старых ревизий (рендер читает оба).
  containerEnabled: z.enum(['true', 'false']).optional(),
  background: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  containerColorScheme: z.string().optional(),
  link: z.string().optional(),
  columns: z.array(MultiColumnItemSchema).min(1).max(10),
  displayColumns: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type MultiColumnsProps = z.infer<typeof MultiColumnsSchema>;

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
    // Figma 1236-42153 (канон theme-base): «Кнопка» (поле ввода) + «Ссылка» (page
    // picker) в сайдбаре секции — общая CTA под колоннами (возврат по дизайну,
    // перекрывает прежнее скрытие #23). Рендер satin (MultiColumns.astro btnText/
    // btnHref) уже читает buttonText/buttonLink → кнопка появляется при непустом тексте.
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
      label: 'Положение колонн',
      options: [
        { label: 'Слева', value: 'left' },
        { label: 'Центр', value: 'center' },
      ],
    },
    // user #23: Контейнер дублировался (object с вложенным toggle). Заменил
    // на flat toggle field — рендерится FieldRenderer без nesting.
    background: { type: 'hidden', label: '' } as any,
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
    // «Цветовая схема контейнера» скрыта из main panel (канон theme-base).
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
  // ДЕФОЛТЫ satin (манера, СОХРАНЕНЫ как есть): 3 фичи-колонки верстальщика,
  // displayColumns 3, padding 80. Прочие канон-ключи (heading/headingSize/width/
  // imageAspectRatio/textPosition/containerEnabled) satin НЕ задаёт намеренно —
  // порт satin при их отсутствии рендерит манеру (heading скрыт; заголовок 20px;
  // ширина .satin-container; иконка 56×56; колонки text-center; серая подложка).
  defaults: {
    // Figma 1:19335 — плейсхолдер пустого состояния (3 пустые колонки «Колонна»).
    // КАНОН-ключи title/description/image (единая форма, как defaultItemProps) —
    // НЕ legacy heading/text/imageUrl (иначе коэксистенция алиасов в сторе).
    columns: [
      { id: 'col-1', title: 'Колонна', description: 'Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.', image: '' },
      { id: 'col-2', title: 'Колонна', description: 'Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.', image: '' },
      { id: 'col-3', title: 'Колонна', description: 'Сочетай текст, чтобы подчеркнуть плюсы товара или коллекции.', image: '' },
    ],
    displayColumns: 3,
    padding: { top: 80, bottom: 80 },
  },
  schema: MultiColumnsSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    minColumns: 1,
    maxColumns: 4,
    maxItems: 10,
  },
};
