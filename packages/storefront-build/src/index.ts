// @merfy/storefront-build — ключ сборки и манифест магазина новой темы (design.md блока 4): входы и ключ, сборка
// «входы → файлы + манифест», страница по запросу, граф «страница ← данные», рисовальщик темы, отпечатки и сторожа.

// Входы, ключ, сборка
export { ENTITY_TYPES, parseBuildInputs, type BuildInputs, type Entity, type EntityType } from './inputs';
export { KEY_VERSION, buildKey } from './key';
export { entityHashes, entityKey } from './entities';
export { buildStorefront, type BuildReferences, type StorefrontBuild, type ThemeBuild } from './build';
export { renderShopPage, type RenderPage, type RenderedPage, type ShopTheme } from './page';
export { SHOP_ROUTES, routeOf, type ShopRoute } from './routes';
export { REBUILD_EVENT_INPUTS } from './event-inputs';

// Манифест, граф, build.json
export {
  MANIFEST_VERSION,
  PAGE_ENTITY_TYPES,
  checkManifest,
  checkPageRow,
  manifestSchema,
  type PageEntityType,
  type PageRow,
  type StorefrontManifest,
} from './manifest';
export { changedEntities, dependentPages } from './graph';
export { buildJsonOf } from './build-json';

// Рисовальщик темы
export { buildRendererBundle, type RendererBundle } from './theme-build';
export { STAND_PAGE_PATH, startRenderer, type Renderer } from './renderer';
export { readClientFiles, type BuildFile } from './client-files';
export type { ShopPageHead, ShopPageLocals, StandPageHead, StandPageLocals } from './locals';

// Стенд темы в превью конструктора (блок 8)
export { previewTokens, standLocals, type PreviewTokens, type StandInputs, type StandTheme } from './stand';
export { PREVIEW_AGENT } from './preview-agent';

// Отпечатки, версии тем, сторожа
export { PLATFORM_RENDER_FILES, THEME_FILES, platformRenderHash, themeRenderFiles } from './render-files';
export {
  THEME_VERSION_TEXT,
  checkThemeVersion,
  parseThemeVersions,
  readThemeState,
  readThemeVersions,
  themeVersionStatus,
  type ThemeState,
  type ThemeVersionStatus,
  type ThemeVersions,
} from './theme-version';
export { RENDER_GUARD_RULES, readShopSources, renderGuardProblems, type SourceFile } from './render-guard';
export { SEO_LIMIT_BYTES, checkSeo, seoProblems } from './seo';
export { canonicalJson, hashOf, sha256 } from './canonical';
export { StorefrontBuildError, type StorefrontBuildErrorCode } from './errors';
