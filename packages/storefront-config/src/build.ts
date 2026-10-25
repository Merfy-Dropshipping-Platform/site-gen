import { themeSettingsOf } from './theme-settings';
import type { StorefrontExtensions } from './extensions';
import { CONFIG_VERSION, CURRENCY, LOCALE, checkStorefrontConfig, type Counter, type StorefrontConfig } from './schema';

// Писатель конфига (design.md блока 3, 5.3): чистая функция — тот же вход, тот же конфиг; ни сети, ни файлов, ни часов.

// «Свой код» мерчанта во входе — тот же вид, что в конфиге (блок 13 «Секций и SDK»).
type CustomCodes = NonNullable<StorefrontConfig['analytics']>['custom'];

export interface StorefrontConfigInput {
  // Строка сайта. В конфиг идут id, имя и публичный адрес; остальные поля строки допустимы и наружу не уходят.
  site: { id: string; name: string; publicUrl: string | null };
  // id и версия — из манифеста темы; settings — значения настроек панели темы, как у шаблона в Astro.props.theme: в
  // конфиг идут только сквозные (блок 9 «Секций и SDK», часть 9б). Нет — поля theme.settings нет.
  theme: { id: string; version: string; settings?: Readonly<Record<string, unknown>> };
  // Адрес API — из окружения сборки: тот же, что PUBLIC_MERFY_API_URL у сборки тем (resolveApiUrl в site-gen).
  env: { apiUrl: string };
  // id из реестра страниц платформы или своей страницы темы (theme-stand) и адрес страницы.
  // record — запись страницы шаблона (блок 8, часть 8б-2): вид и id; у страниц сайта нет.
  page: { id: string; path: string; record?: StorefrontConfig['page']['record'] };
  mode: StorefrontConfig['mode'];
  // Сборщик аналитики и счётчики мерчанта (блок 11): адрес — из ANALYTICS_COLLECTOR_URL сборщика витрин, счётчики — у
  // сборщика аналитики. Нет поля или null — магазин ничего не отправляет (превью, стенд); live без него не соберётся.
  analytics?: { url: string; counters: readonly Counter[]; custom?: CustomCodes } | null;
  // Сторы и методы расширений для секций страницы (блок 9 «Секций и SDK», часть 9в); нет или пусто — поля нет.
  extensions?: StorefrontExtensions;
}

// Пустые описания в конфиг не идут: у страницы без ctx.ext конфиг прежний.
const extensionsOf = (extensions: StorefrontExtensions | undefined): Pick<StorefrontConfig, 'extensions'> =>
  extensions === undefined || Object.keys(extensions).length === 0 ? {} : { extensions };

// Поле за полем: лишнее из входа (строка счётчика у сборщика аналитики) в конфиг не уходит. «Свой код» — только
// непустым списком: у магазина без него конфиг прежний.
function analyticsOf(analytics: StorefrontConfigInput['analytics']): StorefrontConfig['analytics'] {
  if (analytics === undefined || analytics === null) return null;
  const counters = analytics.counters.map((counter) => ({ kind: counter.kind, number: counter.number }));
  const custom = (analytics.custom ?? []).map((item) => ({ code: item.code, consent: item.consent }));
  return custom.length === 0 ? { url: analytics.url, counters } : { url: analytics.url, counters, custom };
}

// Пустой адрес — магазин ещё не публиковали: в preview это null, в live схема потребует адрес.
const shopUrlOf = (publicUrl: string | null): string | null => (publicUrl === '' ? null : publicUrl);

// Страница для конфига: id и адрес; у страницы записи — вид и id записи, лишние поля записи не идут (часть 8б-2).
function pageOf(page: StorefrontConfigInput['page']): StorefrontConfig['page'] {
  if (page.record === undefined) return { id: page.id, path: page.path };
  return { id: page.id, path: page.path, record: { type: page.record.type, id: page.record.id } };
}

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
    theme: { id: theme.id, version: theme.version, ...themeSettingsOf(theme.settings) },
    page: pageOf(page),
    analytics: analyticsOf(input.analytics),
    ...extensionsOf(input.extensions),
  });
}
