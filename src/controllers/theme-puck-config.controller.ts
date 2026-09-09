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
// Canonical base-block catalog — extracted so the controller and the
// conformance source snapshot share ONE source of truth (no silent drift).
import { THEME_PUCK_BASE_BLOCKS } from '../themes/theme-puck-block-catalog';
// Path/package resolution extracted so conformance can ask the SAME helper
// whether a canonical block artifact is reachable.
import { resolveBlockArtifact } from '../themes/block-artifact-resolver';
// 097: same deep-merge used server-side in preview.service.ts so constructor
// frontend receives theme.json blockDefaults as part of defaultProps. Single
// source of truth for merge semantics across both render paths.
import { deepMergeBlockProps } from '../services/preview.service';
// Фаза 3 «Цвета»: конвертер theme.json-схемы ({id,name,tokens} c rgb-триплетами)
// в merchant-hex shape ({background,heading,primaryButton{…},…}) — тот же,
// что использует buildTokensCss при сидировании схем на live-рендере.
import { themeSchemeToMerchantShape } from '../themes/tokens-css';
// Theme manifests — imported via TS resolveJsonModule so JSON content is
// INLINED into compiled JS at build time (no runtime file lookup). Required
// because nest-cli doesn't copy packages/*/theme.json into dist/ (relative
// require() from dist/src/controllers/ would miss dist/packages/theme-*).
import roseManifestJsonRaw from '../../packages/theme-rose/theme.json';
import vanillaManifestJsonRaw from '../../packages/theme-vanilla/theme.json';
import bloomManifestJsonRaw from '../../packages/theme-bloom/theme.json';
import satinManifestJsonRaw from '../../packages/theme-satin/theme.json';
import fluxManifestJsonRaw from '../../packages/theme-flux/theme.json';
import { getThemeManifest as sharedThemeManifest } from '../themes/theme-manifest-loader';


// Единая точка чтения манифеста. Раньше здесь лежала ВТОРАЯ копия импортов
// theme.json, из-за чего правка манифеста применялась в одних местах и не
// применялась в других: рендер уже видел новое значение, а этот контроллер
// продолжал отдавать конструктору старое (`resolveJsonModule` инлайнит JSON
// на сборке). Читаем через общий загрузчик — он вне production берёт исходник
// с диска, — а собранная копия остаётся запасным вариантом.
function liveManifest(themeId: string, compiled: unknown): ThemeConfigForResolver {
  return (sharedThemeManifest(themeId) ?? compiled) as unknown as ThemeConfigForResolver;
}

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
  /** 100: CSS-token defaults темы (theme.json `defaults`). */
  defaults?: Record<string, string>;
  /**
   * Фаза 3 «Цвета»: дефолтные цветовые схемы темы (theme.json `colorSchemes`)
   * в merchant-hex shape ({id,name,background,heading,primaryButton{…},…}).
   * Конструктор сидирует ими ThemeContext вместо hardcode-палитры, когда у
   * ревизии нет merchant-схем. Для legacy themeId без манифеста — пустой массив.
   */
  colorSchemes?: Array<Record<string, unknown>>;
}

/**
 * Registry of the base blocks shipped by @merfy/theme-base. Paths are
 * resolved relative to this controller at runtime (packages/ lives alongside
 * src/ in the sites service). This mirrors the pattern used by
 * `generator/theme-bridge.ts` which references the same packages via
 * shape-matching rather than `@merfy/*` imports (the sub-repo doesn't have
 * pnpm-workspace access to @merfy/* as installed node_modules).
 *
 * The catalog itself lives in `src/themes/theme-puck-block-catalog.ts` so the
 * conformance source snapshot can consume the identical list.
 */
