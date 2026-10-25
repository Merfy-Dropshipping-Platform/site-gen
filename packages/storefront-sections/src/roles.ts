import { SECTION_ROLES, isSectionRole, type SectionRole } from '@merfy/shell/roles';

// Таблица ролей (блок 12 «Секций и SDK», 12.1; «Решил сам» пп. 1, 3–7): роль задаёт место секции — список ревизии и его
// группу — и один экземпляр; fallback — что делает ядро SDK, когда секции нет или её скрипт упал (текст для
// документации и MCP, блок 14). Список ролей — у ядра (@merfy/shell/roles): ядро находит секцию по data-role. Здесь
// только данные: проверки — в format.ts.
export { SECTION_ROLES, isSectionRole, type SectionRole };
// Список ревизии «Поверх страницы» (12.2, п. 7) — общий для всех страниц, как header и footer. То же имя —
// OVERLAY_LIST в @merfy/storefront-build (routes.ts); процесс проверки секций сборку не импортирует, тест сверяет оба.
export const OVERLAY_LIST = 'overlay';
export const ROLE_LIMIT = 1;

export interface RolePlace {
  readonly group: 'page' | 'overlay';
  // Список ревизии, где стоит экземпляр: особая страница (id из special-pages.json) или overlay.
  readonly list: string;
  readonly fallback: string;
}

export const ROLE_PLACES: Readonly<Record<SectionRole, RolePlace>> = {
  cart: {
    group: 'page',
    list: 'page-cart',
    fallback: 'секции нет — /cart отвечает 404; скрипт упал — разметка из сборки, ссылки работают',
  },
  'cart-drawer': { group: 'overlay', list: OVERLAY_LIST, fallback: 'cart.open ведёт на /cart' },
  'cart-added': {
    group: 'overlay',
    list: OVERLAY_LIST,
    fallback: 'окно не открывается, меняется только число в «Корзине»',
  },
  login: {
    group: 'page',
    list: 'page-login',
    fallback: 'секции нет — /login отвечает 404; скрипт упал — разметка из сборки, ссылки работают',
  },
  search: { group: 'overlay', list: OVERLAY_LIST, fallback: 'search.open ведёт на /catalog' },
  notices: { group: 'overlay', list: OVERLAY_LIST, fallback: 'уведомлений нет' },
  'cookie-banner': {
    group: 'overlay',
    list: OVERLAY_LIST,
    fallback: 'ответа о согласии нет — работает только обезличенный счёт',
  },
};

// Место секции с ролью в ответе /sections (договор с конструктором, план 12г): роль, список ревизии, группа и один
// экземпляр.
export interface RoleKeys {
  readonly role: SectionRole;
  readonly place: string;
  readonly groups: readonly RolePlace['group'][];
  readonly limit: number;
}

export const roleKeysOf = (role: SectionRole): RoleKeys => ({
  role,
  place: ROLE_PLACES[role].list,
  groups: [ROLE_PLACES[role].group],
  limit: ROLE_LIMIT,
});
