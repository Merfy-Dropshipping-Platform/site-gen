/**
 * Единая точка построения публичного адреса витрины.
 *
 * Домен берётся из `SITES_WILDCARD_DOMAIN`. Дефолт `merfy.ru` совпадает с
 * ранее захардкоженным значением, поэтому без выставления переменной
 * поведение не меняется (обратная совместимость).
 *
 * Значение читается на КАЖДЫЙ вызов, а не один раз при загрузке модуля:
 * так переменную можно переопределить в тестах и в рантайме до того, как
 * Nest поднимет ConfigModule.
 */
export function getSitesWildcardDomain(): string {
  return process.env.SITES_WILDCARD_DOMAIN ?? "merfy.ru";
}

/** Хост витрины: `<slug>.<wildcard>` (например `abc123.merfy.ru`). */
export function buildSiteHost(slug: string): string {
  return `${slug}.${getSitesWildcardDomain()}`;
}

/** Публичный URL витрины: `https://<slug>.<wildcard>`. */
export function buildSitePublicUrl(slug: string): string {
  return `https://${buildSiteHost(slug)}`;
}
