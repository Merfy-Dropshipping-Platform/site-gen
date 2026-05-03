export type PageNumber = number | 'ellipsis';

export function paginateProducts<T>(products: readonly T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const start = (safePage - 1) * pageSize;
  return products.slice(start, start + pageSize);
}

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.ceil(total / pageSize);
}

export function getPageNumbers(current: number, total: number): PageNumber[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  // Current near the start: show pages 1, 2, 3 then ellipsis + last
  if (current <= 3) {
    return [1, 2, 3, 'ellipsis', total];
  }
  // Current near the end: show first + ellipsis + last 3 pages
  if (current >= total - 2) {
    return [1, 'ellipsis', total - 2, total - 1, total];
  }
  // Current in the middle: first + ellipsis + (current-1, current, current+1) + ellipsis + last
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}
