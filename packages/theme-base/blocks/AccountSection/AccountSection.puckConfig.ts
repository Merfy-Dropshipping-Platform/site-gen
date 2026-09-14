import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Секция «Личный кабинет» — тело страницы `/account/profile` (пункт меню
 * конструктора «Профиль → Личный кабинет», страница ревизии `page-profile`).
 *
 * Состав параметров — КАНОН и зафиксирован осознанно: тестировщик 14.09,
 * дословно — «Для страницы личный кабинет <…> создать исключительно там
 * секцию Личный кабинет, в сайдбаре только цветовая схема». РОВНО ОДНО поле.
 *
 * Почему нет «Отступов» (в отличие от «Избранного», где их два). Их не просили,
 * а состав панели — канон: добавлять поле «чтобы красивее» запрещено. Вертикаль
 * страницы задаёт вёрстка темы (`.account-page-container`), она одинакова на
 * live и в превью, поэтому отсутствие контрола ничего не ломает.
 * Подпись и тип поля взяты один-в-один у той же схемы секции «Корзина»
 * (CartSection.puckConfig.ts) — формулировки не выдумываются.
 *
 * Сторож состава: conformance/panel-canon.json + `pnpm test:panel-canon`,
 * адресный гард — src/themes/__tests__/account-sections.spec.ts.
 *
 * Единственность на странице (maxInstances: 1) — как у корзины и избранного:
 * тело страницы одно, второй экземпляр рисовал бы вторую форму профиля на те
 * же id (`#profile-form`) и сломал бы клиентский скрипт.
 */
export const AccountSectionSchema = z.object({
  // Номер схемы 1..5. Дефолт 2 — та схема, которая у всех pupa-сайтов белая
  // (см. CartSection: scheme-1 на непересеянных сайтах чёрная).
  colorScheme: z.number().optional(),
});

export type AccountSectionProps = z.infer<typeof AccountSectionSchema>;

export const AccountSectionPuckConfig: BlockPuckConfig<AccountSectionProps> = {
  label: 'Личный кабинет',
  category: 'layout',
  fields: {
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
  },
  defaults: {
    colorScheme: 2,
  },
  schema: AccountSectionSchema,
  maxInstances: 1,
};
