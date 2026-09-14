import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Constructor uses string "true"/"false" for boolean-like flags.
// Accept both string and boolean forms; Astro renderer normalizes at render time.
const boolLike = z.union([z.boolean(), z.literal('true'), z.literal('false')]);

const FieldSchema = z.object({
  enabled: boolLike,
  required: boolLike,
  label: z.string(),
});

export const ContactFormSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  description: z.string(),
  fields: z.object({
    name: FieldSchema,
    email: FieldSchema,
    phone: FieldSchema,
    message: FieldSchema,
  }),
  buttonText: z.string(),
  headingAlignment: z.enum(['left', 'center', 'right']).optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type ContactFormProps = z.infer<typeof ContactFormSchema>;

export const ContactFormPuckConfig: BlockPuckConfig<ContactFormProps> = {
  label: 'Контактная форма',
  category: 'form',
  // Figma 314-35069: Содержание (header) / Заголовок (aiText) /
  // Размер заголовка / Цветовая схема / Отступы.
  //
  // «Текст» (`description`) добавлен по прямой просьбе владельца 2026-09-15:
  // «во всех темах в секции Контактная форма добавить наш инпут Текст».
  // Состав параметров секций — канон (владелец 2026-09-13), поэтому правка
  // разрешена именно этой просьбой и ничем больше: поле ровно одно, соседи не
  // тронуты, conformance/panel-canon.json переснят отдельным коммитом.
  // Контрол и его место сняты с полей-соседей дословно (Gallery.text,
  // Collections.subtitle, Catalog.categorySubtitle): aiText / «Текст» /
  // fieldType 'description' / плейсхолдер «Ввести текст...», сразу за
  // «Размером заголовка» внутри раздела «Содержание».
  //
  // Проп НЕ новый: `description` жил в схеме и в defaults с появления секции,
  // но был `type: 'hidden'` — мерчанту контрола не доставалось. Поэтому
  // меняется ВИДИМОСТЬ, а не состав пропсов, и данные старых ревизий
  // продолжают работать как раньше.
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
    description: {
      type: 'aiText',
      label: 'Текст',
      fieldType: 'description',
      placeholder: 'Ввести текст...',
    } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Hidden — нет в Figma 314-35069.
    headingAlignment: { type: 'hidden', label: '' },
    fields: { type: 'hidden', label: '' },
    buttonText: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Связаться с нами',
    description: 'Оставьте заявку — ответим в течение рабочего дня.',
    fields: {
      name: { enabled: true, required: true, label: 'Имя' },
      email: { enabled: true, required: true, label: 'Email' },
      phone: { enabled: false, required: false, label: 'Телефон' },
      message: { enabled: true, required: false, label: 'Сообщение' },
    },
    buttonText: 'Отправить',
    headingSize: 'medium',
    // 80/80 снят: инлайн-стиль отступа ПЕРЕБИВАЕТ классную лесенку порта
    // (замер рендером: с пропом `style="padding-top:80px"`, без пропа —
    // стиля нет и работают классы темы: rose 56→140px, vanilla 80→112,
    // flux 40→64, satin 32→56, bloom 80→120). Дефолт панели не «подсказка»:
    // updateProp вписывает его в секцию при ЛЮБОЙ правке, поэтому все пять
    // тем сплющивало в одинаковые 80/80. Отсутствие значения = ритм темы;
    // panel-field-defaults держит для `padding` явное исключение с причиной.
  },
  schema: ContactFormSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
