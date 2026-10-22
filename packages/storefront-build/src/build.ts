import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { NO_ASSETS, codeFiles, type CodeAssets } from './code';
import { entityHashes } from './entities';
import { parseBuildInputs, type BuildInputs } from './inputs';
import { shopFonts } from './head';
import { buildKey, dataKey } from './key';
import { MANIFEST_VERSION, checkManifest, type StorefrontManifest } from './manifest';
import { renderShopPage, type RenderedPage, type ShopTheme } from './page';
import { SHOP_ROUTES } from './routes';
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

// Сборка магазина новой темы (design.md блока 4, раздел 1) — функция «входы → файлы + манифест». Каждая страница
// рисуется так же, как по запросу (renderShopPage); файлы клиента темы идут как есть. Ядро и скрипты секций (блок 7) —
// из assets: входы называют их отпечатками. Ни часов, ни случайного: одинаковые входы — одинаковые файлы, ключ и
// манифест.
// Страница сборки: модули рендера из активов и функция рендера процесса, режим live; упавшую секцию сборка пропускает и
// сообщает failed (блок 2 «Секций и SDK»).
const livePageOf = (assets: CodeAssets, render: RenderSection, failed?: SectionFailed): PageRender => ({
  sections: { modules: assets.renders, render },
  mode: 'live',
  failed,
});

export async function buildStorefront(
  raw: unknown,
  references: BuildReferences,
  theme: ThemeBuild,
  assets: CodeAssets = NO_ASSETS,
  render: RenderSection = NO_SECTIONS.render,
  failed?: SectionFailed,
): Promise<StorefrontBuild> {
  const inputs = parseBuildInputs(raw);
  // Файлы кода — до рендера: нет ядра или скрипта — ошибка, рисовать не начинали.
  const code = codeFiles(inputs, assets);
  // Секции рендерит процесс рендера сборщика. Упавшей секции на странице нет, сборка идёт дальше (блок 2, В2-1 А); упала
  // секция с removable: false или сам процесс рендера — ошибка сборки, сборку не выкладываем.
  const page = livePageOf(assets, render, failed);
  const shopPages = await Promise.all(SHOP_ROUTES.map((route) => renderShopPage(inputs, route.path, theme, page)));
  const standPages = theme.stand === undefined ? [] : [await renderStandPage(inputs, theme.stand)];
  const pages = [...shopPages, ...standPages];
  const files = [...theme.clientFiles, ...code, ...pages.map((page) => page.file)].sort(byPath);
  // Файлы шрифтов (блок 12) — только в манифесте: байты уже в хранилище по отпечатку, их не льём.
  const fontFiles = shopFonts(inputs, theme.tokens, theme.migrations).files.map(
    (file) => [file.path, file.hash] as const,
  );
  const manifest = manifestOf(inputs, references, files, fontFiles, pages);
  return { manifest, files };
}

// Манифест сборки: ключи, версии, сущности и файлы — по списку файлов сборки и шрифтов.
function manifestOf(
  inputs: BuildInputs,
  references: BuildReferences,
  files: readonly BuildFile[],
  fontFiles: readonly (readonly [string, string])[],
  pages: readonly RenderedPage[],
): ReturnType<typeof checkManifest> {
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
    files: Object.fromEntries([...files.map((file) => [file.path, sha256(file.content)] as const), ...fontFiles]),
    pages: pages.map((page) => page.row),
  });
}
