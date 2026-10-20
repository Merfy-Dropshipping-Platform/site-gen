import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import {
  NO_MIGRATIONS,
  migrateTokenEdits,
  parseTokenEdits,
  type ParsedTheme,
  type TokenEdits,
  type TokenMigrations,
} from '@merfy/tokens';
import { codeHead } from './code';
import { themeFonts, themeTokensCss } from './fonts';
import { countersOf } from './counters';
import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals, ShopSocial } from './locals';
import type { ShopRoute } from './routes';
import { EMPTY_PAGE_CONTENT, type PageContent, type PageMode } from './sections-render';

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

// Шрифты магазина (блок 12): одни на все страницы сборки — их файлы идут в манифест (build.ts).
export const shopFonts = (inputs: BuildInputs, theme: ParsedTheme, migrations: TokenMigrations = NO_MIGRATIONS) =>
  themeFonts(theme, editsOf(inputs, theme, migrations));

// CSS страницы по одним правкам мерчанта: шрифты (блок 12) и токены (блок 1).
function pageStyles(inputs: BuildInputs, theme: ParsedTheme, migrations: TokenMigrations) {
  const edits = editsOf(inputs, theme, migrations);
  const fonts = themeFonts(theme, edits);
  const tokens = themeTokensCss(theme, edits);
  return { fontsCss: fonts.css, fontPreload: fonts.preload ?? '', tokensCss: tokens };
}

type ConfigAnalytics = Parameters<typeof buildStorefrontConfig>[0]['analytics'];

// Аналитика — только на опубликованном сайте: превью конструктора событий не шлёт (Р1).
const ANALYTICS_BY_MODE: Record<PageMode, (inputs: BuildInputs) => ConfigAnalytics> = {
  live: (inputs) => ({ url: inputs.env.analyticsUrl, counters: countersOf(inputs.data.entities) }),
  preview: () => null,
};

// content — секции страницы, нарисованные заранее (page.ts): разметка, CSS и режим. По умолчанию секций нет.
export function pageLocals(
  inputs: BuildInputs,
  route: ShopRoute,
  theme: ParsedTheme,
  migrations: TokenMigrations = NO_MIGRATIONS,
  content: PageContent = EMPTY_PAGE_CONTENT,
): ShopPageLocals {
  const name = shopName(inputs.site);
  const config = buildStorefrontConfig({
    site: { ...inputs.site, name },
    theme: inputs.theme,
    env: inputs.env,
    page: { id: route.id, path: route.path },
    mode: content.mode,
    analytics: ANALYTICS_BY_MODE[content.mode](inputs),
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
    ...pageStyles(inputs, theme, migrations),
    // Код секций страницы (блок 7) — готовой строкой, как конфиг и токены.
    codeHtml: codeHead(inputs, route.id, content.sectionsCss, content.mode),
    social: socialOf(name, config.locale, inputs.site.logoUrl),
  };
  return { head, shop: { name }, year: inputs.year, sections: content.sections };
}
