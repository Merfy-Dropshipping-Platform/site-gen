import { buildStorefrontConfig, configTag } from '@merfy/storefront-config';
import { parseTokenEdits, tokensCss, type ParsedTheme, type TokenEdits } from '@merfy/tokens';
import { StorefrontBuildError } from './errors';
import type { BuildInputs } from './inputs';
import type { ShopPageLocals } from './locals';
import type { ShopRoute } from './routes';

// Данные страницы для рисовальщика (design.md блока 4, В4-4 Б и SEO). Всё индексируемое — язык, заголовок, описание,
// канонический адрес — считает сборка. Конфиг магазина (блок 3) и CSS токенов с правками мерчанта (блок 1) приходят
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

export function pageLocals(inputs: BuildInputs, route: ShopRoute, theme: ParsedTheme): ShopPageLocals {
  const config = buildStorefrontConfig({
    site: inputs.site,
    theme: inputs.theme,
    env: inputs.env,
    page: { id: route.id, path: route.path },
    mode: 'live',
  });
  const head = {
    lang: config.locale,
    title: inputs.site.name,
    description: inputs.site.description,
    canonical: new URL(route.path, inputs.site.publicUrl).href,
    configHtml: configTag(config),
    tokensCss: tokensCss(theme.dictionary, theme.tokens, editsOf(inputs, theme)),
  };
  return { head, shop: { name: inputs.site.name }, year: inputs.year };
}