const BASE_BLOCKS: Record<string, BaseBlockEntry> = THEME_PUCK_BASE_BLOCKS;

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
      blocks: liveManifest('rose', roseManifestJsonRaw).blocks ?? {},
      features: liveManifest('rose', roseManifestJsonRaw).features ?? {},
      customBlocks: liveManifest('rose', roseManifestJsonRaw).customBlocks ?? {},
      // 097: blockDefaults survives manifest pass-through so /api/themes/:id/puck-config
      // can merge theme blockDefaults в Catalog.defaultProps (otherwise constructor
      // получает universal-only defaults и затирает theme-specific values на edit).
      blockDefaults: (liveManifest('rose', roseManifestJsonRaw) as any).blockDefaults ?? {},
      // Плейсхолдеры полей панели (см. applyPlaceholders ниже) — тот же текст,
      // что порт рендерит заглушкой, чтобы инпут не выглядел пустым.
      blockPlaceholders: (liveManifest('rose', roseManifestJsonRaw) as any).blockPlaceholders ?? {},
      defaults: (liveManifest('rose', roseManifestJsonRaw) as any).defaults ?? {},
      colorSchemes: liveManifest('rose', roseManifestJsonRaw).colorSchemes ?? [],
    };
  }
  if (themeId === 'vanilla') {
    return {
      blocks: liveManifest('vanilla', vanillaManifestJsonRaw).blocks ?? {},
      features: liveManifest('vanilla', vanillaManifestJsonRaw).features ?? {},
      customBlocks: liveManifest('vanilla', vanillaManifestJsonRaw).customBlocks ?? {},
      blockDefaults: (liveManifest('vanilla', vanillaManifestJsonRaw) as any).blockDefaults ?? {},
      // Плейсхолдеры полей панели (см. applyPlaceholders ниже) — тот же текст,
      // что порт рендерит заглушкой, чтобы инпут не выглядел пустым.
      blockPlaceholders: (liveManifest('vanilla', vanillaManifestJsonRaw) as any).blockPlaceholders ?? {},
      defaults: (liveManifest('vanilla', vanillaManifestJsonRaw) as any).defaults ?? {},
      colorSchemes: liveManifest('vanilla', vanillaManifestJsonRaw).colorSchemes ?? [],
    };
  }
  if (themeId === 'bloom') {
    return {
      blocks: liveManifest('bloom', bloomManifestJsonRaw).blocks ?? {},
      features: liveManifest('bloom', bloomManifestJsonRaw).features ?? {},
      customBlocks: liveManifest('bloom', bloomManifestJsonRaw).customBlocks ?? {},
      blockDefaults: (liveManifest('bloom', bloomManifestJsonRaw) as any).blockDefaults ?? {},
      // Плейсхолдеры полей панели (см. applyPlaceholders ниже) — тот же текст,
      // что порт рендерит заглушкой, чтобы инпут не выглядел пустым.
      blockPlaceholders: (liveManifest('bloom', bloomManifestJsonRaw) as any).blockPlaceholders ?? {},
      defaults: (liveManifest('bloom', bloomManifestJsonRaw) as any).defaults ?? {},
      colorSchemes: liveManifest('bloom', bloomManifestJsonRaw).colorSchemes ?? [],
    };
  }
  if (themeId === 'satin') {
    return {
      blocks: liveManifest('satin', satinManifestJsonRaw).blocks ?? {},
      features: liveManifest('satin', satinManifestJsonRaw).features ?? {},
      customBlocks: liveManifest('satin', satinManifestJsonRaw).customBlocks ?? {},
      blockDefaults: (liveManifest('satin', satinManifestJsonRaw) as any).blockDefaults ?? {},
      // Плейсхолдеры полей панели (см. applyPlaceholders ниже) — тот же текст,
      // что порт рендерит заглушкой, чтобы инпут не выглядел пустым.
      blockPlaceholders: (liveManifest('satin', satinManifestJsonRaw) as any).blockPlaceholders ?? {},
      defaults: (liveManifest('satin', satinManifestJsonRaw) as any).defaults ?? {},
      colorSchemes: liveManifest('satin', satinManifestJsonRaw).colorSchemes ?? [],
    };
  }
  if (themeId === 'flux') {
    return {
      blocks: liveManifest('flux', fluxManifestJsonRaw).blocks ?? {},
      features: liveManifest('flux', fluxManifestJsonRaw).features ?? {},
      customBlocks: liveManifest('flux', fluxManifestJsonRaw).customBlocks ?? {},
      blockDefaults: (liveManifest('flux', fluxManifestJsonRaw) as any).blockDefaults ?? {},
      // Плейсхолдеры полей панели (см. applyPlaceholders ниже) — тот же текст,
      // что порт рендерит заглушкой, чтобы инпут не выглядел пустым.
      blockPlaceholders: (liveManifest('flux', fluxManifestJsonRaw) as any).blockPlaceholders ?? {},
      defaults: (liveManifest('flux', fluxManifestJsonRaw) as any).defaults ?? {},
      colorSchemes: liveManifest('flux', fluxManifestJsonRaw).colorSchemes ?? [],
    };
  }
  return DEFAULT_THEME_CONFIG;
}

