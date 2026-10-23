// @merfy/storefront-build — ключ сборки и манифест магазина новой темы (design.md блока 4): входы и ключ, сборка
// «входы → файлы + манифест», страница по запросу, граф «страница ← данные», рисовальщик темы, отпечатки и сторожа.

// Входы, ключ, сборка
export {
  ENTITY_TYPES,
  parseBuildInputs,
  type BuildInputs,
  type CodeInput,
  type CodeInstance,
  type CodeSection,
  type Entity,
  type EntityType,
  type RevisionPage,
  type ShellInput,
} from './inputs';
export { DATA_KEY_VERSION, KEY_VERSION, buildKey, dataKey } from './key';
export { entityHashes, entityKey } from './entities';
export { buildStorefront, type BuildReferences, type StorefrontBuild, type ThemeBuild } from './build';
export { pagePropsOf, renderShopPage, type RenderPage, type RenderedPage, type ShopTheme } from './page';
export { SHOP_ROUTES, routeOf, type ShopRoute } from './routes';
export { REBUILD_EVENT_INPUTS } from './event-inputs';

// Код секций (блок 7) и бандл страницы (блок 5 «Секций и SDK», часть 5б)
export { NO_ASSETS, type CodeAssets } from './code';
export {
  BUNDLE_DIR,
  BUNDLE_INLINE_MAX_BYTES,
  PAGE_SCRIPT_WARN_BYTES,
  type CodeNotice,
  type CodeNoticed,
} from './bundle';
export { SECTION_INPUT_MAX_BYTES } from './input-tag';

// Секции SDK 1: рендер экземпляров и CSS секций (блок 1 «Секций и SDK»)
export {
  EMPTY_PAGE_CONTENT,
  LIVE_PAGE,
  NO_SECTIONS,
  PAGE_SECTIONS_BYTES,
  RENDER_STAGES,
  WRAPPER_CLASS,
  renderPlacedSections,
  renderSection,
  type MenuTree,
  type MenuTreeItem,
  type PageContent,
  type PageMode,
  type PageProps,
  type PageRender,
  type PlacedSection,
  type RenderBlock,
  type RenderSection,
  type RenderStage,
  type SectionFailed,
  type SectionFailure,
  type SectionRenderRequest,
  type SectionsRender,
  type SettingValues,
} from './sections-render';
export { htmlClasses, sectionCss } from './section-css';
export { type ShopProps } from './shop-props';
export { SHELL_DIST, readShellBuild, type ShellBuild } from './shell';

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

// Журнал версий темы (блок 10)
export {
  changelogProblems,
  changelogSchema,
  lookTokensBetween,
  parseChangelog,
  searchFlaggedBetween,
  type Changelog,
  type ChangelogEntry,
} from './changelog';

// Рисовальщик темы
export { buildRendererBundle, type RendererBundle } from './theme-build';
export { STAND_PAGE_PATH, startRenderer, type Renderer } from './renderer';
export { readClientFiles, type BuildFile } from './client-files';
export type { ShopPageHead, ShopPageLocals, StandPageHead, StandPageLocals } from './locals';

// Стенд темы в превью конструктора (блок 8)
export {
  previewTokens,
  standLocals,
  type PreviewTokens,
  type StandBuild,
  type StandInputs,
  type StandTheme,
  type StandView,
} from './stand';
export { FONT_LIBRARY_HASH, FONT_REGISTRY } from './fonts';
export type { FontFileEntry, FontRegistry } from '@merfy/tokens';
export { shopFonts } from './head';
export { PREVIEW_AGENT } from './preview-agent';
export { PREVIEW_SECTIONS_AGENT } from './preview-sections-agent';

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

// Один Tailwind для проверки классов и сборки (блок 4 «Секций и SDK», Р4-3).
export { classSystem, type ClassSystem } from './tailwind-system';

// Токены секций в сборке и превью (блок 4 «Секций и SDK», Р4-10, Р4-11).
export { pageSectionTheme, shopSectionTokensCss, type TokenedSection } from './section-tokens';
