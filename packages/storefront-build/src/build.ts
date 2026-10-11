import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { NO_ASSETS, codeFiles, type CodeAssets } from './code';
import { entityHashes } from './entities';
import { parseBuildInputs } from './inputs';
import { buildKey } from './key';
import { MANIFEST_VERSION, checkManifest, type StorefrontManifest } from './manifest';
import { renderShopPage, type ShopTheme } from './page';
import { SHOP_ROUTES } from './routes';
import { renderStandPage, type StandBuild } from './stand';

// Справки сборки: в ключ не входят, в манифест пишутся. Коммит платформы — SOURCE_COMMIT образа sites (В4-1 В).
export interface BuildReferences {
  platformCommit: string;
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
export async function buildStorefront(
  raw: unknown,
  references: BuildReferences,
  theme: ThemeBuild,
  assets: CodeAssets = NO_ASSETS,
): Promise<StorefrontBuild> {
  const inputs = parseBuildInputs(raw);
  // Файлы кода — до рендера: нет ядра или скрипта — ошибка, рисовать не начинали.
  const code = codeFiles(inputs, assets);
  const shopPages = await Promise.all(SHOP_ROUTES.map((route) => renderShopPage(inputs, route.path, theme)));
  const standPages = theme.stand === undefined ? [] : [await renderStandPage(inputs, theme.stand)];
  const pages = [...shopPages, ...standPages];
  const files = [...theme.clientFiles, ...code, ...pages.map((page) => page.file)].sort(byPath);
  const manifest = checkManifest({
    v: MANIFEST_VERSION,
    key: buildKey(inputs),
    platform: { commit: references.platformCommit, renderHash: inputs.platform.renderHash },
    theme: inputs.theme,
    shell: inputs.shell === null ? null : { version: inputs.shell.version },
    shop: { id: inputs.site.id },
    entities: entityHashes(inputs),
    files: Object.fromEntries(files.map((file) => [file.path, sha256(file.content)])),
    pages: pages.map((page) => page.row),
  });
  return { manifest, files };
}