/**
 * Dedupe concurrent dynamic imports of the same astro-block artifact.
 * Nest compiles this controller to CJS; parallel HTTP requests that hit
 * `import(absPath)` for the same .mjs (notably Video) can trip Node's
 * "Cannot require() ES Module … not yet fully loaded" race.
 */
const blockModuleLoadCache = new Map<
  string,
  Promise<Record<string, unknown>>
>();

/** In-process puck-config cache — config is static per deploy. */
const puckConfigResponseCache = new Map<string, Promise<PuckConfigJson>>();

/**
 * Build a block loader that resolves overridden blocks from the theme package
 * and everything else from @merfy/theme-base. The loader receives the `path`
 * field from ResolvedBlockEntry — for base blocks this is just the block name
 * (convention from BASE_BLOCKS), for theme overrides it's the relative path
 * declared in theme.json (e.g. "./blocks/Header" for rose).
 */
function createBlockLoader(themeId: string): BlockConfigLoader {
  // Blocks are precompiled to flat ESM by `pnpm build:blocks` (see
  // scripts/compile-astro-blocks.mjs). Layout on disk:
  //   dist/astro-blocks/<pkg>__<BlockName>__index.mjs
  // We dynamic-import them because .mjs is ESM-only; require() would fail.
  // The `resolveConstructorConfig` expects a sync-or-async loader that returns
  // a record of named exports — dynamic import's namespace object is exactly
  // that.
  //
  // Path/package resolution + flat artifact naming come from the extracted
  // `resolveBlockArtifact` (single source of truth shared with conformance).
  const blocksDir = resolve(__dirname, '..', '..', 'astro-blocks');

  return async (pathOrName: string) => {
    const { artifact } = resolveBlockArtifact(themeId, pathOrName);
    const absPath = resolve(blocksDir, artifact);

    let pending = blockModuleLoadCache.get(absPath);
    if (!pending) {
      pending = import(absPath)
        .then((mod) => mod as Record<string, unknown>)
        .catch((err: unknown) => {
          blockModuleLoadCache.delete(absPath);
          throw err;
        });
      blockModuleLoadCache.set(absPath, pending);
    }
    return pending;
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
    const cacheKey = themeId;
    let pending = puckConfigResponseCache.get(cacheKey);
    if (!pending) {
      pending = this.buildPuckConfigJson(themeId).catch((err: unknown) => {
        puckConfigResponseCache.delete(cacheKey);
        throw err;
      });
      puckConfigResponseCache.set(cacheKey, pending);
    }
    return pending;
  }

  private async buildPuckConfigJson(themeId: string): Promise<PuckConfigJson> {
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

    // 097: merge theme.json blockDefaults INTO defaultProps so constructor
    // frontend получает theme-aware defaults. Без этого Puck.defaultProps
    // содержит только universal puckConfig.ts defaults — на любой edit Puck
    // применяет их сверху user-data, затирая theme-specific values
    // (colorScheme=scheme-1 dark вместо flux scheme-2 light, отсутствие
    // categoryTitle/Subtitle/etc).
    //
    // Same deepMergeBlockProps что preview.service.ts uses — theme defaults
    // UNDER universal puckDefaults, theme wins. Constructor получит финальные
    // theme-aware defaults; Puck's edit-time merge не будет сбрасывать на
    // dark scheme.
    const themeBlockDefaults =
      (themeManifest as { blockDefaults?: Record<string, unknown> } | undefined)?.blockDefaults ?? {};

    // Плейсхолдеры полей из theme.json (`blockPlaceholders`). Порты рендерят
    // заглушку («Галерея», «Мультиряды»…) когда мерчант текст не задал, а
    // платформа считает такие строки НЕзаполненным полем (render/empty-state.ts)
    // и вычищает их из props. Из-за этого в панели инпут пустой, а на превью
    // текст есть — «несинхрон» глазами мерчанта. Отдаём тот же текст как
    // placeholder инпута: серым видно ровно то, что показывает превью.
    // Ключ — имя поля либо путь `heading.text` для objectFields.
    const themeBlockPlaceholders =
      (themeManifest as { blockPlaceholders?: Record<string, Record<string, string>> } | undefined)
        ?.blockPlaceholders ?? {};

    const applyPlaceholders = (
      fields: Record<string, unknown>,
      map: Record<string, string> | undefined,
    ): void => {
      if (!map) return;
      for (const [path, text] of Object.entries(map)) {
        const [head, sub] = path.split('.');
        const field = fields[head];
        if (!field || typeof field !== 'object') continue;
        if (sub) {
          const objectFields = (field as { objectFields?: Record<string, unknown> }).objectFields;
          const nested = objectFields?.[sub];
          if (nested && typeof nested === 'object') {
            (nested as Record<string, unknown>).placeholder = text;
          }
          continue;
        }
        (field as Record<string, unknown>).placeholder = text;
      }
    };

    // Strip render function — it's a placeholder (() => null) on the server
    // and cannot be JSON-serialized. Constructor re-attaches AstroBlockBridge.
    const components: Record<string, PuckComponentJson> = {};
    for (const [name, cfg] of Object.entries(puckConfig.components)) {
      const hydratedFields = hydrateFields(cfg.fields, cfg.defaultProps);
      // Deep-merge theme blockDefaults under puckConfig defaults so theme
      // values win for keys it specifies. Universal defaults survive for
      // keys theme doesn't override.
      const themeDefaults = (themeBlockDefaults[name] as Record<string, unknown> | undefined) ?? {};
      const mergedDefaults = deepMergeBlockProps(
        (cfg.defaultProps ?? {}) as Record<string, unknown>,
        themeDefaults,
      );
      // Плейсхолдер — подсказка для ПУСТОГО поля; значение из blockDefaults темы
      // при этом остаётся, чтобы мерчант видел в инпуте тот же текст, что на
      // превью, и мог его править (раньше дефолт здесь обнулялся, и поле
      // выглядело пустым при заполненном заголовке на экране).
      applyPlaceholders(hydratedFields as Record<string, unknown>, themeBlockPlaceholders[name]);
      components[name] = {
        label: cfg.label,
        category: componentToCategory[name] ?? 'other',
        fields: hydratedFields,
        defaultProps: mergedDefaults,
      };
    }

    // 100: CSS-token defaults из theme.json `defaults` — конструктор
    // initializes ThemeSettingsPanel slider'ы с эталонными значениями
    // темы. Без этого slider показывает только BASE_DEFAULTS (16px и т.д.)
    // вместо rose-specific (24px Logo, 8px Card radius, и т.д.).
    const themeDefaults =
      (themeManifest as { defaults?: Record<string, string> } | undefined)?.defaults ?? {};

    // Фаза 3 «Цвета»: дефолтные схемы темы в merchant-hex shape. Конструктор
    // сидирует ими палитру, когда у ревизии нет merchant colorSchemes —
    // вместо hardcode-дефолтов ThemeContext (scheme-1 чёрная). У
    // DEFAULT_THEME_CONFIG (legacy/unknown themeId) схем нет → пустой массив.
    const themeColorSchemes = (themeManifest.colorSchemes ?? []).map(
      themeSchemeToMerchantShape,
    );

    return {
      components,
      categories: puckConfig.categories ?? {},
      defaults: themeDefaults,
      colorSchemes: themeColorSchemes,
    };
  }
}

