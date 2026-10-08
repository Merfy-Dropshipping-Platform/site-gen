import { sha256 } from './canonical';
import type { BuildFile } from './client-files';
import { entityHashes } from './entities';
import { parseBuildInputs } from './inputs';
import { buildKey } from './key';
import { MANIFEST_VERSION, checkManifest, type StorefrontManifest } from './manifest';
import { renderShopPage, type ShopTheme } from './page';
import { SHOP_ROUTES } from './routes';

// Справки сборки: в ключ не входят, в манифест пишутся. Коммит платформы — SOURCE_COMMIT образа sites (В4-1 В).
export interface BuildReferences {
  platformCommit: string;
}

// Тема для сборки магазина: токены, рисовальщик и файлы клиента её серверной сборки.
export interface ThemeBuild extends ShopTheme {
  clientFiles: readonly BuildFile[];
}

export interface StorefrontBuild {
  manifest: StorefrontManifest;
  files: BuildFile[];
}

// Пути файлов разные: страницы — *.html, файлы клиента — то, что собрал Astro.
const byPath = (left: BuildFile, right: BuildFile): number => (left.path < right.path ? -1 : 1);

// Сборка магазина новой темы (design.md блока 4, раздел 1) — функция «входы → файлы + манифест». Каждая страница
// рисуется так же, как по запросу (renderShopPage); файлы клиента темы идут как есть. Ни часов, ни случайного:
// одинаковые входы — одинаковые файлы, ключ и манифест.
export async function buildStorefront(
  raw: unknown,
  references: BuildReferences,
  theme: ThemeBuild,
): Promise<StorefrontBuild> {
  const inputs = parseBuildInputs(raw);
  const pages = await Promise.all(SHOP_ROUTES.map((route) => renderShopPage(inputs, route.path, theme)));
  const files = [...theme.clientFiles, ...pages.map((page) => page.file)].sort(byPath);
  const manifest = checkManifest({
    v: MANIFEST_VERSION,
    key: buildKey(inputs),
    platform: { commit: references.platformCommit, renderHash: inputs.platform.renderHash },
    theme: inputs.theme,
    shell: inputs.shell,
    shop: { id: inputs.site.id },
    entities: entityHashes(inputs),
    files: Object.fromEntries(files.map((file) => [file.path, sha256(file.content)])),
    pages: pages.map((page) => page.row),
  });
  return { manifest, files };
}
