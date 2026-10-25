import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import type { CodeNoticed } from './bundle';
import { NO_ASSETS, checkCodeAssets, type CodeAssets } from './code';
import { countersOf } from './counters';
import { storefrontCsp } from './csp';
import { customCodesOf } from './custom-codes';
import { entityHashes } from './entities';
import { parseBuildInputs, type BuildInputs } from './inputs';
import { shopFonts } from './head';
import { buildKey, dataKey } from './key';
import { MANIFEST_VERSION, checkManifest, type StorefrontManifest } from './manifest';
import { renderShopPage, type RenderedPage, type ShopTheme } from './page';
import { checkoutFiles } from './checkout-pages';
import { specialFiles, type SpecialFiles } from './platform-pages';
import { routeCopies, shopRoutes, specialRoutes } from './routes';
import { NO_SECTIONS, type PageRender, type RenderSection, type SectionFailed } from './sections-render';
import { renderStandPage, type StandBuild } from './stand';

// Справки сборки: в ключ не входят, в манифест пишутся. Коммит платформы — SOURCE_COMMIT образа sites (В4-1 В).
export interface BuildReferences {
  platformCommit: string;
  // Включённые расширения магазина и их версии (блок 10, задача 11) — в манифест, не в ключ.
  extensions?: readonly { id: string; version: string }[];
}

// Тема для сборки магазина: токены, рисовальщик и файлы клиента её серверной сборки.
export interface ThemeBuild extends ShopTheme {
  clientFiles: readonly BuildFile[];
  // Страница стенда в сборке (шаг 7 блока 9: эталон стенда на dev по адресу магазина). Её даёт сборщик с
  // STOREFRONT_STAND_PAGE=true — только на контуре не для поиска; нет — сборка прежняя байт в байт.
  stand?: StandBuild;
}

export interface StorefrontBuild {
  manifest: StorefrontManifest;
  files: BuildFile[];
}

// Пути файлов разные: страницы — *.html, файлы клиента — то, что собрал Astro.
const byPath = (left: BuildFile, right: BuildFile): number => (left.path < right.path ? -1 : 1);

// Страниц у магазина — тысячи (блок 8 «Секций и SDK», часть 8б: страница на каждую запись), а процесс рендера темы —
// один на сборку: страницы рендерятся по PAGE_CONCURRENCY за раз, как файлы льёт выкладка (UPLOAD_CONCURRENCY).
export const PAGE_CONCURRENCY = 8;

// Порядок результата — порядок items; следующая восьмёрка — после конца предыдущей.
async function inBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    results.push(...(await Promise.all(batch.map(work))));
  }
  return results;
}

// Сборка магазина новой темы (design.md блока 4, раздел 1) — функция «входы → файлы + манифест». Каждая страница
// рисуется так же, как по запросу (renderShopPage); файлы клиента темы идут как есть. Ядро и скрипты секций (блок 7) —
// из assets: входы называют их отпечатками. Ни часов, ни случайного: одинаковые входы — одинаковые файлы, ключ и
// манифест.
// Страница сборки: модули рендера из активов и функция рендера процесса, режим live; упавшую секцию сборка пропускает и
// сообщает failed (блок 2 «Секций и SDK»).
// Бандл страницы (часть 5б) — из ядра и скриптов в assets; предупреждения сборки бандла — notice.
const livePageOf = (
  assets: CodeAssets,
  render: RenderSection,
  failed?: SectionFailed,
  notice?: CodeNoticed,
  classUnknown?: PageRender['classUnknown'],
): PageRender => ({
  sections: { modules: assets.renders, render },
  mode: 'live',
  failed,
  code: assets,
  notice,
  classUnknown,
});

// Файлы бандлов страниц: страницы с тем же набором секций дают тот же файл — он в сборке один раз.
const bundleFiles = (pages: readonly RenderedPage[]): BuildFile[] => [
  ...new Map(
    pages.flatMap((page) => (page.bundle === undefined ? [] : [[page.bundle.path, page.bundle] as const])),
  ).values(),
];

// Страницы магазина (часть 8б): все маршруты сборки, по PAGE_CONCURRENCY за раз.
const shopPagesOf = (inputs: BuildInputs, theme: ThemeBuild, page: PageRender): Promise<readonly RenderedPage[]> =>
  inBatches(shopRoutes(inputs), PAGE_CONCURRENCY, (route) => renderShopPage(inputs, route.path, theme, page));

