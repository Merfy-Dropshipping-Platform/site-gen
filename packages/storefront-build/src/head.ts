import {
  PAGE_TRANSITION_ATTRIBUTE,
  PAGE_TRANSITION_SCRIPT,
  isPageTransition,
  pageTransitionCss,
} from '@merfy/shell/behaviors/page-transition';
import { buildStorefrontConfig, configTag, type StorefrontConfigInput } from '@merfy/storefront-config';
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
import { codeHead, pageExtPoints, pageExtensions } from './code';
import { shopSectionTokensCss } from './section-tokens';
import { themeFonts, themeTokensCss } from './fonts';
import { countersOf } from './counters';
import { customCodesOf } from './custom-codes';
import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { ShopPageHead, ShopPageLocals, ShopPreconnect, ShopSocial } from './locals';
import type { RecordEntry, RecordType } from './records';
import { CATALOG_PAGE_ID, type ShopRoute } from './routes';
import { EMPTY_PAGE_CONTENT, type PageContent, type PageMode } from './sections-render';
import { CHECKOUT_PAGE_ID, NOT_FOUND_PAGE_ID, NOT_FOUND_TEXT, platformPageTitle } from './special-pages';
import { productStructuredData } from './structured-data';

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
// Страница N списка (блок 11 «Секций и SDK», Р11а-12): «… — страница N» в <title>; canonical — её адрес (route.path).
// Описание есть у каждой страницы (02.11.2026, PageSpeed: «Document does not have a meta description» — оценка SEO
// ниже): своё пустое — описание магазина, пусто и оно — «<имя> — интернет-магазин». Заполнить своё мерчанту
// подсказывает MCP.
function seoOf(inputs: BuildInputs, route: ShopRoute, name: string) {
  const base = baseSeoOf(inputs, route, name);
  const seo = { ...base, description: base.description || inputs.site.description.trim() || defaultDescription(name) };
  const page = route.list?.page ?? 1;
  return page > 1 ? { ...seo, title: `${seo.title} — страница ${page}` } : seo;
}

export const defaultDescription = (name: string): string => `${name} — интернет-магазин`;

// Каталог (блок 11, Р11а-12): заголовок платформы «Каталог · <магазин>», описание — магазина, ключевых слов нет.
const CATALOG_HEADING = 'Каталог';

