import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

const CollapsibleItemSchema = z.object({
  id: z.string(),
  heading: z.string(),
  content: z.string(),
  // «Размер заголовка» / «Размер текста» пункта (тестер 24.09). Необязательны:
  // старые ревизии без них рисуются прежним видом темы (= medium).
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  textSize: z.enum(['small', 'medium', 'large']).optional(),
});

export const CollapsibleSectionSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  sections: z.array(CollapsibleItemSchema).min(1).max(10),
  // Items array (pupa name).
  items: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
  })).optional(),
  container: z.object({ enabled: z.enum(['true', 'false']) }).optional(),
  // Pupa parity.
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  containerEnabled: z.enum(['true', 'false']).optional(),
  colorScheme: z.string().optional(),
  containerColorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type CollapsibleSectionProps = z.infer<typeof CollapsibleSectionSchema>;

export const CollapsibleSectionPuckConfig: BlockPuckConfig<CollapsibleSectionProps> = {
  label: 'Сворачиваемый раздел',
  category: 'content',
  // Figma 314-35006: Содержание (header) / Заголовок (aiText) /
  // Размер заголовка / Контейнер (toggle) / Цветовая схема /
  // Цветовая схема контейнера / Отступы. sections — sub-panel array.
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
    containerEnabled: {
      type: 'toggle',
      label: 'Контейнер',
      options: [
        { label: 'Показать', value: 'true' },
        { label: 'Скрыть', value: 'false' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    containerColorScheme: { type: 'colorScheme', label: 'Цветовая схема контейнера' },
    padding: { type: 'padding', label: 'Отступы' },
    sections: {
      type: 'array',
      label: 'Пункты (макс 10)',
      hiddenInMainPanel: true,
      arrayFields: {
        // Figma 1236-42153 (правый сайдбар «Раздел»): divider «Содержание» +
        // Заголовок (aiText) + Текст (aiText) — вместо старых Вопрос/Ответ text/textarea.
        ['_contentSection' as never]: { type: 'section-header', label: 'Содержание' } as any,
        heading: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        // Тестер 24.09: «добавить редактирование размера заголовка и текста
        // раздела». Контрол, подписи и имена полей — как у ряда MultiRows и
        // колонки MultiColumns (headingSize / textSize сразу под своим текстом).
        headingSize: {
          type: 'select',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
        content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        textSize: {
          type: 'select',
          label: 'Размер текста',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
      defaultItemProps: {
        id: '',
        heading: 'Новый пункт',
        content: 'Содержимое пункта',
        // Список не пустой («Выберите...»): 'medium' в каждой теме рисует ровно
        // то же, что пункт без значения, — новый пункт выглядит как раньше.
        headingSize: 'medium',
        textSize: 'medium',
      },
      max: 10,
    } as any,
    // Hidden — нет в Figma 314-35006.
    container: { type: 'hidden', label: '' },
    items: { type: 'hidden', label: '' },
    headingAlignment: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Часто задаваемые вопросы',
    sections: [
      {
        id: 'section-1',
        heading: 'Первый вопрос',
        content: 'Ответ на первый вопрос. Поддерживается базовое HTML-форматирование.',
      },
      {
        id: 'section-2',
        heading: 'Второй вопрос',
        content: 'Ответ на второй вопрос.',
      },
    ],
    headingSize: 'medium',
    // 80/80 снят: инлайн-стиль отступа ПЕРЕБИВАЕТ классную лесенку порта
    // (замер рендером: с пропом `style="padding-top:80px"`, без пропа —
    // стиля нет и работают классы темы: rose 56→140px, vanilla 80→112,
    // flux 40→64, satin 32→56, bloom 80→120). Дефолт панели не «подсказка»:
    // updateProp вписывает его в секцию при ЛЮБОЙ правке, поэтому все пять
    // тем сплющивало в одинаковые 80/80. Отсутствие значения = ритм темы;
    // panel-field-defaults держит для `padding` явное исключение с причиной.
    // «Контейнер» выключен: порт читает String(p.containerEnabled ?? 'false')
    // === 'true'. Тумблер в панели раньше стоял в «Скрыть» без значения —
    // совпадало случайно; теперь это зафиксировано.
    containerEnabled: 'false',
  },
  schema: CollapsibleSectionSchema,
  maxInstances: null,
  constraints: {
    padding: { min: 0, max: 160, step: 8 },
    maxItems: 10,
  },
};
