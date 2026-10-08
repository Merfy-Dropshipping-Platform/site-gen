import { CONFIG_VERSION, CURRENCY, LOCALE, checkStorefrontConfig, type StorefrontConfig } from './schema';

// Писатель конфига (design.md блока 3, 5.3): чистая функция — тот же вход, тот же конфиг; ни сети, ни файлов, ни часов.

export interface StorefrontConfigInput {
  // Строка сайта. В конфиг идут id, имя и публичный адрес; остальные поля строки допустимы и наружу не уходят.
  site: { id: string; name: string; publicUrl: string | null };
  // id и версия — из манифеста темы.
  theme: { id: string; version: string };
  // Адрес API — из окружения сборки: тот же, что PUBLIC_MERFY_API_URL у сборки тем (resolveApiUrl в site-gen).
  env: { apiUrl: string };
  // id из реестра страниц платформы или своей страницы темы (theme-stand) и адрес страницы.
  page: { id: string; path: string };
  mode: StorefrontConfig['mode'];
}

// Пустой адрес — магазин ещё не публиковали: в preview это null, в live схема потребует адрес.
const shopUrlOf = (publicUrl: string | null): string | null => (publicUrl === '' ? null : publicUrl);

// Объект собирается поле за полем, вход целиком не раскладывается: tenantId, uuid Coolify и settings из строки сайта
// наружу не уходят. Выход проходит схему; не прошёл — StorefrontConfigError с путём поля.
export function buildStorefrontConfig(input: StorefrontConfigInput): StorefrontConfig {
  const { site, theme, env, page, mode } = input;
  return checkStorefrontConfig({
    v: CONFIG_VERSION,
    mode,
    shop: { id: site.id, name: site.name, url: shopUrlOf(site.publicUrl) },
    currency: CURRENCY,
    locale: LOCALE,
    api: { url: env.apiUrl },
    theme: { id: theme.id, version: theme.version },
    page: { id: page.id, path: page.path },
  });
}
