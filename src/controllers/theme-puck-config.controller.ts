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
 * Loader: dynamically imports a block's index.ts from packages/theme-base.
 * The path field in BaseBlockEntry is the block name (e.g. "Hero"); we resolve
 * it to the on-disk TS source here.
 */
const blockLoader: BlockConfigLoader = async (blockName: string) => {
  const absPath = resolve(
    __dirname,
    '..',
    '..',
    'packages',
    'theme-base',
    'blocks',
    blockName,
    'index.ts',
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(absPath) as Record<string, unknown>;
};

/**
 * GET /api/themes/:id/puck-config — Phase 1c Task 3a (revised).
 *
 * Returns the Puck editor config as JSON. Constructor fetches and wires its
 * own React render function client-side (see constructor/src/lib/puckConfigResolver.ts).
 *
 * The themeId param is currently accepted but unused: all 25 base blocks are
 * always exposed. Future work will apply theme-specific overrides/variants via
 * ThemesService + resolveBlocks.
 */
@Controller('api/themes/:themeId/puck-config')
export class ThemePuckConfigController {
  @Get()
  async getPuckConfig(
    @Param('themeId') _themeId: string,
  ): Promise<PuckConfigJson> {
    const resolvedBlocks = resolveBlocks(BASE_BLOCKS, DEFAULT_THEME_CONFIG);
    const puckConfig = await resolveConstructorConfig(
      resolvedBlocks,
      blockLoader,
    );

    // Strip render function — it's a placeholder (() => null) on the server
    // and cannot be JSON-serialized. Constructor re-attaches AstroBlockBridge.
    const components: Record<string, PuckComponentJson> = {};
    for (const [name, cfg] of Object.entries(puckConfig.components)) {
      components[name] = {
        label: cfg.label,
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
