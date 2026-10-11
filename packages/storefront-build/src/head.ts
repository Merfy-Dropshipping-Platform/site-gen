import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import { parseTokenEdits, tokensCss, type ParsedTheme, type TokenEdits } from '@merfy/tokens';
import { codeHead, pageSections } from './code';
import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals } from './locals';
import type { ShopRoute } from './routes';

// Данные страницы для рисовальщика (design.md блока 4, В4-4 Б и SEO). Всё индексируемое — язык, заголовок, описание,
// ключевые слова, канонический адрес — считает сборка. Конфиг магазина (блок 3) и CSS токенов с правками мерчанта (блок 1) приходят
// готовыми строками: страница их печатает одним проходом, без правки готового HTML.

function editsOf(inputs: BuildInputs, theme: ParsedTheme): TokenEdits {
  try {
    return parseTokenEdits(theme, inputs.revision.tokens);
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

export function pageLocals(inputs: BuildInputs, route: ShopRoute, theme: ParsedTheme): ShopPageLocals {
  const name = shopName(inputs.site);
  const config = buildStorefrontConfig({
    site: { ...inputs.site, name },
    theme: inputs.theme,
    env: inputs.env,
    page: { id: route.id, path: route.path },
    mode: 'live',
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
    tokensCss: tokensCss(theme.dictionary, theme.tokens, editsOf(inputs, theme)),
    // Код секций страницы (блок 7) — готовой строкой, как конфиг и токены.
    codeHtml: codeHead(inputs, route.id),
    social: {
      type: 'website',
      siteName: name,
      locale: config.locale.replace('-', '_'),
      image: shareImage(inputs.site.logoUrl),
      card: 'summary',
    },
  };
  return { head, shop: { name }, year: inputs.year, sections: pageSections(inputs, route.id) };
}
