import { Controller, Get, Param } from '@nestjs/common';
import { resolve } from 'node:path';
import {
  resolveBlocks,
  type BaseBlockEntry,
  type ThemeConfigForResolver,
} from '../../packages/theme-contract/resolver/resolveBlocks';
import {
  resolveConstructorConfig,
  type BlockConfigLoader,
} from '../../packages/theme-contract/resolver/resolveConstructorConfig';
// Theme manifests — imported via TS resolveJsonModule so JSON content is
// INLINED into compiled JS at build time (no runtime file lookup). Required
// because nest-cli doesn't copy packages/*/theme.json into dist/ (relative
// require() from dist/src/controllers/ would miss dist/packages/theme-*).
import roseManifestJsonRaw from '../../packages/theme-rose/theme.json';
import vanillaManifestJsonRaw from '../../packages/theme-vanilla/theme.json';
import bloomManifestJsonRaw from '../../packages/theme-bloom/theme.json';
import satinManifestJsonRaw from '../../packages/theme-satin/theme.json';
import fluxManifestJsonRaw from '../../packages/theme-flux/theme.json';

const roseManifestJson = roseManifestJsonRaw as unknown as ThemeConfigForResolver;
const vanillaManifestJson = vanillaManifestJsonRaw as unknown as ThemeConfigForResolver;
const bloomManifestJson = bloomManifestJsonRaw as unknown as ThemeConfigForResolver;
const satinManifestJson = satinManifestJsonRaw as unknown as ThemeConfigForResolver;
const fluxManifestJson = fluxManifestJsonRaw as unknown as ThemeConfigForResolver;

/**
 * JSON-serializable shape of a Puck component config — render function is
 * stripped before serialization (functions are not JSON-safe). The constructor
 * wires its own React render (AstroBlockBridge) after fetching.
 */
interface PuckComponentJson {
  label: string;
  category?: string;
  fields: Record<string, unknown>;
  defaultProps: unknown;
}

export interface PuckConfigJson {
  components: Record<string, PuckComponentJson>;
  categories: Record<string, { components: string[] }>;
}

/**
 * Registry of the 25 base blocks shipped by @merfy/theme-base. Paths are
 * resolved relative to this controller at runtime (packages/ lives alongside
 * src/ in the sites service). This mirrors the pattern used by
 * `generator/theme-bridge.ts` which references the same packages via
 * shape-matching rather than `@merfy/*` imports (the sub-repo doesn't have
 * pnpm-workspace access to @merfy/* as installed node_modules).
 */
const BASE_BLOCKS: Record<string, BaseBlockEntry> = Object.fromEntries(
  [
    // 18 content blocks
    'Hero',
    'PromoBanner',
    'PopularProducts',
    'Collections',
    'Gallery',
    'Product',
    'MainText',
    'ImageWithText',
    'Slideshow',
    'MultiColumns',
    'MultiRows',
    'CollapsibleSection',
    'Newsletter',
    'ContactForm',
    'Video',
    'Publications',
    'CartSection',
    'CheckoutSection',
    // 7 chrome blocks
    'Header',
    'Footer',
    'CheckoutHeader',
    'AuthModal',
    'CartDrawer',
    'CheckoutLayout',
    'AccountLayout',
  ].map((name) => [name, { source: 'base' as const, path: name }]),
);

/**
 * Default (empty) theme config — uses base for everything. When ThemesService
 * gains theme-level block overrides, this will swap to a loader that fetches
 * the theme record by id and builds ThemeConfigForResolver from it.
 */
const DEFAULT_THEME_CONFIG: ThemeConfigForResolver = {
  blocks: {},
  features: {},
  customBlocks: {},
};

/**
 * Map a themeId to its manifest. Wired for rose, vanilla, bloom, satin, flux.
 * 'base' (and unknown ids) fall back to DEFAULT_THEME_CONFIG.
 */
function getThemeManifest(themeId: string): ThemeConfigForResolver {
  if (themeId === 'rose') {
    return {
      blocks: roseManifestJson.blocks ?? {},
      features: roseManifestJson.features ?? {},
      customBlocks: roseManifestJson.customBlocks ?? {},
    };
  }
  if (themeId === 'vanilla') {
    return {
      blocks: vanillaManifestJson.blocks ?? {},
      features: vanillaManifestJson.features ?? {},
      customBlocks: vanillaManifestJson.customBlocks ?? {},
    };
  }
  if (themeId === 'bloom') {
    return {
      blocks: bloomManifestJson.blocks ?? {},
      features: bloomManifestJson.features ?? {},
      customBlocks: bloomManifestJson.customBlocks ?? {},
    };
  }
  if (themeId === 'satin') {
    return {
      blocks: satinManifestJson.blocks ?? {},
      features: satinManifestJson.features ?? {},
      customBlocks: satinManifestJson.customBlocks ?? {},
    };
  }
  if (themeId === 'flux') {
    return {
      blocks: fluxManifestJson.blocks ?? {},
      features: fluxManifestJson.features ?? {},
      customBlocks: fluxManifestJson.customBlocks ?? {},
    };
  }
  return DEFAULT_THEME_CONFIG;
}

