import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  NO_MIGRATIONS,
  choiceAttributes,
  migrateTokenEdits,
  parseTokenEdits,
  resolveTokens,
  type ParsedTheme,
  type TokenEdits,
  type TokenMigrations,
} from '@merfy/tokens';
import { codeHead, pageExtensions } from './code';
import { shopSectionTokensCss } from './section-tokens';
import { themeFonts, themeTokensCss } from './fonts';
import { countersOf } from './counters';
import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { ShopPageHead, ShopPageLocals, ShopSocial } from './locals';
import type { ShopRoute } from './routes';
import { EMPTY_PAGE_CONTENT, type PageContent, type PageMode } from './sections-render';
import { NOT_FOUND_PAGE_ID, NOT_FOUND_TEXT, platformPageTitle } from './special-pages';

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
export const shopName = (site: BuildInputs['site']): string => site.name.trim() || new URL(site.publicUrl).host;

// SEO страницы. У главной — SEO магазина: заголовок мерчанта, иначе имя магазина, иначе адрес. У своей страницы (часть
// 4, Р1-4-8) — её SEO из ревизии: без заголовка — имя страницы, нет и его — имя магазина. Пусто — мерчант не заполнил:
// тема тег не рендерит (договор SEO, seo.ts).
function seoOf(inputs: BuildInputs, route: ShopRoute, name: string) {
  // Страница 404 (часть 7а): заголовок платформы с именем магазина, описание — магазина, ключевых слов нет.
  if (route.id === NOT_FOUND_PAGE_ID)
    return {
      title: platformPageTitle(NOT_FOUND_TEXT.heading, name),
      description: inputs.site.description.trim(),
      keywords: '',
    };
  const page = (inputs.revision.pages ?? []).find((candidate) => candidate.id === route.id);
  if (page === undefined)
    return {
      title: inputs.site.seoTitle.trim() || name,
      description: inputs.site.description.trim(),
      keywords: inputs.site.keywords.trim(),
    };
  return {
    title: page.seo.title.trim() || page.name.trim() || name,
    description: page.seo.description.trim(),
    keywords: page.seo.keywords.trim(),
  };
}

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

// CSS страницы по одним правкам мерчанта: шрифты (блок 12) и токены (блок 1); CSS токенов секций магазина —
// правилами на обёртках секций (блок 4, Р4-10). Неверные правки секций увидит превью — сборка идёт с умолчаниями.
// База страницы (Р4-12) читается при первой голове, не при загрузке модуля: процесс проверки секций (sandbox)
// этот файл не читает — он вне разрешённых процессу папок.
let pageBase: string | undefined;
function pageBaseCss(): string {
  pageBase ??= readFileSync(createRequire(import.meta.url).resolve('@merfy/tokens/base.css'), 'utf8');
  return pageBase;
}

function pageStyles(inputs: BuildInputs, theme: ParsedTheme, migrations: TokenMigrations) {
  const edits = editsOf(inputs, theme, migrations);
  const fonts = themeFonts(theme, edits);
  const tokens = themeTokensCss(theme, edits);
  const sectionTokens = shopSectionTokensCss(inputs.code.sections, inputs.revision.tokens);
  const tokensCss = [tokens, sectionTokens.css].filter((part) => part !== '').join('\n');
  return {
    baseCss: pageBaseCss(),
    fontsCss: fonts.css,
    fontPreload: fonts.preload ?? '',
    tokensCss,
    // Выборы словаря с правками мерчанта — атрибуты у <html> (блок 6, часть 6б): без data-motion-reveal="on" появления
    // секций не запускаются.
    attributes: choiceAttributes(theme.dictionary, resolveTokens(theme.dictionary, theme.tokens, edits)),
  };
}

// CSS простых страниц платформы 404 и 502 (часть 7а): шрифты и токены по тем же правкам мерчанта, что у его страниц.
export function platformPageStyles(
  inputs: BuildInputs,
  theme: ParsedTheme,
  migrations: TokenMigrations = NO_MIGRATIONS,
): { fontsCss: string; tokensCss: string } {
  const { fontsCss, tokensCss } = pageStyles(inputs, theme, migrations);
  return { fontsCss, tokensCss };
}

type ConfigAnalytics = Parameters<typeof buildStorefrontConfig>[0]['analytics'];

// Аналитика — только на опубликованном сайте: превью конструктора событий не шлёт (Р1).
const ANALYTICS_BY_MODE: Record<PageMode, (inputs: BuildInputs) => ConfigAnalytics> = {
  live: (inputs) => ({ url: inputs.env.analyticsUrl, counters: countersOf(inputs.data.entities) }),
  preview: () => null,
};

// <head> страницы: язык, SEO, канонический адрес, конфиг, стили, код секций и теги соцсетей.
function headOf(
  inputs: BuildInputs,
  route: ShopRoute,
  theme: ParsedTheme,
  migrations: TokenMigrations,
  content: PageContent,
  name: string,
): ShopPageHead {
  const config = buildStorefrontConfig({
    site: { ...inputs.site, name },
    theme: inputs.theme,
    env: inputs.env,
    page: { id: route.id, path: route.path },
    mode: content.mode,
    analytics: ANALYTICS_BY_MODE[content.mode](inputs),
    extensions: pageExtensions(inputs, route.id),
  });
  return {
    lang: config.locale,
    ...seoOf(inputs, route, name),
    canonical: new URL(route.path, inputs.site.publicUrl).href,
    configHtml: configTag(config),
    ...pageStyles(inputs, theme, migrations),
    // Код секций страницы (блок 7) — готовой строкой, как конфиг и токены: стили секций и тег бандла (часть 5б).
    codeHtml: codeHead(inputs, route.id, content.sectionsCss, content.bundleTag),
    social: socialOf(name, config.locale, inputs.site.logoUrl),
  };
}

// content — секции страницы, нарисованные заранее (page.ts): разметка, CSS и режим. По умолчанию секций нет.
export function pageLocals(
  inputs: BuildInputs,
  route: ShopRoute,
  theme: ParsedTheme,
  migrations: TokenMigrations = NO_MIGRATIONS,
  content: PageContent = EMPTY_PAGE_CONTENT,
): ShopPageLocals {
  const name = shopName(inputs.site);
  return {
    head: headOf(inputs, route, theme, migrations, content, name),
    shop: { name },
    year: inputs.year,
    header: content.header ?? [],
    sections: content.sections,
    footer: content.footer ?? [],
  };
}
