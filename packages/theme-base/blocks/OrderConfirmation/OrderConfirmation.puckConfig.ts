import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

// Секция «Спасибо за заказ» (post-payment thank-you). Один блок рендерит обе
// колонки: «Оформление заказа» (детали) + «Сводка заказа» (позиции/итог).
// Панель настроек 1:1 по Figma 1:20698. Per-section цвета/типографика —
// block-scoped CSS-переменные (см. .astro), без слома глобального scheme/token
// контракта остальных блоков.

export const OrderConfirmationSchema = z.object({
  // Баннер (группа «Изображение»)
  banner: z.object({
    enabled: z.boolean(),
    src: z.string(),
    placement: z.enum(['full', 'order', 'summary']),
    align: z.enum(['left', 'center', 'right']),
    width: z.number().int().min(200).max(1280),
  }),
  // Фоны колонок + цвета секции (hex; пусто = наследовать схему)
  orderBg: z.string(),
  summaryBg: z.string(),
  accentColor: z.string(),
  buttonColor: z.string(),
  errorColor: z.string(),
  // Типографика (пусто = наследовать тему)
  headingFont: z.string(),
  headingWeight: z.string(),
  bodyFont: z.string(),
  bodyWeight: z.string(),
  // Тексты
  greetingTemplate: z.string(),
  confirmedTitle: z.string(),
  confirmedNote: z.string(),
  detailsTitle: z.string(),
  helpText: z.string(),
  returnButtonText: z.string(),
  returnButtonHref: z.string(),
  legalText: z.string(),
  // Стандартные
  colorScheme: z.string(),
  padding: z.object({
    top: z.number().int().min(0).max(160),
    bottom: z.number().int().min(0).max(160),
  }),
});

export type OrderConfirmationProps = z.infer<typeof OrderConfirmationSchema>;

export const OrderConfirmationPuckConfig: BlockPuckConfig<OrderConfirmationProps> = {
  label: 'Спасибо за заказ',
  category: 'form',
  fields: {
    banner: {
      type: 'object',
      label: 'Изображение',
      objectFields: {
        enabled: { type: 'boolean', label: 'Добавить фото' },
        src: { type: 'image', label: 'Выбрать' },
        placement: {
          type: 'select',
          label: 'Положение',
          options: [
            { label: 'Во всю ширину', value: 'full' },
            { label: 'Оформление заказа', value: 'order' },
            { label: 'Сводка заказа', value: 'summary' },
          ],
        },
        align: {
          type: 'radio',
          label: 'Позиция',
          options: [
            { label: 'Слева', value: 'left' },
            { label: 'Центр', value: 'center' },
            { label: 'Справа', value: 'right' },
          ],
        },
        width: { type: 'slider', label: 'Ширина', min: 200, max: 1280, step: 10 },
      },
    } as any,
    orderBg: { type: 'color', label: 'Фон Оформления заказа' } as any,
    summaryBg: { type: 'color', label: 'Фон Сводки заказа' } as any,
    accentColor: { type: 'color', label: 'Акцент' } as any,
    buttonColor: { type: 'color', label: 'Кнопки' } as any,
    errorColor: { type: 'color', label: 'Ошибка' } as any,
    headingFont: { type: 'fontFamily', label: 'Заголовки' } as any,
    headingWeight: { type: 'fontWeight', label: 'Жирность заголовков' } as any,
    bodyFont: { type: 'fontFamily', label: 'Текст' } as any,
    bodyWeight: { type: 'fontWeight', label: 'Жирность текста' } as any,
    greetingTemplate: { type: 'text', label: 'Приветствие ({name} — имя)' },
    confirmedTitle: { type: 'text', label: 'Заголовок подтверждения' },
    confirmedNote: { type: 'textarea', label: 'Примечание' } as any,
    detailsTitle: { type: 'text', label: 'Заголовок деталей' },
    helpText: { type: 'text', label: 'Текст помощи' },
    returnButtonText: { type: 'text', label: 'Текст кнопки' },
    returnButtonHref: { type: 'pagePicker', label: 'Ссылка кнопки' },
    legalText: { type: 'textarea', label: 'Юридический текст' } as any,
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'padding', label: 'Отступы' } as any,
  },
  defaults: {
    banner: { enabled: false, src: '', placement: 'order', align: 'center', width: 580 },
    orderBg: '',
    summaryBg: '',
    accentColor: '',
    buttonColor: '',
    errorColor: '',
    headingFont: '',
    headingWeight: '',
    bodyFont: '',
    bodyWeight: '',
    greetingTemplate: 'Спасибо за заказ, {name}!',
    confirmedTitle: 'Ваш заказ подтверждён',
    confirmedNote:
      'Скоро вы получите электронное письмо с подтверждением и номером вашего заказа.',
    detailsTitle: 'Детали заказа',
    helpText: 'Нужна помощь? Обратитесь к нам',
    returnButtonText: 'Вернуться к магазину',
    returnButtonHref: '/',
    legalText:
      'Размещая заказ, вы соглашаетесь с Условиями обслуживания, Политикой конфиденциальности и Политикой использования файлов cookie.',
    colorScheme: '',
    padding: { top: 0, bottom: 0 },
  },
  schema: OrderConfirmationSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
