// Роли секций (блок 12 «Секций и SDK», 12.1; «Решил сам» пп. 1, 6, 15): список платформы — часть SDK ("sdk": 1), новая
// роль — только новой версией SDK; своих ролей у мерчанта и расширений нет. Сборка ставит data-role на обёртку
// экземпляра секции с ролью, ядро находит секцию по нему — имени секции оно не знает.
export const SECTION_ROLES = [
  'cart',
  'cart-drawer',
  'cart-added',
  'login',
  'search',
  'notices',
  'cookie-banner',
  // Базовые секции, 03.11: оформление заказа и «Спасибо за заказ» — страницы /checkout и /checkout-result.
  'checkout',
  'checkout-result',
] as const;
export type SectionRole = (typeof SECTION_ROLES)[number];
export const ROLE_ATTRIBUTE = 'data-role';

export const isSectionRole = (value: unknown): value is SectionRole => SECTION_ROLES.some((role) => role === value);

// Окно поверх страницы (01.11): секция без роли в группе overlay. Сборка ставит на обёртку экземпляра data-overlay и
// hidden — до запуска ядра окна не видно; ядро находит окно по атрибуту и даёт его скрипту ctx.overlay (parts/overlay.ts).
export const OVERLAY_ATTRIBUTE = 'data-overlay';
// Имя части окон в ядре и в таблице действий (overlay.close). Здесь, а не в action-catalog.ts: таблица действий с текстами
// в бандл страницы не идёт.
export const OVERLAY_PART = 'overlay';

// Часть меток без скрипта секции (06.11, parts/marks.ts): сборка кладёт её в бандл страницы, где в HTML есть такая метка.
export const MARKS_PART = 'marks';
export const MARKS_HTML = /favorites\.toggle|data-ref="(?:favorites-count|cart-count|profile)"/;

// Экземпляр секции с этой ролью на странице; нет — null. Экземпляр на роль один (role-duplicate), берётся первый.
export const roleSection = (root: ParentNode, role: SectionRole): HTMLElement | null =>
  root.querySelector<HTMLElement>(`merfy-section[${ROLE_ATTRIBUTE}="${role}"]`);

// Секция с ролью работает: она на странице и её скрипт не упал (data-merfy-state="failed" ставит ядро при сбое
// экземпляра, блок 5, раздел 3.7). Нет — ядро идёт запасным путём (таблица 12.1, правый столбец).
export function roleWorks(root: ParentNode, role: SectionRole): boolean {
  const section = roleSection(root, role);
  return section !== null && section.getAttribute('data-merfy-state') !== 'failed';
}
