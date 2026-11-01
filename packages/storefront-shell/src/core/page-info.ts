import type { PageInfo } from './types';

// Адрес страницы для ctx.page (design.md блока 5, раздел 3.2): путь и параметры запроса, замороженные. Его же отдаёт
// модуль page (parts/page.ts): секция с uses: ["page"] получает вместо ctx.page этот объект и три стора рядом.
export const pageInfoOf = (win: Window): PageInfo =>
  Object.freeze({
    path: win.location.pathname,
    query: Object.freeze(Object.fromEntries(new URLSearchParams(win.location.search))),
  });
