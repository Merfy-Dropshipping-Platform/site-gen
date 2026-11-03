import { sha256 } from './canonical';
import { checkoutVarsCss } from './checkout-css';
import { pageBundle } from './code';
import { entityKey } from './entities';
import { pageLocals, themeRootTokens, themeSchemes } from './head';
import type { BuildInputs } from './inputs';
import type { CheckoutLocals, JsonObject } from './locals';
import { checkPageRow, type PageRow } from './manifest';
import type { SpecialFiles } from './platform-pages';
import type { RenderedPage, ShopTheme } from './page';
import type { PageContent, PageMode, PageRender } from './sections-render';
import type { ShopRoute } from './routes';
import { NOINDEX_META, NOINDEX_PAGE_IDS } from './special-pages';

// Прежние страницы оформления новой темы (блок 10, Р10а-17): с 03.11 — только у версий темы без "checkout": "sections"
// в theme.json (build.ts); у них пишутся в каждой сборке, строк в манифесте страниц нет. Бандл /checkout — с частью
// checkoutLegacy (window.cartStore для блоков theme-base); новое оформление — секции на модуле checkout.

export const CHECKOUT_PAGES = [
  { id: 'page-checkout', path: '/checkout', file: 'checkout/index.html', parts: ['checkoutLegacy'] },
  { id: 'page-checkout-result', path: '/checkout-result', file: 'checkout-result/index.html', parts: [] },
] as const;

type CheckoutPage = (typeof CHECKOUT_PAGES)[number];

const routeOf = (page: CheckoutPage): ShopRoute => ({ id: page.id, path: page.path, file: page.file, entity: 'site' });

// Свойства блока из ревизии (Р10а-19): нет блока — {}.
const propsOf = (inputs: BuildInputs, type: string): JsonObject => {
  const block = inputs.revision.checkout?.blocks.find((candidate) => candidate.type === type);
  return block === undefined ? {} : block.props;
};

const BLOCK_TYPES = { header: 'CheckoutHeader', layout: 'CheckoutLayout', form: 'CheckoutForm', summary: 'CheckoutSummary' } as const;

const checkoutLocalsOf = (inputs: BuildInputs, theme: ShopTheme, result: boolean, mode: PageMode): CheckoutLocals => ({
  result,
  config: { shopId: inputs.site.id, apiUrl: inputs.env.apiUrl, dadataToken: '' },
  varsCss: checkoutVarsCss(themeSchemes(inputs, theme.tokens, theme.migrations), themeRootTokens(inputs, theme.tokens, theme.migrations)),
  header: propsOf(inputs, BLOCK_TYPES.header),
  // Р10а-19: на витрине действует только «Шапка оформления»; в превью — все четыре блока, как на проде.
  ...(mode === 'preview'
    ? {
        layout: propsOf(inputs, BLOCK_TYPES.layout),
        form: propsOf(inputs, BLOCK_TYPES.form),
        summary: propsOf(inputs, BLOCK_TYPES.summary),
      }
    : { layout: {}, form: {}, summary: {} }),
});

// Строка нужна только для бандла: в manifest.pages страницы оформления не попадают.
const rowOf = (inputs: BuildInputs, page: CheckoutPage, content: Buffer): PageRow =>
  checkPageRow({
    path: page.path,
    file: page.file,
    hash: sha256(content),
    entity: { type: 'site', id: inputs.site.id },
    deps: [entityKey('site', inputs.site.id)],
    dataUpdatedAt: inputs.site.updatedAt,
  });

// Списки page-checkout и page-checkout-result (секции оформления, 03.11) прежняя страница не рисует — и их скриптов в её
// бандле нет: досев набора кладёт их и магазинам на прежних версиях темы.
const CHECKOUT_LISTS: ReadonlySet<string> = new Set(CHECKOUT_PAGES.map((page) => page.id));
const withoutCheckoutLists = (inputs: BuildInputs): BuildInputs => ({
  ...inputs,
  code: {
    ...inputs.code,
    pages: Object.fromEntries(Object.entries(inputs.code.pages).filter(([list]) => !CHECKOUT_LISTS.has(list))),
  },
});

// Файлы оформления (Р10а-17): страница и её бандл — с частями самой страницы (checkoutLegacy у /checkout), шапкой и
// подвалом; в manifest.pages строк нет.
export async function checkoutFiles(inputs: BuildInputs, theme: ShopTheme, page: PageRender): Promise<SpecialFiles> {
  const code = withoutCheckoutLists(inputs);
  const files = await Promise.all(
    CHECKOUT_PAGES.map(async (checkout): Promise<RenderedPage> => {
      const route = routeOf(checkout);
      // Бандл — до рендера: его тег идёт в <head> страницы (часть 5б), как у страниц секций.
      const bundle = await pageBundle(code, checkout.id, page, undefined, [...checkout.parts]);
      // Оформление — служебная страница (special-pages.json, index: false): noindex перед бандлом, как у страниц секций.
      const bundleTag = `${NOINDEX_PAGE_IDS.has(checkout.id) ? NOINDEX_META : ''}${bundle?.tag ?? ''}`;
      const content: PageContent = { sections: [], sectionsCss: '', mode: 'live', bundleTag };
      const locals = {
        ...pageLocals(inputs, route, theme.tokens, theme.migrations, content),
        checkout: checkoutLocalsOf(inputs, theme, checkout.id === 'page-checkout-result', page.mode),
      };
      const html = await theme.render(route.path, locals);
      const pageHtml = Buffer.from(html, 'utf8');
      const file = bundle?.file ?? null;
      return {
        row: rowOf(inputs, checkout, pageHtml),
        file: { path: checkout.file, content: pageHtml },
        ...(file === null ? {} : { bundle: file }),
      };
    }),
  );
  return { files: files.map((rendered) => rendered.file), rendered: files };
}
