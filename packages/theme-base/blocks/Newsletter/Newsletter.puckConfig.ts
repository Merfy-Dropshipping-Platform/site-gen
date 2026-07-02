import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

export const NewsletterSchema = z.object({
  heading: z.union([
    z.string(),
    z.object({
      text: z.string().optional(),
      alignment: z.enum(['left', 'center', 'right']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ]).optional(),
  description: z.string().optional(),
  text: z.object({
    content: z.string().optional(),
    size: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  placeholder: z.string(),
  buttonText: z.string(),
  position: z.enum(['left', 'center', 'right']).optional(),
  /**
   * «Согласие на рассылку» — toggle (legacy 'true'/'false' strings). При 'true'
   * порты СКРЫВАЮТ блок heading+description (форма остаётся); default 'false'
   * сохраняет прежний вид — заголовок и текст видны (default-preserving).
   * Конструктор показывает этот тумблер в хардкод-панели Newsletter.
   */
  agreement: z.enum(['true', 'false']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Form layout style:
   *   - `inline-submit` (default behaviour, identical pre-commit)
   *     keeps the submit button absolute-positioned inside the input
   *     row (single border-bottom line).
   *   - `stacked` renders the button below the input (block layout for
   *     vanilla home where the form sits inside a coloured panel).
   */
  formLayout: z.enum(['stacked', 'inline-submit']).optional(),
  /**
   * 084 vanilla pilot — additive variant. Text/form alignment within the
   * section. Default `center` preserves pre-084 behaviour. `left` matches
   * the vanilla home left-aligned newsletter panel.
   */
  alignment: z.enum(['left', 'center', 'right']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type NewsletterProps = z.infer<typeof NewsletterSchema>;

export const NewsletterPuckConfig: BlockPuckConfig<NewsletterProps> = {
  label: 'Подписка на рассылку',
  category: 'form',
  // Figma 314-35034: Соглашение на рассылку (toggle) / Текст (aiText) /
  // Цветовая схема / Отступы.
  fields: {
    text: {
      type: 'object',
      label: 'Текст',
      objectFields: {
        content: { type: 'aiText', label: 'Текст', fieldType: 'description', placeholder: 'Ввести текст...' } as any,
        size: {
          type: 'select',
          label: 'Размер',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    },
    // «Согласие на рассылку» — toggle. При 'true' порты СКРЫВАЮТ заголовок+текст
    // (форма остаётся); default 'false' — заголовок и текст видны. Рендерится в
    // хардкод-панели конструктора (CustomFieldsPanel.tsx).
    agreement: { type: 'toggle', label: 'Согласие на рассылку' } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Sub-panel «Форма рассылки» (314:35058):
    heading: {
      type: 'object',
      label: 'Заголовок',
      hiddenInMainPanel: true,
      objectFields: {
        text: { type: 'aiText', label: 'Заголовок', fieldType: 'title', placeholder: 'Ввести текст...' } as any,
        // Выравнивание заголовка убрано — секционное «Выравнивание» (position)
        // управляет всем содержимым, включая заголовок (см. Newsletter.astro).
        size: {
          type: 'select',
          label: 'Размер заголовка',
          options: [
            { label: 'Маленький', value: 'small' },
            { label: 'Средний', value: 'medium' },
            { label: 'Большой', value: 'large' },
          ],
        },
      },
    } as any,
    placeholder: { type: 'text', label: 'Плейсхолдер', hiddenInMainPanel: true } as any,
    buttonText: { type: 'text', label: 'Кнопка', hiddenInMainPanel: true } as any,
    // Поле «Форма» (formLayout) убрано из UI — «не наше». Делаем hidden (не
    // удаляем: тип fields = Record<keyof Props> требует запись на каждый проп).
    // Проп остаётся: default 'stacked', vanilla inline-submit через blockDefaults.
    formLayout: { type: 'hidden', label: '' },
    // Hidden — нет в Figma 314-35034.
    description: { type: 'hidden', label: '' },
    position: { type: 'hidden', label: '' },
    alignment: { type: 'hidden', label: '' },
  },
  defaults: {
    heading: 'Подпишись на новости',
    description: 'Узнавай о новинках и акциях первым',
    placeholder: 'Твой email',
    buttonText: 'Подписаться',
    formLayout: 'stacked',
    agreement: 'false',
    padding: { top: 80, bottom: 80 },
  },
  schema: NewsletterSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