function baseSeoOf(inputs: BuildInputs, route: ShopRoute, name: string) {
  if (route.id === CATALOG_PAGE_ID)
    return {
      title: platformPageTitle(CATALOG_HEADING, name),
      description: inputs.site.description.trim(),
      keywords: '',
    };
  // Страница записи (блок 8, часть 8б-2; design.md 8.6): SEO записи (records.ts) — заголовок мерчанта или название,
  // описание мерчанта или описание без HTML; ключевых слов нет.
  if (route.record !== undefined)
    return { title: route.record.seo.title.trim() || name, description: route.record.seo.description, keywords: '' };
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

// og:type страницы записи (design.md блока 8, 8.6): товар — product, статья — article, остальные — website, как главная.
const OG_TYPES: Readonly<Record<RecordType, string>> = {
  product: 'product',
  collection: 'website',
  blog: 'website',
  article: 'article',
  policy: 'website',
};

// Картинка страницы записи — её картинка (records.ts, seo.image); нет или не подходит соцсетям — логотип магазина.
const socialOf = (name: string, locale: string, logoUrl: string, record?: RecordEntry): ShopSocial => ({
  type: record === undefined ? 'website' : OG_TYPES[record.type],
  siteName: name,
  locale: locale.replace('-', '_'),
  image: shareImage(record?.seo.image ?? '') || shareImage(logoUrl),
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

// Схемы словаря с правками мерчанта (блок 10, Р10а-18): те же словарь и правки, из которых печатается tokensCss, —
// по ним сборка пишет таблицу переменных оформления пяти тем (checkout-css.ts).
export function themeSchemes(
  inputs: BuildInputs,
  theme: ParsedTheme,
  migrations: TokenMigrations = NO_MIGRATIONS,
): Record<string, Record<string, unknown>> {
  const edits = editsOf(inputs, theme, migrations);
  return resolveTokens(theme.dictionary, theme.tokens, edits).schemes;
}

// Корневые токены словаря с правками мерчанта (блок 10, Р10а-18): те же словарь и правки, из которых печатается
// tokensCss, — по ним сборка пишет размеры переменных оформления (checkout-css.ts).
export function themeRootTokens(
  inputs: BuildInputs,
  theme: ParsedTheme,
  migrations: TokenMigrations = NO_MIGRATIONS,
): Record<string, unknown> {
  const edits = editsOf(inputs, theme, migrations);
  return resolveTokens(theme.dictionary, theme.tokens, edits).root;
}

type ConfigAnalytics = Parameters<typeof buildStorefrontConfig>[0]['analytics'];

// Страница для конфига витрины: id и адрес; у страницы записи — вид и id записи (часть 8б-2; блоки 13 и 12в).
const configPageOf = (route: ShopRoute): StorefrontConfigInput['page'] => ({
  id: route.id,
  path: route.path,
  ...(route.record === undefined ? {} : { record: { type: route.record.type, id: route.record.id } }),
});

// Аналитика — только на опубликованном сайте: превью конструктора событий не шлёт (Р1).
const ANALYTICS_BY_MODE: Record<PageMode, (inputs: BuildInputs) => ConfigAnalytics> = {
  live: (inputs) => ({
    url: inputs.env.analyticsUrl,
    counters: countersOf(inputs.data.entities),
    custom: customCodesOf(inputs.data.entities),
  }),
  preview: () => null,
};

// Иконка вкладки: своя мерчанта по адресу https; нет — пустая data:, — браузер не просит /favicon.ico и не качает
// страницу 404 (02.11.2026: 185 КБ на каждый первый заход). data: и https: разрешены в img-src политики (csp.ts).
export const NO_FAVICON = 'data:,';

function faviconOf(favicon: string | undefined): string {
  const url = URL.parse((favicon ?? '').trim());
  return url !== null && url.protocol === 'https:' ? url.href : NO_FAVICON;
}

// Ранние соединения (02.11.2026, PageSpeed: «Preconnect to required origins», ~0,5 с): к шлюзу — у страницы с бандлом,
// он ходит туда за данными (fetch без cookie — crossorigin); к хосту главной картинки <main> — если он не адрес
// магазина. Больше двух не ставим: лишние соединения отнимают канал у первого экрана.
function preconnectsOf(inputs: BuildInputs, content: PageContent): ShopPreconnect[] {
  const own = new URL(inputs.site.publicUrl).origin;
  const api: ShopPreconnect[] =
    content.bundleTag === undefined ? [] : [{ href: new URL(inputs.env.apiUrl).origin, crossorigin: true }];
  const image = URL.parse(content.mainImage ?? '', inputs.site.publicUrl);
  const images: ShopPreconnect[] =
    image !== null && image.protocol === 'https:' ? [{ href: image.origin, crossorigin: false }] : [];
  return [...api, ...images].filter((link) => link.href !== own);
}

// Ссылки <head> сверх SEO: иконка вкладки и ранние соединения.
const linksOf = (inputs: BuildInputs, content: PageContent): Pick<ShopPageHead, 'favicon' | 'preconnect'> => ({
  favicon: faviconOf(inputs.site.favicon),
  preconnect: preconnectsOf(inputs, content),
});

// Разметка для поиска (design.md блока 8, 8.6) — только у страницы товара; у остальных страниц поля нет.
function structuredDataOf(route: ShopRoute, canonical: string): { structuredData?: string } {
  const data = productStructuredData(route.record, canonical);
  return data === '' ? {} : { structuredData: data };
}

// Ключ подсказок адреса DaData (оформление заказа, 03.11): страница оформления на витрине и ключ задан сборщику.
const dadataOf = (
  inputs: BuildInputs,
  route: ShopRoute,
  mode: PageMode,
): Pick<StorefrontConfigInput, 'dadataToken'> => {
  const token = inputs.env.dadataToken;
  return route.id === CHECKOUT_PAGE_ID && mode === 'live' && token !== undefined ? { dadataToken: token } : {};
};

// Конфиг витрины страницы (блок 3).
const pageConfigOf = (inputs: BuildInputs, route: ShopRoute, content: PageContent, name: string) =>
  buildStorefrontConfig({
    site: { ...inputs.site, name },
    theme: { ...inputs.theme, settings: content.themeSettings },
    env: inputs.env,
    page: configPageOf(route),
    mode: content.mode,
    analytics: ANALYTICS_BY_MODE[content.mode](inputs),
    extensions: pageExtensions(inputs, route.id),
    // Места блоков расширений для частей бандла страницы (блок 15, часть 15д, Р15д-1).
    extPoints: pageExtPoints(inputs, route.id),
    // Ключ подсказок адреса (оформление заказа, 03.11) — только у страницы оформления и только на витрине.
    ...dadataOf(inputs, route, content.mode),
  });

// Переход между страницами (13.11, часть 2д спеки анимаций): выбор словаря choice-page-transition — атрибут
// data-page-transition у <html>. fade и slide — CSS @view-transition и скрипт имён data-vt (CSP — по хешу, csp.ts);
// none и превью конструктора — ничего: в превью страница одна.
export function transitionHead(attributes: Readonly<Record<string, string>>, mode: PageMode): string {
  const kind = attributes[PAGE_TRANSITION_ATTRIBUTE];
  if (mode !== 'live' || !isPageTransition(kind) || kind === 'none') return '';
  return `<style id="merfy-page-transition">${pageTransitionCss(kind)}</style><script>${PAGE_TRANSITION_SCRIPT}</script>`;
}

// <head> страницы: язык, SEO, канонический адрес, иконка и ранние соединения, конфиг, стили, код секций, теги
// соцсетей и разметка для поиска.
function headOf(
  inputs: BuildInputs,
  route: ShopRoute,
  theme: ParsedTheme,
  migrations: TokenMigrations,
  content: PageContent,
  name: string,
): ShopPageHead {
  const config = pageConfigOf(inputs, route, content, name);
  const canonical = new URL(route.path, inputs.site.publicUrl).href;
  const styles = pageStyles(inputs, theme, migrations);
  return {
    lang: config.locale,
    ...seoOf(inputs, route, name),
    canonical,
    ...linksOf(inputs, content),
    configHtml: configTag(config),
    ...styles,
    // Код секций страницы (блок 7) — готовой строкой, как конфиг и токены: стили секций и тег бандла (часть 5б). Перед
    // ним — переход между страницами (13.11), если он выбран.
    codeHtml: `${transitionHead(styles.attributes, content.mode)}${codeHead(inputs, route.id, content.sectionsCss, content.bundleTag)}`,
    social: socialOf(name, config.locale, inputs.site.logoUrl, route.record),
    ...structuredDataOf(route, canonical),
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
    // Секции поверх страницы (блок 12, Р12а-8) — сразу после подвала: тема печатает footer после <main>.
    // Секции поверх страницы (блок 12, Р12а-8) — сразу после подвала: тема печатает footer после <main>.
    footer: [...(content.footer ?? []), ...(content.overlay ?? [])],
  };
}
