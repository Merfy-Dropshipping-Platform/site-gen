import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Page («Страница») — ГИБРИДНАЯ контент-секция для статичных/контент-страниц.
 *
 * Два режима:
 *  1. Привязанный — `pageId` указывает на платформенную контент-страницу
 *     (политики из site_policy: refund/privacy/tos/shipping). Секция рендерит
 *     её заголовок + текст (контент инжектится при сборке). По умолчанию стоит
 *     на этих policy-страницах.
 *  2. Свободный — `pageId` пуст. Мерчант пишет `heading` + `content` (WYSIWYG)
 *     прямо в секции. Пусто → плейсхолдеры «Страница»/«Текст».
 *
 * Панель: Выбор страницы · Размер заголовка · Цветовая схема · Отступы.
 * heading/content редактируются как содержимое (свободный режим).
 */
export const PageSchema = z.object({
  // Привязка к платформенной контент-странице (политике): '' = свободный режим,
  // иначе тип политики (refund/privacy/tos/shipping). При сборке heading/content
  // инжектятся из site_policy (живой контент).
  pageId: z.string().optional(),
  // Свободный режим — заголовок + тело (sanitized HTML).
  heading: z.string().optional(),
  content: z.string().optional(),
  headingSize: z.enum(['small', 'medium', 'large']).optional(),
  colorScheme: z.string().optional(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type PageProps = z.infer<typeof PageSchema>;

export const PagePuckConfig: BlockPuckConfig<PageProps> = {
  label: 'Страница',
  category: 'content',
  fields: {
    // Главная панель. «Выбор страницы» = привязка к платформенной контент-
    // странице (политике из настроек); «Свой контент» = свободный режим.
    pageId: {
      type: 'select',
      label: 'Выбор страницы',
      options: [
        { label: 'Свой контент', value: '' },
        { label: 'Политика возврата', value: 'refund' },
        { label: 'Политика конфиденциальности', value: 'privacy' },
        { label: 'Условия обслуживания', value: 'tos' },
        { label: 'Политика доставки', value: 'shipping' },
      ],
    },
    headingSize: {
      type: 'select',
      label: 'Размер заголовка',
      options: [
        { label: 'Маленький', value: 'small' },
        { label: 'Средний', value: 'medium' },
        { label: 'Большой', value: 'large' },
      ],
    },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' },
    // Содержимое свободного режима (редактируется здесь же).
    heading: { type: 'text', label: 'Заголовок' },
    content: { type: 'wysiwyg', label: 'Содержимое' } as any,
  },
  defaults: {
    pageId: '',
    heading: '',
    content: '',
    headingSize: 'medium',
    colorScheme: 'scheme-1',
    padding: { top: 80, bottom: 80 },
  },
  schema: PageSchema,
  maxInstances: null,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
