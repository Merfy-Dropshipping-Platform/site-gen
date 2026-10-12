import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import {
  NO_MIGRATIONS,
  migrateTokenEdits,
  parseTokenEdits,
  tokensCss,
  type ParsedTheme,
  type TokenEdits,
  type TokenMigrations,
} from '@merfy/tokens';
import { codeHead, pageSections } from './code';
import { countersOf } from './counters';
import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals, ShopSocial } from './locals';
import type { ShopRoute } from './routes';

// Данные страницы для рисовальщика (design.md блока 4, В4-4 Б и SEO). Всё индексируемое — язык, заголовок, описание,
// ключевые слова, канонический адрес — считает сборка. Конфиг магазина (блок 3) и CSS токенов с правками мерчанта (блок 1) приходят
// готовыми строками: страница их печатает одним проходом, без правки готового HTML.

// Правки мерчанта — в форме этой версии темы: шаги перевода (блок 10) при каждом чтении, ревизию не переписываем.
function editsOf(inputs: BuildInputs, theme: ParsedTheme, migrations: TokenMigrations): TokenEdits {
  try {
    return parseTokenEdits(theme, migrateTokenEdits(inputs.revision.tokens, migrations));
  } catch (error) {
    throw new StorefrontBuildError('inputs-invalid', 'правки токенов не подходят теме', {
      path: 'revision.tokens',
      cause: error,
    });
  }
}

// Имя магазина для страницы: мерчант его стёр — адрес магазина. Пустого заголовка и имени в конфиге (блок 3) не бывает.
const shopName = (site: BuildInputs['site']): string => site.name.trim() || new URL(site.publicUrl).host;

// Картинка для соцсетей (блок 9) — логотип магазина из брендинга. Соцсети показывают картинку по адресу https в PNG,
// JPEG, WebP или GIF; SVG, http и путь без адреса — пустая строка: тега og:image нет, сборка идёт.
const SHARE_IMAGE = /\.(?:png|jpe?g|webp|gif)$/i;

function shareImage(logoUrl: string): string {
  const url = URL.parse(logoUrl.trim());
  return url !== null && url.protocol === 'https:' && SHARE_IMAGE.test(url.pathname) ? url.href : '';
}

const socialOf = (name: string, locale: string, logoUrl: string): ShopSocial => ({
  type: 'website',
  siteName: name,
  locale: locale.replace('-', '_'),
  image: shareImage(logoUrl),
  card: 'summary',
});

export function pageLocals(
  inputs: BuildInputs,
  route: ShopRoute,
  theme: ParsedTheme,
  migrations: TokenMigrations = NO_MIGRATIONS,
): ShopPageLocals {
  const name = shopName(inputs.site);
  const config = buildStorefrontConfig({
    site: { ...inputs.site, name },
    theme: inputs.theme,
    env: inputs.env,
    page: { id: route.id, path: route.path },
    mode: 'live',
    analytics: { url: inputs.env.analyticsUrl, counters: countersOf(inputs.data.entities) },
  });
  const head = {
    lang: config.locale,
    // SEO-заголовок мерчанта; не заполнил — имя магазина, нет и его — адрес.
    title: inputs.site.seoTitle.trim() || name,
    // Пусто — мерчант не заполнил: тема тег не рисует (договор SEO, seo.ts).
    description: inputs.site.description.trim(),
    keywords: inputs.site.keywords.trim(),
    canonical: new URL(route.path, inputs.site.publicUrl).href,
    configHtml: configTag(config),
    tokensCss: tokensCss(theme.dictionary, theme.tokens, editsOf(inputs, theme, migrations)),
    // Код секций страницы (блок 7) — готовой строкой, как конфиг и токены.
    codeHtml: codeHead(inputs, route.id),
    social: socialOf(name, config.locale, inputs.site.logoUrl),
  };
  return { head, shop: { name }, year: inputs.year, sections: pageSections(inputs, route.id) };
}