// Все файлы сборки: код темы, бандлы, страницы и их копии, страницы 404/502 и оформления (блок 10, часть 10а) —
// по порядку путей.
const allFilesOf = (
  inputs: BuildInputs,
  theme: ThemeBuild,
  pages: readonly RenderedPage[],
  shopPages: readonly RenderedPage[],
  special: SpecialFiles,
  checkout: SpecialFiles,
): BuildFile[] =>
  [
    ...theme.clientFiles,
    ...bundleFiles([...pages, ...special.rendered, ...checkout.rendered]),
    ...pages.map((page) => page.file),
    ...copyFilesOf(inputs, shopPages),
    ...special.files,
    ...checkout.files,
  ].sort(byPath);

// Файлы адресов-копий страниц блока 10 (часть 10а, Р10а-16): тот же HTML своим файлом; строки манифеста и карты сайта
// у копии нет.
const copyFilesOf = (inputs: BuildInputs, pages: readonly RenderedPage[]): BuildFile[] => {
  const byPath = new Map(pages.map((page): [string, BuildFile] => [page.row.path, page.file]));
  return specialRoutes(inputs, 'live').flatMap((route) =>
    routeCopies(route).flatMap((copy) => {
      const source = byPath.get(route.path);
      return source === undefined ? [] : [{ path: copy.file, content: source.content }];
    }),
  );
};

export async function buildStorefront(
  raw: unknown,
  references: BuildReferences,
  theme: ThemeBuild,
  assets: CodeAssets = NO_ASSETS,
  render: RenderSection = NO_SECTIONS.render,
  failed?: SectionFailed,
  notice?: CodeNoticed,
  classUnknown?: PageRender['classUnknown'],
): Promise<StorefrontBuild> {
  const inputs = parseBuildInputs(raw);
  // Байты кода — до рендера: нет ядра или скрипта — ошибка, рендер не начинали.
  checkCodeAssets(inputs, assets);
  // Секции рендерит процесс рендера сборщика. Упавшей секции на странице нет, сборка идёт дальше (блок 2, В2-1 А); упала
  // секция с removable: false или сам процесс рендера — ошибка сборки, сборку не выкладываем.
  const page = livePageOf(assets, render, failed, notice, classUnknown);
  // Главная и свои страницы (часть 4 блока 1 «Секций и SDK») и страницы записей (часть 8б).
  const shopPages = await shopPagesOf(inputs, theme, page);
  const standPages = theme.stand === undefined ? [] : [await renderStandPage(inputs, theme.stand)];
  const pages = [...shopPages, ...standPages];
  // Страницы 404 и 502 (блок 7, часть 7а) и оформление заказа (блок 10, часть 10а): файлы есть в сборке, строк
  // страниц в манифесте нет.
  const special = await specialFiles(inputs, theme, page);
  const checkout = await checkoutFiles(inputs, theme, page);
  const files = allFilesOf(inputs, theme, pages, shopPages, special, checkout);
  // Файлы шрифтов (блок 12) — только в манифесте: байты уже в хранилище по отпечатку, их не льём.
  const fontFiles = shopFonts(inputs, theme.tokens, theme.migrations).files.map(
    (file) => [file.path, file.hash] as const,
  );
  const manifest = manifestOf(inputs, references, files, fontFiles, pages);
  return { manifest, files };
}

// Политика CSP магазина (блок 13 «Секций и SDK», часть 13б): по файлам сборки, адресам и аналитике; длиннее предела —
// null, поля в манифесте нет.
const cspOf = (inputs: BuildInputs, files: Readonly<Record<string, string>>): string | null =>
  storefrontCsp({
    files,
    apiUrl: inputs.env.apiUrl,
    analyticsUrl: inputs.env.analyticsUrl,
    counters: countersOf(inputs.data.entities),
    custom: customCodesOf(inputs.data.entities),
  });

// Манифест сборки: ключи, версии, сущности и файлы — по списку файлов сборки и шрифтов.
function manifestOf(
  inputs: BuildInputs,
  references: BuildReferences,
  files: readonly BuildFile[],
  fontFiles: readonly (readonly [string, string])[],
  pages: readonly RenderedPage[],
): ReturnType<typeof checkManifest> {
  const fileHashes = Object.fromEntries([
    ...files.map((file) => [file.path, sha256(file.content)] as const),
    ...fontFiles,
  ]);
  const csp = cspOf(inputs, fileHashes);
  return checkManifest({
    v: MANIFEST_VERSION,
    key: buildKey(inputs),
    dataKey: dataKey(inputs),
    platform: { commit: references.platformCommit, renderHash: inputs.platform.renderHash },
    ...(references.extensions === undefined ? {} : { extensions: references.extensions }),
    theme: inputs.theme,
    shell: inputs.shell === null ? null : { version: inputs.shell.version },
    shop: { id: inputs.site.id },
    entities: entityHashes(inputs),
    files: fileHashes,
    pages: pages.map((page) => page.row),
    ...(csp === null ? {} : { csp }),
  });
}