/**
 * Phase 1c hotfix — Puck's field walker crashes with
 * `Cannot read properties of undefined (reading '<subKey>')` when a field has
 * `type: 'object'` but no `objectFields`. Same for `array`/`arrayFields` and
 * `radio`/`select`/`options`.
 *
 * Theme-base block configs were authored with minimal `{ type: 'object',
 * label: '…' }` definitions on the assumption the runtime would derive the
 * sub-schema. We do that here: walk the defaultProps for each field and infer
 * (a) sub-field names and (b) primitive sub-types. For array/radio/select, we
 * synthesize empty collections so Puck doesn't trip on an `undefined` lookup.
 *
 * This is safe because:
 *  - Field VALUES still come from defaultProps or user data — inferred
 *    objectFields only describe the editor UI, not what ships to the block.
 *  - Empty options/arrayFields render as "no sub-editor" in Puck's UI (worse
 *    UX than the hand-authored config, but no crash).
 *
 * TODO(078-theme-system Phase 2): authoring-pass over theme-base to add real
 * `objectFields`/`options` so the editor UI is fully usable, not just crash-
 * free.
 */
function inferFieldTypeFromValue(value: unknown): string {
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'radio';
  if (Array.isArray(value)) return 'array';
  if (value !== null && typeof value === 'object') return 'object';
  return 'text';
}