/**
 * Build a block loader that resolves overridden blocks from the theme package
 * and everything else from @merfy/theme-base. The loader receives the `path`
 * field from ResolvedBlockEntry — for base blocks this is just the block name
 * (convention from BASE_BLOCKS), for theme overrides it's the relative path
 * declared in theme.json (e.g. "./blocks/Header" for rose).
 */
function createBlockLoader(themeId: string): BlockConfigLoader {
  // Map themeId → package dir for override lookups. Unknown ids fall through
  // to base-only loading.
  const themePackageByThemeId: Record<string, string> = {
    rose: 'theme-rose',
    vanilla: 'theme-vanilla',
    bloom: 'theme-bloom',
    satin: 'theme-satin',
    flux: 'theme-flux',
  };

  // Blocks are precompiled to flat ESM by `pnpm build:blocks` (see
  // scripts/compile-astro-blocks.mjs). Layout on disk:
  //   dist/astro-blocks/<pkg>__<BlockName>__index.mjs
  // We dynamic-import them because .mjs is ESM-only; require() would fail.
  // The `resolveConstructorConfig` expects a sync-or-async loader that returns
  // a record of named exports — dynamic import's namespace object is exactly
  // that.
  const blocksDir = resolve(__dirname, '..', '..', 'astro-blocks');

  return async (pathOrName: string) => {
    // Theme override path starts with "./blocks/<Name>" per manifest convention.
    const themePackage = themePackageByThemeId[themeId];
    let pkg: string;
    let blockName: string;
    if (pathOrName.startsWith('./blocks/') && themePackage) {
      pkg = themePackage;
      blockName = pathOrName.split('/').pop() as string;
    } else {
      pkg = 'theme-base';
      blockName = pathOrName;
    }
    const absPath = resolve(blocksDir, `${pkg}__${blockName}__index.mjs`);
    const mod = (await import(absPath)) as Record<string, unknown>;
    return mod;
  };
}

/**
 * GET /api/themes/:id/puck-config — Phase 1c Task 3a (revised), Phase 1d Task 11.
 *
 * Returns the Puck editor config as JSON. Constructor fetches and wires its
 * own React render function client-side (see constructor/src/lib/puckConfigResolver.ts).
 *
 * Supported themeIds: rose, vanilla, bloom, satin, flux. Each ships a
 * manifest with Header + Footer block overrides (same prop shape as base).
 * For unknown themeIds, an empty manifest is used (all base blocks, no
 * overrides).
 */
@Controller('api/themes/:themeId/puck-config')
export class ThemePuckConfigController {
  @Get()
  async getPuckConfig(
    @Param('themeId') themeId: string,
  ): Promise<PuckConfigJson> {
    const themeManifest = getThemeManifest(themeId);
    const resolvedBlocks = resolveBlocks(BASE_BLOCKS, themeManifest);
    const loader = createBlockLoader(themeId);
    const puckConfig = await resolveConstructorConfig(resolvedBlocks, loader);

    // Build a reverse map from categories → component name so each component
    // carries its own `category` field (in addition to the top-level categories
    // grouping). Constructor UI reads this directly for per-block chips.
    const componentToCategory: Record<string, string> = {};
    for (const [cat, group] of Object.entries(puckConfig.categories ?? {})) {
      for (const name of group.components) {
        componentToCategory[name] = cat;
      }
    }

    // Strip render function — it's a placeholder (() => null) on the server
    // and cannot be JSON-serialized. Constructor re-attaches AstroBlockBridge.
    const components: Record<string, PuckComponentJson> = {};
    for (const [name, cfg] of Object.entries(puckConfig.components)) {
      components[name] = {
        label: cfg.label,
        category: componentToCategory[name] ?? 'other',
        fields: cfg.fields,
        defaultProps: cfg.defaultProps,
      };
    }

    return {
      components,
      categories: puckConfig.categories ?? {},
    };
  }
}
