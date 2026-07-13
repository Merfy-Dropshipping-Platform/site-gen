/**
 * Types for the real Bloom source + compiled snapshot
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
  /** required Bloom runtime source files (repo-relative, sorted). */
  runtimeSources: string[];
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