/**
 * Recursively hydrate field definitions so Puck's walker can descend into
 * nested objects/arrays without tripping on missing `objectFields` /
 * `arrayFields`. Depth is bounded by the shape of `defaultProps` — we stop
 * recursing when there's no value to inspect.
 */
function hydrateFields(
  fields: Record<string, unknown>,
  defaultProps: unknown,
): Record<string, unknown> {
  const defaults = (defaultProps ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [fieldName, rawDef] of Object.entries(fields ?? {})) {
    const def = { ...(rawDef as Record<string, unknown>) };
    const type = def.type as string | undefined;
    const defaultVal = defaults[fieldName];

    if (type === 'object') {
      const existing = def.objectFields as Record<string, unknown> | undefined;
      const seed = existing ?? inferObjectFields(defaultVal);
      // Recurse: nested object sub-fields might themselves be objects/arrays.
      def.objectFields = hydrateFields(seed, defaultVal);
    } else if (type === 'array') {
      const first = Array.isArray(defaultVal) ? defaultVal[0] : undefined;
      const existing = def.arrayFields as Record<string, unknown> | undefined;
      const seed = existing ?? inferObjectFields(first);
      def.arrayFields = hydrateFields(seed, first);
      if (def.defaultItemProps === undefined && first !== undefined) {
        def.defaultItemProps = first;
      }
    } else if ((type === 'radio' || type === 'select') && !def.options) {
      const val = typeof defaultVal === 'string' ? defaultVal : '';
      def.options = [{ label: val || '(default)', value: val }];
    }
    out[fieldName] = def;
  }
  return out;
}

function inferObjectFields(
  value: unknown,
): Record<string, { type: string; label?: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries: Record<string, { type: string; label?: string }> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    entries[k] = { type: inferFieldTypeFromValue(v), label: k };
  }
  return entries;
}
