/**
 * Логотип шапки: загруженный мерчантом файл или '' (тогда шапка пишет
 * название магазина текстом).
 *
 * Договорённость платформы: конструктор при удалении логотипа пишет в шапку
 * `logo: ''` и `siteTitle: <название магазина из админки>`
 * (constructor: ConstructorContext.withBrandLogoApplied), а порт темы без
 * своего файла рисует siteTitle. Картинка темы на месте логотипа — чужое имя
 * у магазина мерчанта (баг владельца 28.09 по flux: «ılıl FLUX» у магазина
 * «MrMerfy» без логотипа).
 *
 * Не считаем логотипом магазина, данными:
 *   • `/logo.svg` — плейсхолдер сидов (и его переписанный вид
 *     https://<slug>.merfy.ru/logo.svg): на витрине это старый рисунок или 404;
 *   • `/icons/…` — картинки самой темы (logo-flux.svg, Bloom.svg).
 * Загрузки мерчанта лежат в /branding/… и под правила не попадают.
 * То же правило держат порты rose и bloom (Header.astro), сравнение по pathname.
 */

const THEME_OWNED_LOGO_PATHS: ReadonlyArray<(pathname: string) => boolean> = [
  (pathname) => pathname === '/logo.svg',
  (pathname) => pathname.startsWith('/icons/'),
];

function pathnameOf(url: string): string {
  try {
    return new URL(url, 'https://_merfy_').pathname;
  } catch {
    return url;
  }
}

/** Загруженный мерчантом логотип шапки (проп `logo`) или '' (нет файла / файл темы). */
export function headerOwnLogo(logo: unknown): string {
  const raw = typeof logo === 'string' ? logo.trim() : '';
  if (!raw) return '';
  const pathname = pathnameOf(raw);
  return THEME_OWNED_LOGO_PATHS.some((isThemeOwned) => isThemeOwned(pathname)) ? '' : raw;
}
