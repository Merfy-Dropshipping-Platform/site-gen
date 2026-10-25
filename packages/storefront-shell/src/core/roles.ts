// Роли секций (блок 12 «Секций и SDK», 12.1; «Решил сам» пп. 1, 6, 15): список платформы — часть SDK ("sdk": 1), новая
// роль — только новой версией SDK; своих ролей у мерчанта и расширений нет. Сборка ставит data-role на обёртку
// экземпляра секции с ролью, ядро находит секцию по нему — имени секции оно не знает.
export const SECTION_ROLES = ['cart', 'cart-drawer', 'cart-added', 'login', 'search', 'notices', 'cookie-banner'] as const;
export type SectionRole = (typeof SECTION_ROLES)[number];
export const ROLE_ATTRIBUTE = 'data-role';

export const isSectionRole = (value: unknown): value is SectionRole => SECTION_ROLES.some((role) => role === value);

// Экземпляр секции с этой ролью на странице; нет — null. Экземпляр на роль один (role-duplicate), берётся первый.
export const roleSection = (root: ParentNode, role: SectionRole): HTMLElement | null =>
  root.querySelector<HTMLElement>(`merfy-section[${ROLE_ATTRIBUTE}="${role}"]`);

// Секция с ролью работает: она на странице и её скрипт не упал (data-merfy-state="failed" ставит ядро при сбое
// экземпляра, блок 5, раздел 3.7). Нет — ядро идёт запасным путём (таблица 12.1, правый столбец).
export function roleWorks(root: ParentNode, role: SectionRole): boolean {
  const section = roleSection(root, role);
  return section !== null && section.getAttribute('data-merfy-state') !== 'failed';
}
