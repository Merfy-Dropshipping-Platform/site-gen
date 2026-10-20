/**
 * Публикации на витрине: адреса и дата (PUB-1, PUB-2).
 *
 * ЕДИНСТВЕННОЕ место, где собирается адрес записи и блога. Темы, секция
 * «Публикации», сборка страниц и редиректов и API записи (`url` в ответе
 * site-gen) зовут эти функции — свой адрес никто не склеивает.
 *
 *   блог   — /blogs/{handle}
 *   запись — /blogs/{handle}/{slug}
 *
 * handle и slug проверяет site-gen (латиница, цифры, дефис), поэтому здесь
 * только срезаются случайные пробелы и слэши по краям.
 */

/** Записей на одной странице блога. */
export const BLOG_PAGE_SIZE = 12;

const part = (value: string): string =>
  String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '');

/** Адрес блога: `/blogs/{handle}`. */
export function blogUrl(blogHandle: string): string {
  return `/blogs/${part(blogHandle)}`;
}

/** Адрес записи блога: `/blogs/{handle}/{slug}`. */
export function publicationUrl(blogHandle: string, slug: string): string {
  return `${blogUrl(blogHandle)}/${part(slug)}`;
}

/**
 * Адрес страницы блога с номером: первая — без параметра, остальные —
 * `?page=N`, как переход по страницам каталога (`Catalog/url-params.ts`).
 */
export function blogPageUrl(blogHandle: string, page: number): string {
  const n = Math.floor(Number(page));
  return Number.isFinite(n) && n > 1 ? `${blogUrl(blogHandle)}?page=${n}` : blogUrl(blogHandle);
}

/**
 * Номера страниц для перехода по страницам блога — та же раскладка, что у
 * каталога (`blocks/Catalog/pagination.ts` `getPageNumbers`; совпадение
 * сторожит publication-url.spec). Здесь копия, потому что блоки собираются
 * в плоский dist и из блока доступен только runtime/.
 */
export function blogPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 'ellipsis', total];
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

/**
 * Дата записи по-русски: «1 января 2025». Без «г.», который добавляет
 * `Intl` для `ru-RU`. День — по московскому времени: запись, опубликованная
 * в 01:30 по Москве, не должна показываться вчерашним числом.
 */
export function formatPublicationDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const day = get('day');
  const month = get('month');
  const year = get('year');
  if (!day || !month || !year) return '';
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
}
