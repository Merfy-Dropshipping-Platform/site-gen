/**
 * Types for the real theme source + compiled snapshot
 * (`loadThemeSourceSnapshot`). The snapshot records enough facts to prove the
 * compile → loader → assembler reachability of every block WITHOUT inferring
 * support from comments or filename regexes.
 *
 * Determinism rule: volatile metadata (manifest `compiledAt`, absolute source
 * paths embedded in compiled `.mjs`) is NEVER serialized. Compiled artifacts
 * contribute only sorted repo-relative module identity plus import/default-
 * export success or a normalized failure code. Source digests hash the original
 * repo bytes instead.
 */

import type { SupportedConformanceTheme } from './theme-adapter';

// ---------------------------------------------------------------------------
// Source adapter — the provenance-boundary metadata for one theme's source.
// ---------------------------------------------------------------------------

/**
 * An external repository whose audited ref informs a Satin requirement but which
 * site-gen CI never reads. This is EVIDENCE-ONLY literal metadata: it records
 * the exact SHA a human reviewer audited, and asserts nothing about CI having
 * exercised that repository. The outer Merfy repo and sibling repositories are
 * never read by the digest code.
 */
export interface ExternalAuditRef {
  repository: 'MerfyFrontend' | 'orders' | 'api-gateway';
  ref: string;
  scope: readonly string[];
  evidenceOnly: true;
}

/**
 * A theme's source adapter: the exact repo-relative roots + digest partition for
 * ONE theme. It carries no snapshot logic — only the metadata the generic
 * `loadThemeSourceSnapshot` needs to hash the right bytes and resolve the right
 * artifacts. Every path is repo-relative and normalized as a child of the sites
 * worktree; a theme name can never smuggle an arbitrary filesystem root.
 *
 * Provenance boundary (the central rule of this file):
 *  - `themeDigestInputs` may reference ONLY the selected theme's owned files
 *    (its descriptor, source adapter, release contract, generator registry,
 *    package/standalone bytes and tracked normative artifacts).
 *  - `sharedDigestInputs` are IDENTICAL for Bloom/Satin and enumerate the
 *    generic implementation + central registry wiring + workspace topology.
 * No digest input hashes a directory merely because it contains conformance
 * code; the partition is explicit, not a glob over `src/themes/conformance/**`.
 */
export interface ThemeSourceAdapter<T extends SupportedConformanceTheme> {
  theme: T;
  packageRoot: `packages/theme-${T}`;
  standaloneRoot: `themes/${T}`;
  sectionMapPath: `themes/${T}/sections.map.json`;
  generatorRegistryPath: `src/generator/registries/${T}.ts`;
  /**
   * A REQUIRED SUBSET of the theme's runtime sources (layouts/lib/pages/scripts),
   * repo-relative. Recursive route discovery adds every additional `.astro`/`.js`
   * route; this list is a floor, never a filter.
   */
  requiredRuntimeSources: readonly string[];
  /** repo-relative dirs whose compiled `.mjs` prove renderer/section reach. */
  compiledArtifactRoots: readonly string[];
  /** theme-owned bytes — input ONLY to this theme's digest. */
  themeDigestInputs: readonly string[];
  /** shared generic core — identical across bloom/satin. */
  sharedDigestInputs: readonly string[];
  /** evidence-only external audit refs; never read by CI digest code. */
  externalAudits: readonly ExternalAuditRef[];
}

/** The full source-adapter registry: every supported theme mapped to its adapter. */
export type ThemeSourceAdapterMap = {
  readonly [T in SupportedConformanceTheme]: ThemeSourceAdapter<T>;
};

/** Normalized policy code for a package `validateBlock` message (F-041). */
export type BlockPolicyCode =
  | "forbidden-tsx"
  | "color-hex"
  | "color-rgb"
  | "color-hsl"
  | "unclassified";

/** Five-file block anatomy presence (missing-file codes come from here). */
export interface BlockAnatomy {
  puckConfig: boolean;
  tokens: boolean;
  classes: boolean;
  astro: boolean;
  index: boolean;
}

/** A physical block found under blocks/ or customBlocks/, keyed by (location,name). */
export interface PhysicalBlockRecord {
  location: "blocks" | "customBlocks";
  name: string;
  /** repo-relative directory of the block. */
  dir: string;
  anatomy: BlockAnatomy;
  /** Normalized async `validateBlock` policy result. */
  policy: {
    ok: boolean;
    codes: BlockPolicyCode[];
    /** Missing five-file names (already represented by anatomy; kept sorted). */
    missingFiles: string[];
  };
}

/** Resolution of a canonical block through the extracted resolver. */
export interface BlockResolutionRecord {
  name: string;
  /** 'base' | 'theme' — from resolveBlocks against the Bloom manifest. */
  source: string;
  /** path field (block name for base, ./blocks/<Name> for theme override). */
  path: string;
  /** Package the compiled loader artifact belongs to (theme-base for base). */
  pkg: string;
  /** Flat loader artifact `<pkg>__<name>__index.mjs`. */
  loaderArtifact: string;
}

/** A compiled module's normalized identity + import outcome. */
export interface CompiledModuleRecord {
  /** Sorted repo-relative module identity (dist path relative to sites root). */
  module: string;
  /** true when `import()` yielded a REAL default export ({} import = failure). */
  defaultExport: boolean;
  /** Sorted named exports (Puck-index config modules succeed on these). */
  namedExports: string[];
  /** Normalized failure code when the import failed / had no export. */
  failure?: "no-default" | "import-error" | "missing";
}

