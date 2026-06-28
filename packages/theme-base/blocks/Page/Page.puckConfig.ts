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
    // Свободный режим: заголовок + текст редактируются прямо в панели секции
    // (WYSIWYG) — основной способ наполнения контент-страниц (О нас/Доставка/
    // Контакты).
    heading: { type: 'text', label: 'Заголовок' } as any,
    content: { type: 'wysiwyg', label: 'Текст' } as any,
    // «Выбор страницы» — пикер: привязка подгружает (transclude) заголовок+контент
    // выбранной страницы (bound-режим). Для самой контент-страницы не нужен.
    pageId: { type: 'pageContentPicker', label: 'Выбор страницы' } as any,
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
    // heading/content редактируются в полях выше (свободный режим). В bound-режиме
    // (pageId задан) их перезапишет build-side transclude из выбранной страницы.
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
