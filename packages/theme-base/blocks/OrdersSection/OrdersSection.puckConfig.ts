import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Секция «Заказы» — тело страницы `/account/orders` (пункт меню конструктора
 * «Профиль → Заказы», страница ревизии `page-orders`).
 *
 * Состав параметров — КАНОН и зафиксирован осознанно: тестировщик 14.09,
 * дословно — «Для страницы заказы <…> создать исключительно там секцию Заказы,
 * в сайдбаре только цветовая схема». РОВНО ОДНО поле.
 *
 * Почему нет «Отступов» — см. AccountSection.puckConfig.ts: их не просили, а
 * состав панели менять нельзя. Вертикаль задаёт вёрстка темы
 * (`.account-page-container`).
 *
 * Сторож состава: conformance/panel-canon.json + `pnpm test:panel-canon`,
 * адресный гард — src/themes/__tests__/account-sections.spec.ts.
 *
 * maxInstances: 1 — тело страницы одно; второй экземпляр нарисовал бы второй
 * список заказов на те же id (`#orders-list`) и сломал бы клиентский скрипт.
 */
export const OrdersSectionSchema = z.object({
  // Номер схемы 1..5. Дефолт 2 — см. CartSection (scheme-1 на непересеянных
  // сайтах чёрная).
  colorScheme: z.number().optional(),
});

export type OrdersSectionProps = z.infer<typeof OrdersSectionSchema>;

export const OrdersSectionPuckConfig: BlockPuckConfig<OrdersSectionProps> = {
  label: 'Заказы',
  category: 'layout',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
  },
  defaults: {
    colorScheme: 2,
  },
  schema: OrdersSectionSchema,
  maxInstances: 1,
};