/** Generator registry entry with its real importPath + assembler destination. */
export interface RegistryReachabilityRecord {
  name: string;
  importPath: string;
  /** Assembler destination the importPath implies (src/components/... etc.). */
  assemblerDestination: string;
  /** true when a physical source block exists to feed that destination. */
  physicalSourcePresent: boolean;
}

/**
 * One `themes/<t>/sections.map.json` entry with its mapped-renderer reachability.
 * A mapped block is proved reachable ONLY by importing the exact Satin renderer
 * the compiled section manifest names for it; a passing base renderer can never
 * mask a mapped-renderer failure.
 */
export interface SectionsMapRecord {
  /** canonical section key (Header, Hero, Catalog, …). */
  name: string;
  /** value in the standalone sections.map.json (the source-side mapping). */
  sourceTarget: string;
  /** the compiled section module the manifest names, repo-relative (or null). */
  compiledModule: string | null;
  /** whether the standalone source file the map points at exists on disk. */
  sourceExists: boolean;
  /** true only when the exact mapped compiled module imports with a default. */
  mappedRendererReachable: boolean;
}

/** Presence of one required runtime source (repo-relative). */
export interface RequiredRuntimeSourceRecord {
  path: string;
  present: boolean;
}

/** A discovered standalone Astro/JS route (recursive, dynamic segments kept). */
export interface StandaloneRouteRecord {
  /** repo-relative source file. */
  file: string;
  /** true when the file name/path contains a `[...]` / `[x]` dynamic segment. */
  dynamic: boolean;
}

/** Cart-drawer descriptor: which resolver globals a fixture produces + reach. */
export interface CartDrawerDescriptor {
  /** Globals produced by resolveCartDrawerGlobals for the fixture. */
  globals: Record<string, string>;
  /** Call-site reachability observed on the target ref. */
  reachability: {
    v2Sections: boolean;
    builtTheme: boolean;
    liveBuild: boolean;
  };
}

export interface ThemeSourceSnapshot {
  themeId: string;
  /** raw theme.json AFTER validation (pages/blockDefaults retained). */
  themeJson: unknown;
  /** normalized validateThemeV2 result for the real package. */
  themeValidation: { ok: boolean; errors: string[]; warnings: string[] };
  /** normalized, sorted page slugs from theme.json pages registry. */
  pageSlugs: string[];
  /** true when the checkout-result / OrderConfirmation route is present. */
  hasCheckoutResultPage: boolean;
  /** canonical block resolutions (Benefits, Catalog, …). */
  resolutions: BlockResolutionRecord[];
  /** physical blocks keyed by (location,name) so duplicates cannot overwrite. */
  physicalBlocks: PhysicalBlockRecord[];
  /** generator registry reachability records. */
  registry: RegistryReachabilityRecord[];
  /**
   * Registry renderer names whose REAL compiled artifact imports with a genuine
   * default export. Mapped renderers resolve through the compiled theme-section
   * manifest (`dist/theme-sections/<theme>/<file>.mjs`); unmapped renderers
   * resolve through `resolveBlockArtifact` to
   * `dist/astro-blocks/<pkg>__<Block>__<Block>.mjs`. A renderer whose compiled
   * module genuinely fails to import / lacks a default export is omitted so it
   * remains a real `renderer-unreachable` finding.
   */
  renderersReachable: string[];
  /** required theme runtime source files (repo-relative, sorted). */
  runtimeSources: string[];
  /**
   * Presence of every adapter-declared required runtime source (repo-relative,
   * sorted by path). A missing entry is a real, reported structural fact — this
   * NEVER silently drops a required source.
   */
  requiredRuntimeSources: RequiredRuntimeSourceRecord[];
  /**
   * Every `themes/<t>/sections.map.json` entry with mapped-renderer reachability.
   * Empty for Bloom (Bloom uses the generator registry, not a sections map).
   */
  sectionsMap: SectionsMapRecord[];
  /**
   * The standalone Astro/JS route tree discovered recursively under
   * `themes/<t>/src/pages`, dynamic segments retained. Sorted by file.
   */
  standaloneRoutes: StandaloneRouteRecord[];
  /** presence of the standalone live output index.html files. */
  standaloneOutputs: { liveIndexHtml: boolean; themeDistIndexHtml: boolean };
  /** compiled Puck index + mapped/package renderer import outcomes. */
  compiledModules: CompiledModuleRecord[];
  /** the mapped Bloom Publications renderer observed contract. */
  publications: {
    /** repo-relative compiled section module identity. */
    module: string;
    /** observed normalization for a fixed probe set. */
    probes: Array<{
      props: Record<string, unknown>;
      columns: number;
      cards: number;
    }>;
  };
  /** generated Bloom preview-cart script + cart-drawer descriptors. */
  previewCart: {
    /** byte-stable generated demo script. */
    script: string;
    /** SHA-256 of the generated script. */
    scriptDigest: string;
  };
  cartDrawer: CartDrawerDescriptor;
  /** deterministic SHA-256 per source artifact. */
  sourceDigests: Record<string, string>;
  /** single rolled-up digest over all tracked source bytes + identities. */
  sourceDigest: string;
}
