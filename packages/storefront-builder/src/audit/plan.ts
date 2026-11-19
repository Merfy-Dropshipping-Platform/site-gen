import type { StorefrontManifest } from '@merfy/storefront-build';
import { MAX_AUDITS_PER_PUBLISH } from './contract';

export type Pages = StorefrontManifest['pages'];

// Приоритет страниц: главная, каталог, товар, корзина, остальные. Меньше номер — раньше.
const PRIORITY: ReadonlyArray<(path: string) => boolean> = [
  (path) => path === '/',
  (path) => path === '/catalog',
  (path) => path.startsWith('/product/'),
  (path) => path === '/cart',
];

function rankOf(path: string): number {
  const rank = PRIORITY.findIndex((matches) => matches(path));
  return rank === -1 ? PRIORITY.length : rank;
}

// Страница списка после первой — те же секции с другими данными: отдельный аудит не нужен.
const isFirstListPage = (page: Pages[number]): boolean => page.list === undefined || page.list.page === 1;

// Изменённые опубликованные страницы: новые и с другим отпечатком файла. Живой сборки не было — все.
export function changedPages(previous: Pages | null, next: Pages): Pages {
  const before = new Map((previous ?? []).map((page) => [page.path, page.hash]));
  return next.filter((page) => before.get(page.path) !== page.hash);
}

// Что аудировать после публикации: изменённые страницы по приоритету, не больше `MAX_AUDITS_PER_PUBLISH`.
export function auditPlan(previous: Pages | null, next: Pages): Pages {
  return changedPages(previous, next)
    .filter(isFirstListPage)
    .sort((a, b) => rankOf(a.path) - rankOf(b.path) || a.path.localeCompare(b.path))
    .slice(0, MAX_AUDITS_PER_PUBLISH);
}
