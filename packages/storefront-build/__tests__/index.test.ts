import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

// Публичный API пакета (README, раздел «API»): значения, которые видит потребитель. Типы TypeScript сюда не попадают.
const API = [
  'ENTITY_TYPES',
  'KEY_VERSION',
  'MANIFEST_VERSION',
  'PAGE_ENTITY_TYPES',
  'PLATFORM_RENDER_FILES',
  'REBUILD_EVENT_INPUTS',
  'RENDER_GUARD_RULES',
  'SEO_LIMIT_BYTES',
  'SHOP_ROUTES',
  'StorefrontBuildError',
  'THEME_FILES',
  'THEME_VERSION_TEXT',
  'buildJsonOf',
  'buildKey',
  'buildRendererBundle',
  'buildStorefront',
  'canonicalJson',
  'changedEntities',
  'checkManifest',
  'checkPageRow',
  'checkSeo',
  'checkThemeVersion',
  'dependentPages',
  'entityHashes',
  'entityKey',
  'hashOf',
  'manifestSchema',
  'parseBuildInputs',
  'parseThemeVersions',
  'platformRenderHash',
  'readClientFiles',
  'readShopSources',
  'readThemeState',
  'readThemeVersions',
  'renderGuardProblems',
  'renderShopPage',
  'routeOf',
  'seoProblems',
  'sha256',
  'startRenderer',
  'themeRenderFiles',
  'themeVersionStatus',
];

describe('API пакета', () => {
  it('отдаёт ровно то, что описано в README', () => {
    expect(Object.keys(api).sort()).toEqual([...API].sort());
  });
});
