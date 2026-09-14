import { z } from 'zod';
import type { BlockPuckConfig } from '@merfy/theme-contract';

/**
 * Секция «Вход» — тело страницы `/login` (пункт меню конструктора
 * «Профиль → Вход», страница ревизии `page-login`).
 *
 * Состав параметров — КАНОН и зафиксирован осознанно: владелец 14.09,
 * дословно — «У секции Вход два парметра Заголовок и Текст. У секции в
 * сайдбаре Цветовая схема и отступы». Итого РОВНО ЧЕТЫРЕ поля.
 *
 * Не «унифицировать» с соседями: у «Избранного» полей два, у «Личного
 * кабинета» и «Заказов» — одно, здесь четыре. Каждый состав назван владельцем
 * отдельно, и приводить их к общему знаменателю нельзя.
 *
 * Подписи и типы «Цветовой схемы» и «Отступов» взяты один-в-один у тех же
 * полей секции «Избранное» (WishlistSection.puckConfig.ts) — формулировки не
 * выдумываются. Дефолт отступов 80/80 — оттуда же.
 *
 * Сторож состава: conformance/panel-canon.json + `pnpm test:panel-canon`,
 * адресный гард — src/themes/__tests__/login-section.spec.ts.
 *
 * maxInstances: 1 — тело страницы одно; второй экземпляр нарисовал бы вторую
 * форму на те же id (`#magic-form`, `#login-email`) и сломал бы клиентский
 * скрипт входа.
 */
export const LoginSectionSchema = z.object({
  /** Заголовок над формой. Пусто — порт темы подставит свой дефолт. */
  heading: z.string().optional(),
  /** Пояснение под заголовком. Пусто — абзац не рисуется вовсе. */
  text: z.string().optional(),
  // Номер схемы 1..5. Дефолт 2 — та схема, которая у всех pupa-сайтов белая
  // (см. CartSection: scheme-1 на непересеянных сайтах чёрная).
  colorScheme: z.number().optional(),
  padding: z
    .object({
      top: z.number().int().min(0).max(160),
      bottom: z.number().int().min(0).max(160),
    })
    .optional(),
});

export type LoginSectionProps = z.infer<typeof LoginSectionSchema>;

export const LoginSectionPuckConfig: BlockPuckConfig<LoginSectionProps> = {
  label: 'Вход',
  category: 'layout',
  // Порядок полей — тот, в котором их назвал владелец: сперва содержимое
  // («Заголовок», «Текст»), затем оформление («Цветовая схема», «Отступы»).
  fields: {
    heading: { type: 'text', label: 'Заголовок' },
    text: { type: 'textarea', label: 'Текст' },
    colorScheme: { type: 'colorScheme', label: 'Цветовая схема' },
    padding: { type: 'object', label: 'Отступы' },
  },
  defaults: {
    // Дефолты — ровно то, что стояло на живой витрине ДО этой правки (замер
    // 14.09 по пяти стендам: h1 «Вход в аккаунт» + подпись про ссылку).
    // Сайт, где мерчант ничего не настраивал, обязан выглядеть как прежде.
    heading: 'Вход в аккаунт',
    text: 'Введите e-mail — пришлём ссылку для входа. Войдём в аккаунт или создадим новый.',
    colorScheme: 2,
    padding: { top: 80, bottom: 80 },
  },
  schema: LoginSectionSchema,
  maxInstances: 1,
  constraints: { padding: { min: 0, max: 160, step: 8 } },
};
